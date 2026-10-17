import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { collectKeyframeFrames, mediaId } from '@krayon/shared';
import type { BlobStorage, GeneratedSegment } from '@krayon/shared';
import { keyframeKey } from './keys.js';
import type { PipelineLogger } from './gemini.js';
import { BACKGROUND, createPriorityQueue } from './queue.js';
import type { Priority } from './queue.js';

type Browser = Awaited<ReturnType<typeof openBrowser>>;

const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_IDLE_MS = 60_000;
const STARTING = 'Starting the renderer.';

export type RendererHealth = { ok: boolean; error?: string };

export type RendererOptions = {
  timeoutMs?: number;
  idleMs?: number;
  openBrowser?: typeof openBrowser;
  selectComposition?: typeof selectComposition;
  renderStill?: typeof renderStill;
  /** Skip the Remotion webpack bundle. Tests pass a resolved serve url. */
  bundle?: () => Promise<string>;
  /** Renders at once (RENDER_CONCURRENCY), separate from the Gemini limit. */
  concurrency?: number;
  log?: PipelineLogger;
};

const browserConnected = (instance: Browser) => {
  const flag = (instance as { connected?: boolean }).connected;
  return typeof flag === 'boolean' ? flag : null;
};

const withTimeout = <T>(work: Promise<T>, ms: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Render timed out after ${ms}ms`)), ms);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const isTimeout = (error: unknown) => error instanceof Error && error.message.startsWith('Render timed out');

export const createRenderer = (
  remotionEntry: string,
  blobs: BlobStorage,
  maxFrames: number,
  options: RendererOptions = {},
) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const openImpl = options.openBrowser ?? openBrowser;
  const selectImpl = options.selectComposition ?? selectComposition;
  const stillImpl = options.renderStill ?? renderStill;

  let serveUrl: string | null = null;
  let bundling: Promise<string> | null = null;
  let bundleError: string | null = null;
  let browser: Browser | null = null;
  let idle: ReturnType<typeof setTimeout> | null = null;
  let inflight = 0;
  let lastRender: RendererHealth | null = null;

  const bundleOnce = () => {
    if (serveUrl) return Promise.resolve(serveUrl);
    if (!bundling) {
      const run = options.bundle ?? (() => bundle({ entryPoint: remotionEntry, webpackOverride: (config) => config }));
      bundling = run()
        .then((url) => {
          serveUrl = url;
          bundleError = null;
          return url;
        })
        .catch((error: unknown) => {
          bundleError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          bundling = null;
        });
    }
    return bundling;
  };

  const socketLive = (instance: Browser): boolean | null => {
    const flag = browserConnected(instance);
    if (flag !== null) return flag;
    const ready = (instance as { connection?: { transport?: { websocket?: { readyState?: number } } } }).connection?.transport?.websocket?.readyState;
    if (typeof ready === 'number') return ready === 1;
    return null;
  };

  const stillOpen = async (instance: Browser) => {
    const live = socketLive(instance);
    if (live !== null) return live;
    try {
      await withTimeout(instance.pages(), 1_500);
      return true;
    } catch {
      return false;
    }
  };

  const clearIdle = () => {
    if (idle) clearTimeout(idle);
    idle = null;
  };

  const forget = (instance: Browser) => {
    if (browser === instance) browser = null;
  };

  const discard = async (instance: Browser | null) => {
    clearIdle();
    if (!instance) return;
    forget(instance);
    try {
      await withTimeout(instance.close({ silent: true }), 2_000);
    } catch {
      /* close() can hang on the same dead socket. */
    }
  };

  const armIdle = () => {
    clearIdle();
    if (inflight > 0 || !browser) return;
    const cached = browser;
    idle = setTimeout(() => {
      idle = null;
      if (inflight === 0 && browser === cached) void discard(cached);
    }, idleMs);
  };

  /** Every caller shares one launch, so concurrent renders never start (and leak) a second Chrome. */
  let opening: Promise<Browser> | null = null;

  const launch = async () => {
    if (browser) await discard(browser);
    clearIdle();
    const next = await openImpl('chrome');
    const listen = next as { on?: (event: string, listener: () => void) => void };
    listen.on?.('disconnected', () => forget(next));
    listen.on?.('closed', () => forget(next));
    const transport = (next as { connection?: { transport?: { onclose?: () => void } } }).connection?.transport;
    if (transport) {
      const previous = transport.onclose;
      transport.onclose = () => {
        previous?.();
        forget(next);
      };
    }
    browser = next;
    return next;
  };

  const open = async () => {
    if (opening) return opening;
    if (browser && (await stillOpen(browser))) return browser;
    if (!opening) {
      opening = launch().finally(() => {
        opening = null;
      });
    }
    return opening;
  };

  const renderWith = async (url: string, instance: Browser, owner: string, segment: GeneratedSegment, fields: Record<string, unknown>) => {
    const inputProps = { segment };
    const composition = await selectImpl({
      serveUrl: url,
      id: 'SegmentStill',
      inputProps,
      puppeteerInstance: instance,
    });
    const frames = collectKeyframeFrames(segment, maxFrames);
    const dir = mkdtempSync(path.join(tmpdir(), 'krayon-still-'));
    const keyframeIds: string[] = [];
    try {
      for (const frame of frames) {
        const output = path.join(dir, `${frame}.png`);
        await stillImpl({
          composition,
          serveUrl: url,
          output,
          frame,
          inputProps,
          puppeteerInstance: instance,
          imageFormat: 'png',
        });
        const png = readFileSync(output);
        const lessonId = String(fields.lessonId ?? segment.id);
        const attempt = Number(fields.attempt ?? 1);
        const round = Number(fields.round ?? 1);
        const key = keyframeKey(owner, lessonId, segment.id, attempt, round, frame);
        await blobs.put(key, png, { contentType: 'image/png' });
        keyframeIds.push(mediaId(key));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return { frames, keyframeIds };
  };

  const renderQueue = createPriorityQueue({ limit: () => Math.max(1, options.concurrency ?? 2) });

  /** Renders the review keyframes of one segment, holding one render slot. Logs render.done with the duration. */
  const renderKeyframes = (owner: string, segment: GeneratedSegment, priority: Priority = BACKGROUND, fields: Record<string, unknown> = {}) =>
    renderQueue.run(priority, async () => {
      const started = performance.now();
      try {
        const result = await renderNow(owner, segment, fields);
        options.log?.info(`Rendered ${result.frames.length} keyframes in ${Math.round(performance.now() - started)} ms`, {
          ...fields,
          event: 'render.done',
          segmentId: segment.id,
          frames: result.frames.length,
          duration_ms: Math.round(performance.now() - started),
        });
        return result;
      } catch (error) {
        options.log?.error('Render failed', { ...fields, event: 'render.failed', segmentId: segment.id, duration_ms: Math.round(performance.now() - started) }, error);
        throw error;
      }
    }, (waitMs) => {
      if (waitMs > 0) options.log?.debug('Render slot wait', { ...fields, event: 'render.wait', segmentId: segment.id, queue_wait_ms: waitMs });
    });

  const renderNow = async (owner: string, segment: GeneratedSegment, fields: Record<string, unknown>) => {
    inflight += 1;
    clearIdle();
    try {
      const url = await bundleOnce();
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const instance = await open();
        try {
          const result = await withTimeout(renderWith(url, instance, owner, segment, fields), timeoutMs);
          lastRender = { ok: true };
          return result;
        } catch (error) {
          lastError = error;
          const message = error instanceof Error ? error.message : String(error);
          lastRender = { ok: false, error: message };
          const alive = !isTimeout(error) && (await stillOpen(instance));
          if (alive) throw error;
          await discard(instance);
          if (attempt === 1) throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
      inflight -= 1;
      if (inflight === 0) armIdle();
    }
  };

  const health = (): RendererHealth => {
    if (bundleError) return { ok: false, error: bundleError };
    if (!serveUrl) return { ok: false, error: STARTING };
    if (browser && browserConnected(browser) === false) return { ok: false, error: 'Chrome disconnected' };
    if (lastRender && !lastRender.ok) return { ok: false, error: lastRender.error };
    return { ok: true };
  };

  const close = async () => {
    await discard(browser);
  };

  const warmup = () => bundleOnce();

  return { renderKeyframes, warmup, health, close, clear: renderQueue.clear, open };
};
