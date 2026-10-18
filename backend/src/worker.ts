import { recoverStale } from '@krayon/pipeline';
import type { TaskKind, TaskPayload } from '@krayon/shared';
import Fastify from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { logger } from './adapters/cloudLogging.js';
import { createGcpRuntime } from './runtime.js';

/**
 * krayon-worker. Cloud Run request timeout is at least 1800s, matching the queue deadline.
 * A generation failure is terminal (2xx). Infrastructure failures are 5xx so Cloud Tasks retries.
 * The last retry returns 2xx so a poisoned task stops.
 */
const runtime = createGcpRuntime();
const client = new OAuth2Client();
const audience = (process.env.WORKER_URL || '').replace(/\/$/, '');
const invoker = process.env.TASKS_INVOKER_EMAIL || '';

const app = Fastify({
  logger: false,
  requestTimeout: 1_800_000,
  bodyLimit: 2 * 1024 * 1024,
});

const authorize = async (header: string | undefined) => {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return false;
  const ticket = await client.verifyIdToken({ idToken: token, audience });
  return ticket.getPayload()?.email === invoker;
};

app.post('/tasks/sweep', async (request, reply) => {
  if (!(await authorize(request.headers.authorization))) return reply.code(403).send({ detail: 'Forbidden' });
  const counts = await recoverStale(runtime.docs, { now: () => Date.now() }, runtime.dispatcher, { leaseExpiredOnly: true });
  return counts;
});

app.post('/tasks/:kind', async (request, reply) => {
  if (!(await authorize(request.headers.authorization))) return reply.code(403).send({ detail: 'Forbidden' });
  const kind = (request.params as { kind: TaskKind }).kind;
  const payload = request.body as TaskPayload;
  const retry = Number(request.headers['x-cloudtasks-taskretrycount'] ?? 0);
  try {
    await runtime.pipeline.handle({ kind, payload, queue: 'ai-background' });
    return { ok: true };
  } catch (error) {
    logger.error('task failed', { kind, retry, error: error instanceof Error ? error.message : String(error) });
    const attempts = Number(process.env.TASK_MAX_ATTEMPTS || 3);
    if (retry + 1 >= attempts) {
      await runtime.pipeline.failTask({ kind, payload, queue: 'ai-background' });
      return { ok: false, failed: true };
    }
    return reply.code(500).send({ detail: error instanceof Error ? error.message : 'Task failed' });
  }
});

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: '0.0.0.0' });
logger.info('krayon-worker listening', { port });
