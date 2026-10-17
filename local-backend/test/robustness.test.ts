import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GeminiError, geminiInFlight, runGeminiCall, withGeminiSlot } from '../../packages/pipeline/src/gemini.ts';
import { saveProgress } from '../../packages/pipeline/src/store.ts';
import { afterEach, expect, it } from 'vitest';
import { acquireJob, jobConflict, lockKey, releaseJob } from '../src/locks.ts';
import { LocalDocStore } from '../src/services/docstore.ts';

const quiet = { info: () => undefined, error: () => undefined, debug: () => undefined };

const withStore = (run: (store: LocalDocStore) => void) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-recover-'));
  try {
    run(new LocalDocStore(path.join(dir, 'db.sqlite3')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

afterEach(() => {
  releaseJob(lockKey('l', 's01'));
  releaseJob(lockKey('l', 's02'));
  releaseJob(lockKey('l'));
});

it('keeps at most GEMINI_MAX_CONCURRENCY calls in flight', async () => {
  process.env.GEMINI_MAX_CONCURRENCY = '4';
  let current = 0;
  let max = 0;
  const release: Array<() => void> = [];
  const tasks = Array.from({ length: 8 }, () =>
    withGeminiSlot(
      () =>
        new Promise<void>((resolve) => {
          current += 1;
          max = Math.max(max, current);
          release.push(() => {
            current -= 1;
            resolve();
          });
        }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(geminiInFlight()).toBe(4);
  expect(release.length).toBe(4);
  const finished = Promise.all(tasks);
  for (let turn = 0; turn < 8; turn += 1) {
    while (release.length > 0) release.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await finished;
  expect(max).toBe(4);
  expect(geminiInFlight()).toBe(0);
});

it('retries a 429 and does not retry a safety block', async () => {
  let calls = 0;
  const value = await runGeminiCall({
    model: 'test',
    log: quiet,
    sleep: async () => undefined,
    random: () => 0.5,
    call: async () => {
      calls += 1;
      if (calls < 3) {
        const error = new Error('RESOURCE_EXHAUSTED') as Error & { status: number };
        error.status = 429;
        throw error;
      }
      return { ok: true };
    },
    outcome: () => ({ finishReason: 'STOP' }),
  });
  expect(value.ok).toBe(true);
  expect(calls).toBe(3);

  let safetyCalls = 0;
  const safety = runGeminiCall({
    model: 'test',
    log: quiet,
    sleep: async () => undefined,
    call: async () => {
      safetyCalls += 1;
      throw new Error('blocked due to SAFETY');
    },
    outcome: () => ({}),
  });
  await expect(safety).rejects.toMatchObject({ kind: 'safety_blocked' });
  expect(safetyCalls).toBe(1);
  await expect(safety).rejects.toBeInstanceOf(GeminiError);
});

it('fails MAX_TOKENS at once instead of retrying', async () => {
  let calls = 0;
  const run = runGeminiCall({
    model: 'test',
    log: quiet,
    sleep: async () => undefined,
    call: async () => {
      calls += 1;
      return { text: '{' };
    },
    outcome: () => ({ finishReason: 'MAX_TOKENS' }),
  });
  await expect(run).rejects.toThrow(/MAX_TOKENS/);
  expect(calls).toBe(1);
});

it('returns busy while a lesson renders and while a segment or the lesson is locked', () => {
  const segment = lockKey('l', 's01');
  expect(jobConflict('rendering', segment)).toEqual({ error: 'busy', reason: 'Still rendering' });
  expect(jobConflict('queued', segment)).toEqual({ error: 'busy', reason: 'Still rendering' });
  expect(jobConflict('ready', segment)).toBeNull();
  acquireJob(segment);
  expect(jobConflict('ready', segment)).toEqual({ error: 'busy', reason: 'Already regenerating' });
  expect(jobConflict('ready', lockKey('l', 's02'))).toBeNull();
  expect(jobConflict('ready', lockKey('l'))).toEqual({ error: 'busy', reason: 'Already regenerating' });
  releaseJob(segment);
  acquireJob(lockKey('l'));
  expect(jobConflict('ready', lockKey('l', 's02'))).toEqual({ error: 'busy', reason: 'Already regenerating' });
});

it('recovers interrupted work without touching ready segments, and requeues the course', () => {
  withStore((store) => {
    const course = 'users/u/courses/c';
    store.set(course, { status: 'writing', stage: 'chapters' });
    store.set(`${course}/chapters/c-c1`, { status: 'ready' });
    store.set(`${course}/chapters/c-c2`, { status: 'writing', statusDetail: 'Writing lesson scripts' });
    store.set(`${course}/lessons/c-c1-l1`, { status: 'rendering', chapterId: 'c-c1' });
    store.set(`${course}/lessons/c-c1-l2`, { status: 'outlined', chapterId: 'c-c1' });
    const ready = { status: 'ready', segment: { id: 's01' } };
    store.set(`${course}/lessons/c-c1-l1/segments/s01`, ready);
    store.set(`${course}/lessons/c-c1-l1/segments/s02`, { status: 'reviewing', segment: { id: 's02' } });
    store.set(`${course}/lessons/c-c1-l1/segments/s03`, { status: 'failed' });
    store.set('jobs/j1', { status: 'running', owner: 'u' });
    const requeued: string[] = [];
    store.recoverInterrupted((uid, courseId) => requeued.push(`${uid}/${courseId}`));

    expect(requeued).toEqual(['u/c']);
    expect(store.get('jobs/j1')?.data).toMatchObject({ status: 'error', error: 'interrupted' });
    expect(store.get(`${course}/chapters/c-c2`)?.data).toMatchObject({ status: 'pending', statusDetail: null });
    expect(store.get(`${course}/chapters/c-c1`)?.data.status).toBe('ready');
    expect(store.get(`${course}/lessons/c-c1-l1`)?.data.status).toBe('queued');
    expect(store.get(`${course}/lessons/c-c1-l2`)?.data.status).toBe('outlined');
    expect(store.get(`${course}/lessons/c-c1-l1/segments/s01`)?.data).toEqual(ready);
    expect(store.get(`${course}/lessons/c-c1-l1/segments/s02`)?.data).toMatchObject({ status: 'pending', segment: { id: 's02' } });
    expect(store.get(`${course}/lessons/c-c1-l1/segments/s03`)?.data.status).toBe('failed');
  });
});

it('does not requeue a finished course', () => {
  withStore((store) => {
    store.set('users/u/courses/done', { status: 'ready', stage: 'done' });
    store.set('users/u/courses/done/lessons/done-c1-l1', { status: 'ready' });
    const requeued: string[] = [];
    store.recoverInterrupted((uid, courseId) => requeued.push(`${uid}/${courseId}`));
    expect(requeued).toEqual([]);
  });
});

it('saves lesson progress without ever unwatching a lesson', () => {
  withStore((store) => {
    expect(saveProgress(store, 'u', 'l', { positionFrame: 120.4 })).toMatchObject({ watched: false, completed: false, positionFrame: 120 });
    expect(saveProgress(store, 'u', 'l', { watched: true, positionFrame: 900 })).toMatchObject({ watched: true, completed: false });
    expect(saveProgress(store, 'u', 'l', { watched: false, positionFrame: 30 })).toMatchObject({ watched: true, positionFrame: 30 });
    expect(saveProgress(store, 'u', 'l', { completed: true, positionFrame: 0 })).toMatchObject({ watched: true, completed: true, positionFrame: 0 });
    expect(saveProgress(store, 'u', 'l', { completed: false })).toMatchObject({ completed: true });
  });
});
