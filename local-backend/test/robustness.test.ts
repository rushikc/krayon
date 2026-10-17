import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GeminiError, geminiInFlight, runGeminiCall, withGeminiSlot } from '../../packages/pipeline/src/gemini.ts';
import { applyStepFailure, courseResult } from '../../packages/pipeline/src/outcomes.ts';
import type { DocStore, GeneratedSegment, PipelineEmit } from '@krayon/shared';
import { afterEach, expect, it } from 'vitest';
import { acquireJob, jobConflict, lockKey, releaseJob } from '../src/locks.ts';
import { LocalDocStore } from '../src/services/docstore.ts';

const quiet = { info: () => undefined, error: () => undefined, debug: () => undefined };

afterEach(() => {
  releaseJob(lockKey('c', 't', 0));
  releaseJob(lockKey('c', 't', 1));
  releaseJob(lockKey('c', 't', -1));
});

it('keeps at most 4 Gemini calls in flight', async () => {
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
  expect(geminiInFlight()).toBeLessThanOrEqual(4);
  expect(max).toBeLessThanOrEqual(4);
  expect(release.length).toBeGreaterThan(0);
  expect(release.length).toBeLessThanOrEqual(4);
  const finished = Promise.all(tasks);
  for (let turn = 0; turn < 8; turn += 1) {
    while (release.length > 0) release.shift()?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await finished;
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

it('returns busy while a topic is generating and while a segment lock is held', () => {
  const key = lockKey('c', 't', 0);
  expect(jobConflict('generating', key)).toEqual({ error: 'busy', reason: 'Still generating' });
  expect(jobConflict('ready', key)).toBeNull();
  acquireJob(key);
  expect(jobConflict('ready', key)).toEqual({ error: 'busy', reason: 'Already regenerating' });
  expect(jobConflict('ready', lockKey('c', 't', 1))).toBeNull();
  releaseJob(key);
});

it('marks the course failed only when every topic failed', () => {
  expect(courseResult([{ status: 'failed', error: 'one' }, { status: 'failed', error: 'two' }])).toMatchObject({
    type: 'course.failed',
    status: 'failed',
    failedTopics: 2,
  });
  expect(courseResult([{ status: 'ready' }, { status: 'failed', error: 'two' }])).toMatchObject({
    type: 'course.done',
    status: 'done',
    failedTopics: 1,
  });
});

it('keeps a segment playable and unreviewed when render throws', () => {
  const rows = new Map<string, Record<string, unknown>>();
  const docs = {
    get: () => null,
    set: (docPath: string, data: Record<string, unknown>) => {
      rows.set(docPath, data);
      return { id: docPath, data, updatedAt: 0 };
    },
    delete: () => false,
    list: () => [],
    clear: () => ({}),
  } satisfies DocStore;
  const segment = { id: 's' } as GeneratedSegment;
  const outcome = applyStepFailure(docs, 'u', 'c', 't', 's', segment, new Error('renderStill failed'));
  expect(outcome.status).toBe('unreviewed');
  const saved = rows.get('users/u/courses/c/topics/t/segments/s');
  expect(saved?.status).toBe('unreviewed');
  expect(saved?.segment).toBe(segment);
  expect(saved?.status).not.toBe('ready');
});

it('turns an interrupted segment into failed and recomputes the course', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-recover-'));
  try {
    const store = new LocalDocStore(path.join(dir, 'db.sqlite3'));
    store.set('users/u/courses/c', { status: 'lessons', error: null });
    store.set('users/u/courses/c/topics/t', { status: 'generating', title: 'Topic' });
    store.set('users/u/courses/c/topics/t/segments/s', { status: 'checking', segment: { id: 's' } });
    const events: PipelineEmit[] = [];
    store.recoverInterrupted((event) => {
      events.push(event);
    });
    expect(store.get('users/u/courses/c/topics/t/segments/s')?.data).toMatchObject({ status: 'failed', error: 'interrupted' });
    expect(store.get('users/u/courses/c/topics/t')?.data.status).toBe('failed');
    expect(store.get('users/u/courses/c')?.data.status).toBe('failed');
    expect(events.some((event) => event.type === 'course.failed')).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
