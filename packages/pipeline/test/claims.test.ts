import { describe, expect, it } from 'vitest';
import { claimStage } from '../src/handlers/claim.js';
import { taskName } from '../src/handlers/taskName.js';
import { memoryDocs } from './helpers.js';

describe('gen-aware claims and task names', () => {
  it('treats failed as done only when the task gen is not newer', async () => {
    const { docs } = memoryDocs();
    await docs.set('users/a/courses/c/lessons/l', { status: 'failed', renderGen: 1 });
    const done = (data: { status?: string }) => data.status === 'failed';
    expect(await claimStage(docs, 'users/a/courses/c/lessons/l', 'worker', done, { field: 'renderGen', value: 1 })).toBe('skip');
    expect(await claimStage(docs, 'users/a/courses/c/lessons/l', 'worker', done, { field: 'renderGen', value: 2 })).toBe('ok');
  });

  it('a retry within the window gets a new task name', () => {
    const first = taskName(['a', 'lesson', 'plan', 'g1']);
    const second = taskName(['a', 'lesson', 'plan', 'g2']);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
