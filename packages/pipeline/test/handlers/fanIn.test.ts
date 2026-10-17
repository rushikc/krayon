import { expect, it } from 'vitest';
import { claimStage } from '../../src/handlers/claim.js';
import { recountSegments } from '../../src/handlers/fanIn.js';
import { recoverStale } from '../../src/recovery.js';
import { memoryDocs } from '../helpers.js';

it('a second claim is a no-op while the lease is live', async () => {
  const { docs } = memoryDocs();
  await docs.set('users/u/courses/c/chapters/ch', { status: 'pending' });
  expect(await claimStage(docs, 'users/u/courses/c/chapters/ch', 'a', (data) => data.status === 'ready')).toBe('ok');
  expect(await claimStage(docs, 'users/u/courses/c/chapters/ch', 'b', (data) => data.status === 'ready')).toBe('skip');
});

it('recount stores settled, ready and voiced from the rows', async () => {
  const { docs } = memoryDocs();
  const lesson = 'users/u/courses/c/lessons/l';
  await docs.set(lesson, { status: 'rendering' });
  await docs.set(`${lesson}/segments/a`, { status: 'ready', audio: { blobId: 'x', seconds: 1 } });
  await docs.set(`${lesson}/segments/b`, { status: 'failed', voice: 'failed' });
  await docs.set(`${lesson}/segments/c`, { status: 'pending' });
  const counts = await recountSegments(docs, lesson, `${lesson}/segments`);
  expect(counts).toEqual({ total: 3, ready: 1, settled: 2, voiced: 2 });
  expect((await docs.get(lesson))?.data.segmentsSettled).toBe(2);
});

it('recovery marks a writing lesson failed when its chapter failed', async () => {
  const { docs } = memoryDocs();
  await docs.set('users/u/courses/c', { status: 'writing', stage: 'chapters' });
  await docs.set('users/u/courses/c/chapters/ch', { status: 'failed' });
  await docs.set('users/u/courses/c/lessons/l', { status: 'writing', chapterId: 'ch' });
  const dispatched: string[] = [];
  await recoverStale(docs, { now: () => Date.now() }, {
    dispatch: async (task) => {
      dispatched.push(task.kind);
      return { taskId: task.kind, deduped: false };
    },
  }, { leaseExpiredOnly: false });
  expect((await docs.get('users/u/courses/c/lessons/l'))?.data.status).toBe('failed');
  expect(dispatched).not.toContain('lesson.plan');
});
