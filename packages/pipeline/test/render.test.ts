import { writeFileSync } from 'node:fs';
import type { BlobStorage, GeneratedSegment } from '@krayon/shared';
import type { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { describe, expect, it } from 'vitest';
import { createRenderer } from '../src/render.js';

const segment = {
  id: 's01',
  title: 'Supply',
  durationInFrames: 180,
  narration: 'Sellers offer more at higher prices.',
  scene: { layout: { type: 'titleCard', title: 'Supply' } },
} as GeneratedSegment;

const fakeBrowser = (counts: { opens: number; closes: number }, delayMs = 0) =>
  (async () => {
    counts.opens += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const listeners: Record<string, Array<() => void>> = {};
    const instance = {
      connected: true,
      pages: async () => [],
      on(event: string, listener: () => void) {
        (listeners[event] ??= []).push(listener);
      },
      async close() {
        counts.closes += 1;
        instance.connected = false;
        for (const listener of listeners.disconnected ?? []) listener();
      },
    };
    return instance;
  }) as unknown as typeof openBrowser;

const blobs = () => {
  let next = 0;
  return { put: () => ({ id: `k${(next += 1)}` }) } as unknown as BlobStorage;
};

describe('renderer', () => {
  it('shares one Chrome launch across concurrent renders and keeps to the render limit', async () => {
    const counts = { opens: 0, closes: 0 };
    let active = 0;
    let peak = 0;
    const renderer = createRenderer('unused', blobs(), 1, {
      concurrency: 2,
      idleMs: 60_000,
      bundle: async () => 'http://fixture',
      openBrowser: fakeBrowser(counts, 20),
      selectComposition: (async () => ({})) as unknown as typeof selectComposition,
      renderStill: (async ({ output }: { output: string }) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        writeFileSync(output, 'png');
        active -= 1;
      }) as unknown as typeof renderStill,
    });
    const results = await Promise.all(Array.from({ length: 5 }, () => renderer.renderKeyframes('user', segment)));
    expect(counts.opens).toBe(1);
    expect(peak).toBe(2);
    expect(results.every((result) => result.keyframeIds.length === 1)).toBe(true);
    expect(renderer.health()).toEqual({ ok: true });
    await renderer.close();
  });

  it('times out a hung render, resets Chrome, retries once, then reports the timeout', async () => {
    const counts = { opens: 0, closes: 0 };
    let selects = 0;
    const renderer = createRenderer('unused', blobs(), 1, {
      timeoutMs: 30,
      idleMs: 60_000,
      bundle: async () => 'http://fixture',
      openBrowser: fakeBrowser(counts),
      selectComposition: (async () => {
        selects += 1;
        return new Promise(() => undefined);
      }) as unknown as typeof selectComposition,
      renderStill: (async () => undefined) as unknown as typeof renderStill,
    });
    const error = (await renderer.renderKeyframes('user', segment).catch((caught: unknown) => caught)) as Error;
    expect(error.message).toMatch(/timed out/);
    expect(selects).toBe(2);
    expect(counts.opens).toBe(2);
    expect(counts.closes).toBe(2);
    expect(renderer.health()).toMatchObject({ ok: false, error: expect.stringMatching(/timed out/) });
  });
});
