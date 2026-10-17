import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { DocRecord, DocStore, PipelineEmit } from '@krayon/shared';
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

  recoverInterrupted(emit?: (event: PipelineEmit) => void, requeue?: (uid: string, courseId: string, topicId: string) => void) {
    const reason = 'interrupted';
    const mid = new Set(['generating', 'checking', 'reviewing']);
    const jobs = this.db.prepare(`SELECT id, data FROM docs WHERE collection = 'jobs'`).all() as Array<{
      id: string;
      data: string;
    }>;
    for (const row of jobs) {
      const data = JSON.parse(row.data) as { status?: string };
      if (data.status === 'queued' || data.status === 'running') {
        this.set(`jobs/${row.id}`, { status: 'error', error: reason }, true);
      }
    }
    const rows = this.db.prepare('SELECT collection, id, data FROM docs').all() as Array<{
      collection: string;
      id: string;
      data: string;
    }>;
    const segments = rows.filter((row) => row.collection.endsWith('/segments'));
    for (const row of segments) {
      const data = JSON.parse(row.data) as { status?: string };
      if (!data.status || !mid.has(data.status)) continue;
      this.set(`${row.collection}/${row.id}`, { status: 'failed', statusDetail: null, error: reason }, true);
      const parts = row.collection.split('/');
      emit?.({
        type: 'segment.failed',
        courseId: parts[3] ?? '',
        topicId: parts[5] ?? '',
        segmentId: row.id,
        error: reason,
        flow: 'recover',
        step: 'interrupted',
      });
    }
    const topics = rows.filter((row) => row.collection.endsWith('/topics'));
    const queued: Array<{ uid: string; courseId: string; topicId: string }> = [];
    for (const row of topics) {
      const data = JSON.parse(row.data) as { status?: string };
      const parts = row.collection.split('/');
      const uid = parts[1] ?? '';
      const courseId = parts[3] ?? '';
      if (data.status && mid.has(data.status)) {
        this.set(`${row.collection}/${row.id}`, { status: 'failed', statusDetail: null, error: reason }, true);
        emit?.({ type: 'topic.failed', courseId, topicId: row.id, error: reason, flow: 'recover', step: 'interrupted' });
      } else if (data.status === 'queued') {
        emit?.({ type: 'topic.queued', courseId, topicId: row.id, flow: 'recover', step: 'queued' });
        queued.push({ uid, courseId, topicId: row.id });
      }
    }
    const courses = rows.filter((row) => /^users\/[^/]+\/courses$/.test(row.collection));
    for (const row of courses) {
      const uid = row.collection.split('/')[1] ?? '';
      const topicRows = this.list(`${row.collection}/${row.id}/topics`);
      const statuses = topicRows.map((topic) => String(topic.data.status ?? 'queued'));
      const failed = statuses.filter((status) => status === 'failed');
      const terminal = new Set(['ready', 'failed', 'blocked', 'unreviewed']);
      let status: 'done' | 'failed' | 'generating' = 'generating';
      let error: string | null = null;
      if (statuses.length > 0 && failed.length === statuses.length) {
        status = 'failed';
        error = 'interrupted';
      } else if (statuses.length > 0 && statuses.every((item) => terminal.has(item))) {
        status = 'done';
      }
      this.set(`${row.collection}/${row.id}`, { status, error }, true);
      if (status === 'failed') emit?.({ type: 'course.failed', courseId: row.id, error: error ?? reason, flow: 'recover', step: 'failed' });
      if (status === 'done') emit?.({ type: 'course.done', courseId: row.id, failedTopics: failed.length, flow: 'recover', step: 'done' });
      if (status === 'generating') {
        for (const topic of queued) {
          if (topic.uid === uid && topic.courseId === row.id) requeue?.(uid, row.id, topic.topicId);
        }
      }
    }
    log.info('Recovered interrupted course work', { event: 'recover' });
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
