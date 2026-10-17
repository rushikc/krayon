import { applyStepFailure } from '../../packages/pipeline/src/outcomes.ts';
import { saveLesson } from '../../packages/pipeline/src/courses.ts';
import { createRenderer } from '../../packages/pipeline/src/render.ts';
import type { BlobStorage, DocStore, GeneratedSegment } from '@krayon/shared';
import type { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { expect, it } from 'vitest';

const segment = { id: 's', title: 'Supply' } as GeneratedSegment;

const memory = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const store = {
    get: (docPath: string) => {
      const data = rows.get(docPath);
      return data ? { id: docPath, data, updatedAt: 0 } : null;
    },
    set: (docPath: string, data: Record<string, unknown>, merge?: boolean) => {
      const next = merge ? { ...(rows.get(docPath) ?? {}), ...data } : data;
      rows.set(docPath, next);
      return { id: docPath, data: next, updatedAt: 0 };
    },
    delete: () => false,
    list: () => [],
    clear: () => ({}),
  } satisfies DocStore;
  return { rows, store };
};

it('times out a hung render, resets Chrome, retries once, and leaves the segment unreviewed', async () => {
  let opens = 0;
  let closes = 0;
  let selects = 0;
  const open = (async () => {
    opens += 1;
    const listeners: Record<string, Array<() => void>> = {};
    const instance = {
      connected: true,
      pages: async () => [],
      on(event: string, listener: () => void) {
        (listeners[event] ??= []).push(listener);
      },
      async close() {
        closes += 1;
        instance.connected = false;
        for (const listener of listeners.disconnected ?? []) listener();
        for (const listener of listeners.closed ?? []) listener();
      },
    };
    return instance;
  }) as typeof openBrowser;

  const renderer = createRenderer('unused', { put() { throw new Error('no still'); } } as unknown as BlobStorage, 1, {
    timeoutMs: 30,
    idleMs: 60_000,
    bundle: async () => 'http://fixture',
    openBrowser: open,
    selectComposition: (async () => {
      selects += 1;
      return new Promise(() => undefined);
    }) as typeof selectComposition,
    renderStill: (async () => undefined) as typeof renderStill,
  });

  let caught: unknown;
  try {
    await renderer.renderKeyframes('user', segment);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect((caught as Error).message).toMatch(/timed out/);
  expect(selects).toBe(2);
  expect(opens).toBe(2);
  expect(closes).toBe(2);
  expect(renderer.health().ok).toBe(false);
  expect(renderer.health().error).toMatch(/timed out/);

  const { rows, store } = memory();
  applyStepFailure(store, 'u', 'c', 't', 's', segment, caught);
  saveLesson(store, 'u', 'c', 't', { studyDoc: '', segments: [segment] });
  expect(rows.get('users/u/courses/c/topics/t/segments/s')).toMatchObject({
    status: 'unreviewed',
    reviewStatus: 'unreviewed',
  });
  expect(rows.get('users/u/courses/c/topics/t')?.status).toBe('ready');
});
