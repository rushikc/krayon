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

  list(collection: string): DocRecord[] {
    const col = collection.replace(/^\/+|\/+$/g, '');
    const rows = this.db
      .prepare('SELECT id, data, updated FROM docs WHERE collection=? ORDER BY updated')
      .all(col) as Array<{ id: string; data: string; updated: number }>;
    log.debug(`list ${col}`, { event: 'docstore.list', collection: col, count: rows.length });
    return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown>, updatedAt: row.updated }));
  }
}
