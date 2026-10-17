import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { DocRecord, DocStore } from '@krayon/shared';
import { getLogger } from '../logging.js';

export type { DocRecord };

const log = getLogger('krayon.docstore');

const split = (docPath: string) => {
  const parts = docPath.split('/').filter(Boolean);
  if (parts.length < 2 || parts.length % 2) {
    throw new Error('A document path needs an even number of segments, e.g. users/u1/lessons/l1');
  }
  return { collection: parts.slice(0, -1).join('/'), id: parts[parts.length - 1] ?? '' };
};

export class LocalDocStore implements DocStore {
  private readonly db: Database.Database;

  constructor(dbFile: string) {
    mkdirSync(path.dirname(dbFile), { recursive: true });
    this.db = new Database(dbFile);
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS docs (collection TEXT, id TEXT, data TEXT, updated REAL, PRIMARY KEY (collection, id))',
    );
  }

  get(docPath: string): DocRecord | null {
    const { collection, id } = split(docPath);
    const row = this.db.prepare('SELECT data, updated FROM docs WHERE collection=? AND id=?').get(collection, id) as
      | { data: string; updated: number }
      | undefined;
    log.debug(`get ${docPath}`, { event: 'docstore.get', path: docPath, found: Boolean(row) });
    if (!row) return null;
    return { id, data: JSON.parse(row.data) as Record<string, unknown>, updatedAt: row.updated };
  }

  set(docPath: string, data: Record<string, unknown>, merge = false): DocRecord {
    const { collection, id } = split(docPath);
    let next = data;
    if (merge) {
      const current = this.get(docPath);
      if (current) next = { ...current.data, ...data };
    }
    const now = Date.now() / 1000;
    this.db
      .prepare('INSERT OR REPLACE INTO docs (collection, id, data, updated) VALUES (?,?,?,?)')
      .run(collection, id, JSON.stringify(next), now);
    log.debug(`set ${docPath}`, {
      event: 'docstore.set',
      path: docPath,
      merge,
      keys: Object.keys(next).slice(0, 20),
    });
    return { id, data: next, updatedAt: now };
  }

  delete(docPath: string): boolean {
    const { collection, id } = split(docPath);
    const result = this.db.prepare('DELETE FROM docs WHERE collection=? AND id=?').run(collection, id);
    const deleted = result.changes > 0;
    log.debug(`delete ${docPath}`, { event: 'docstore.delete', path: docPath, deleted });
    return deleted;
  }

  clear(): Record<string, number> {
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
  }

  /**
   * After a restart: interrupted jobs become errors; a chapter mid-write goes back to pending; a lesson
   * mid-render goes back to queued, and its unfinished segments to pending (ready segments are kept).
   * Every course with open work is handed to `requeue`, which resumes it from the stored stage.
   */
  recoverInterrupted(requeue?: (uid: string, courseId: string) => void) {
    const reason = 'interrupted';
    const rows = this.db.prepare('SELECT collection, id, data FROM docs').all() as Array<{
      collection: string;
      id: string;
      data: string;
    }>;
    const open = new Map<string, { uid: string; courseId: string }>();
    const mark = (collection: string) => {
      const parts = collection.split('/');
      const uid = parts[1] ?? '';
      const courseId = parts[3] ?? '';
      open.set(`${uid}/${courseId}`, { uid, courseId });
    };
    const counts = { jobs: 0, chapters: 0, lessons: 0, segments: 0 };
    for (const row of rows) {
      const data = JSON.parse(row.data) as { status?: string; stage?: string };
      const at = `${row.collection}/${row.id}`;
      if (row.collection === 'jobs') {
        if (data.status === 'queued' || data.status === 'running') {
          this.set(at, { status: 'error', error: reason }, true);
          counts.jobs += 1;
        }
      } else if (/^users\/[^/]+\/courses$/.test(row.collection)) {
        if (data.status === 'structure' || data.status === 'created' || data.status === 'writing') mark(`${row.collection}/${row.id}`);
      } else if (row.collection.endsWith('/chapters')) {
        if (data.status === 'writing') {
          this.set(at, { status: 'pending', statusDetail: null }, true);
          counts.chapters += 1;
        }
        if (data.status === 'writing' || data.status === 'pending') mark(row.collection);
      } else if (row.collection.endsWith('/segments')) {
        if (data.status && !['pending', 'ready', 'failed'].includes(data.status)) {
          this.set(at, { status: 'pending', statusDetail: null }, true);
          counts.segments += 1;
        }
      } else if (row.collection.endsWith('/lessons')) {
        if (data.status === 'rendering' || data.status === 'queued') {
          this.set(at, { status: 'queued', statusDetail: 'Queued' }, true);
          counts.lessons += 1;
          mark(row.collection);
        }
      }
    }
    for (const { uid, courseId } of open.values()) requeue?.(uid, courseId);
    log.info('Recovered interrupted course work', { event: 'recover', courses: open.size, ...counts });
  }

  list(collection: string): DocRecord[] {
    const col = collection.replace(/^\/+|\/+$/g, '');
    const rows = this.db
      .prepare('SELECT id, data, updated FROM docs WHERE collection=? ORDER BY updated')
      .all(col) as Array<{ id: string; data: string; updated: number }>;
    log.debug(`list ${col}`, { event: 'docstore.list', collection: col, count: rows.length });
    return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown>, updatedAt: row.updated }));
  }
}
