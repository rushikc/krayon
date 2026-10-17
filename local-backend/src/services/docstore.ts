import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { recoverStale } from '@krayon/pipeline';
import type { BatchOp, DocData, DocRecord, DocStore, DocTx, Where } from '@krayon/shared';
import { getLogger } from '../logging.js';

const log = getLogger('krayon.docstore');

const split = (docPath: string) => {
  const parts = docPath.split('/').filter(Boolean);
  if (parts.length < 2 || parts.length % 2) {
    throw new Error('A document path needs an even number of segments, e.g. users/u1/lessons/l1');
  }
  return { collection: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] ?? '' };
};

const compare = (left: unknown, op: Where[1], right: unknown) => {
  if (op === 'in') return Array.isArray(right) && right.includes(left);
  if (op === '==') return left === right;
  if (op === '!=') return left !== right;
  const a = typeof left === 'number' ? left : Number(left);
  const b = typeof right === 'number' ? right : Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  return a >= b;
};

const matches = (data: DocData, where: Where[] | undefined) => (where ?? []).every(([field, op, value]) => compare(data[field], op, value));

type Row = { collection: string; id: string; data: string; updated: number };

export class LocalDocStore implements DocStore {
  private readonly db: Database.Database;
  private tail: Promise<void> = Promise.resolve();

  constructor(dbFile: string) {
    mkdirSync(path.dirname(dbFile), { recursive: true });
    this.db = new Database(dbFile);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS docs (collection TEXT, id TEXT, data TEXT, updated REAL, PRIMARY KEY (collection, id))',
    );
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private read(docPath: string): DocRecord | null {
    const { collection, id } = split(docPath);
    const row = this.db.prepare('SELECT data, updated FROM docs WHERE collection=? AND id=?').get(collection, id) as
      | { data: string; updated: number }
      | undefined;
    if (!row) return null;
    return { id, path: docPath, data: JSON.parse(row.data) as DocData, updatedAt: row.updated };
  }

  private write(docPath: string, data: DocData, merge = false) {
    const { collection, id } = split(docPath);
    const next = merge ? { ...this.read(docPath)?.data, ...data } : data;
    const now = Date.now() / 1000;
    this.db.prepare('INSERT OR REPLACE INTO docs (collection, id, data, updated) VALUES (?,?,?,?)').run(collection, id, JSON.stringify(next), now);
  }

  private rows(): Row[] {
    return this.db.prepare('SELECT collection, id, data, updated FROM docs').all() as Row[];
  }

  private recordOf(row: Row): DocRecord {
    return {
      id: row.id,
      path: `${row.collection}/${row.id}`,
      data: JSON.parse(row.data) as DocData,
      updatedAt: row.updated,
    };
  }

  private select(where: Where[] | undefined, collection: string | null, group: string | null, opts?: { limit?: number }) {
    const found = this.rows()
      .map((row) => this.recordOf(row))
      .filter((doc) => {
        const col = doc.path.slice(0, doc.path.lastIndexOf('/'));
        if (collection !== null && col !== collection) return false;
        if (group !== null && col.split('/').at(-1) !== group) return false;
        return matches(doc.data, where);
      });
    return opts?.limit ? found.slice(0, opts.limit) : found;
  }

  private apply(ops: BatchOp[]) {
    const run = this.db.transaction(() => {
      for (const op of ops) {
        if (op.op === 'delete') {
          const { collection, id } = split(op.path);
          this.db.prepare('DELETE FROM docs WHERE collection=? AND id=?').run(collection, id);
        } else if (op.op === 'update') {
          if (!this.read(op.path)) throw new Error(`No document at ${op.path}`);
          this.write(op.path, op.data, true);
        } else this.write(op.path, op.data, op.merge);
      }
    });
    run();
  }

  get(docPath: string) {
    return this.enqueue(async () => {
      const found = this.read(docPath);
      log.debug(`get ${docPath}`, { event: 'docstore.get', path: docPath, found: Boolean(found) });
      return found;
    });
  }

  set(docPath: string, data: DocData, opts?: { merge?: boolean }) {
    return this.enqueue(async () => {
      this.write(docPath, data, opts?.merge);
      log.debug(`set ${docPath}`, { event: 'docstore.set', path: docPath, merge: Boolean(opts?.merge) });
    });
  }

  update(docPath: string, patch: DocData) {
    return this.enqueue(async () => {
      if (!this.read(docPath)) throw new Error(`No document at ${docPath}`);
      this.write(docPath, patch, true);
    });
  }

  delete(docPath: string) {
    return this.enqueue(async () => {
      const { collection, id } = split(docPath);
      const result = this.db.prepare('DELETE FROM docs WHERE collection=? AND id=?').run(collection, id);
      const deleted = result.changes > 0;
      log.debug(`delete ${docPath}`, { event: 'docstore.delete', path: docPath, deleted });
      return deleted;
    });
  }

  list(collection: string) {
    return this.enqueue(async () => {
      const col = collection.replace(/^\/+|\/+$/g, '');
      const rows = this.db.prepare('SELECT collection, id, data, updated FROM docs WHERE collection=? ORDER BY updated').all(col) as Row[];
      log.debug(`list ${col}`, { event: 'docstore.list', collection: col, count: rows.length });
      return rows.map((row) => this.recordOf(row));
    });
  }

  query(collection: string, where: Where[], opts?: { limit?: number }) {
    return this.enqueue(async () => this.select(where, collection.replace(/^\/+|\/+$/g, ''), null, opts));
  }

  collectionGroup(name: string, where: Where[], opts?: { limit?: number }) {
    return this.enqueue(async () => this.select(where, null, name, opts));
  }

  transact<T>(fn: (tx: DocTx) => Promise<T>) {
    return this.enqueue(async () => {
      const writes: BatchOp[] = [];
      const tx: DocTx = {
        get: async (docPath) => {
          const pending = [...writes].reverse().find((op) => op.path === docPath);
          if (!pending) return this.read(docPath);
          if (pending.op === 'delete') return null;
          const current = this.read(docPath);
          if (pending.op === 'set' && !pending.merge) {
            const { id } = split(docPath);
            return { id, path: docPath, data: pending.data, updatedAt: Date.now() / 1000 };
          }
          if (!current && pending.op === 'update') return null;
          const { id } = split(docPath);
          return { id, path: docPath, data: { ...current?.data, ...pending.data }, updatedAt: Date.now() / 1000 };
        },
        query: async (collection, where, opts) => this.select(where, collection, null, opts),
        set: (docPath, data, opts) => writes.push({ op: 'set', path: docPath, data, merge: opts?.merge }),
        update: (docPath, patch) => writes.push({ op: 'update', path: docPath, data: patch }),
        delete: (docPath) => writes.push({ op: 'delete', path: docPath }),
      };
      const result = await fn(tx);
      this.apply(writes);
      return result;
    });
  }

  batch(ops: BatchOp[]) {
    return this.enqueue(async () => this.apply(ops));
  }

  deleteTree(prefix: string) {
    return this.enqueue(async () => {
      const paths = this.rows()
        .map((row) => `${row.collection}/${row.id}`)
        .filter((docPath) => docPath === prefix || docPath.startsWith(`${prefix}/`));
      const run = this.db.transaction(() => {
        for (const docPath of paths) {
          const { collection, id } = split(docPath);
          this.db.prepare('DELETE FROM docs WHERE collection=? AND id=?').run(collection, id);
        }
      });
      run();
      return paths.length;
    });
  }

  /** Local admin reset. Not part of the DocStore port. */
  clear() {
    return this.enqueue(async () => {
      const rows = this.db.prepare('SELECT collection, COUNT(*) as n FROM docs GROUP BY collection').all() as Array<{
        collection: string;
        n: number;
      }>;
      this.db.prepare('DELETE FROM docs').run();
      const counts: Record<string, number> = {};
      for (const row of rows) {
        const top =
          row.collection.startsWith('users/') && row.collection.split('/').length >= 3
            ? (row.collection.split('/')[2] ?? row.collection)
            : (row.collection.split('/')[0] ?? row.collection);
        counts[top] = (counts[top] ?? 0) + row.n;
      }
      log.debug('clear', { event: 'docstore.clear', counts });
      return counts;
    });
  }

  /**
   * After a restart: interrupted jobs become errors; a chapter mid-write goes back to pending; a lesson
   * mid-render goes back to queued, and its unfinished segments to pending (ready segments are kept).
   */
  recoverInterrupted(requeue?: (uid: string, courseId: string) => void) {
    return recoverStale(
      this,
      { now: () => Date.now() },
      {
        dispatch: async (task) => {
          requeue?.(task.payload.uid, task.payload.courseId);
          return { taskId: task.payload.courseId, deduped: false };
        },
      },
      { leaseExpiredOnly: false },
    ).then((counts) => {
      log.info('Recovered interrupted course work', { event: 'recover', ...counts });
      return counts;
    });
  }
}
