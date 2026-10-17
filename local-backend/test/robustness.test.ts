import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GeminiError, geminiInFlight, runGeminiCall, setGeminiConcurrency, withGeminiSlot } from '../../packages/pipeline/src/gemini.ts';
import { saveProgress } from '../../packages/pipeline/src/store.ts';
import { expect, it } from 'vitest';
import { LocalEventBus } from '../src/bus.ts';
import { LocalCoordination } from '../src/coordination.ts';
import { LocalDocStore } from '../src/services/docstore.ts';

const quiet = { info: () => undefined, error: () => undefined, debug: () => undefined };

const withStore = async (run: (store: LocalDocStore) => Promise<void>) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-recover-'));
  try {
    await run(new LocalDocStore(path.join(dir, 'db.sqlite3')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

it('keeps at most GEMINI_MAX_CONCURRENCY calls in flight', async () => {
  setGeminiConcurrency(4);
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
  setGeminiConcurrency(5);
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

it('holds a segment lease, and a lesson-wide lease blocks every segment', async () => {
  const coordination = new LocalCoordination(new LocalEventBus());
  expect(await coordination.acquireLease('regen/l/s01', 'u', 60_000)).toBe(true);
  expect(await coordination.acquireLease('regen/l/s01', 'u', 60_000)).toBe(false);
  expect(await coordination.acquireLease('regen/l/s02', 'u', 60_000)).toBe(true);
  expect(await coordination.acquireLease('regen/l/*', 'u', 60_000)).toBe(false);
  await coordination.releaseLease('regen/l/s01', 'u');
  await coordination.releaseLease('regen/l/s02', 'u');
  expect(await coordination.acquireLease('regen/l/*', 'u', 60_000)).toBe(true);
  expect(await coordination.acquireLease('regen/l/s02', 'u', 60_000)).toBe(false);
});

it('recovers interrupted work without touching ready segments, and requeues the course', async () => {
  await withStore(async (store) => {
    const course = 'users/u/courses/c';
    await store.set(course, { status: 'writing', stage: 'chapters' });
    await store.set(`${course}/chapters/c-c1`, { status: 'ready' });
    await store.set(`${course}/chapters/c-c2`, { status: 'writing', statusDetail: 'Writing lesson scripts' });
    await store.set(`${course}/lessons/c-c1-l1`, { status: 'rendering', chapterId: 'c-c1' });
    await store.set(`${course}/lessons/c-c1-l2`, { status: 'outlined', chapterId: 'c-c1' });
    const ready = { status: 'ready', segment: { id: 's01' } };
    await store.set(`${course}/lessons/c-c1-l1/segments/s01`, ready);
    await store.set(`${course}/lessons/c-c1-l1/segments/s02`, { status: 'reviewing', segment: { id: 's02' } });
    await store.set(`${course}/lessons/c-c1-l1/segments/s03`, { status: 'failed' });
    await store.set('jobs/j1', { status: 'running', owner: 'u' });
    const requeued: string[] = [];
    await store.recoverInterrupted((uid, courseId) => requeued.push(`${uid}/${courseId}`));

    expect(requeued).toContain('u/c');
    expect((await store.get('jobs/j1'))?.data).toMatchObject({ status: 'error', error: 'interrupted' });
    expect((await store.get(`${course}/chapters/c-c2`))?.data).toMatchObject({ status: 'pending', statusDetail: null });
    expect((await store.get(`${course}/chapters/c-c1`))?.data.status).toBe('ready');
    expect((await store.get(`${course}/lessons/c-c1-l1`))?.data.status).toBe('queued');
    expect((await store.get(`${course}/lessons/c-c1-l2`))?.data.status).toBe('outlined');
    expect((await store.get(`${course}/lessons/c-c1-l1/segments/s01`))?.data).toEqual(ready);
    expect((await store.get(`${course}/lessons/c-c1-l1/segments/s02`))?.data).toMatchObject({ status: 'pending', segment: { id: 's02' } });
    expect((await store.get(`${course}/lessons/c-c1-l1/segments/s03`))?.data.status).toBe('failed');
  });
});

it('does not requeue a finished course', async () => {
  await withStore(async (store) => {
    await store.set('users/u/courses/done', { status: 'ready', stage: 'done' });
    await store.set('users/u/courses/done/lessons/done-c1-l1', { status: 'ready' });
    const requeued: string[] = [];
    await store.recoverInterrupted((uid, courseId) => requeued.push(`${uid}/${courseId}`));
    expect(requeued).toEqual([]);
  });
});

it('saves lesson progress without ever unwatching a lesson', async () => {
  await withStore(async (store) => {
    expect(await saveProgress(store, 'u', 'l', { positionFrame: 120.4 })).toMatchObject({ watched: false, completed: false, positionFrame: 120 });
    expect(await saveProgress(store, 'u', 'l', { watched: true, positionFrame: 900 })).toMatchObject({ watched: true, completed: false });
    expect(await saveProgress(store, 'u', 'l', { watched: false, positionFrame: 30 })).toMatchObject({ watched: true, positionFrame: 30 });
    expect(await saveProgress(store, 'u', 'l', { completed: true, positionFrame: 0 })).toMatchObject({ watched: true, completed: true, positionFrame: 0 });
    expect(await saveProgress(store, 'u', 'l', { completed: false })).toMatchObject({ completed: true });
  });
});
