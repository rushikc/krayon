import { randomUUID } from 'node:crypto';
import type { DocStore, JobHandler, JobQueue } from '@krayon/shared';
import { requestContext } from '../logging.js';
import { getLogger } from '../logging.js';

const log = getLogger('krayon.jobs');

export type { JobHandler };

export class LocalJobRunner implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(private readonly store: DocStore) {}

  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  submit(owner: string, kind: string, payload: Record<string, unknown>): string {
    const handler = this.handlers.get(kind);
    if (!handler) throw new Error(`No job handler named ${kind}`);
    const jobId = randomUUID().replace(/-/g, '');
    const path = `jobs/${jobId}`;
    this.store.set(path, { owner, kind, status: 'queued', payload });
    log.info(`Job queued ${kind}`, { event: 'job', job_id: jobId, kind, status: 'queued', owner });
    const rid = requestContext.getStore();
    const run = async () => {
      const start = performance.now();
      this.store.set(path, { status: 'running' }, true);
      log.info(`Job running ${kind}`, { event: 'job', job_id: jobId, kind, status: 'running' });
      try {
        const result = await handler(payload);
        this.store.set(path, { status: 'done', result }, true);
        log.info(`Job done ${kind}`, {
          event: 'job',
          job_id: jobId,
          kind,
          status: 'done',
          duration_ms: Math.round((performance.now() - start) * 10) / 10,
        });
      } catch (error) {
        log.error(`Job failed ${kind}`, { event: 'job', job_id: jobId, kind, status: 'error' }, error);
        this.store.set(path, { status: 'error', error: error instanceof Error ? error.message : String(error) }, true);
      }
    };
    if (rid) void requestContext.run(rid, run);
    else void run();
    return jobId;
  }
}
