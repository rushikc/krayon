import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { collectKeyframeFrames } from '@krayon/shared';
import type { BlobStorage, GeneratedSegment } from '@krayon/shared';

type Browser = Awaited<ReturnType<typeof openBrowser>>;

export const createRenderer = (remotionEntry: string, blobs: BlobStorage, maxFrames: number) => {
  let serveUrl: string | null = null;
  let bundling: Promise<string> | null = null;
  let browser: Browser | null = null;
  let browserOpen = false;

  const bundleOnce = () => {
    if (serveUrl) return Promise.resolve(serveUrl);
    if (!bundling) {
      bundling = bundle({ entryPoint: remotionEntry, webpackOverride: (config) => config })
        .then((url) => {
          serveUrl = url;
          return url;
        })
        .finally(() => {
          bundling = null;
        });
    }
    return bundling;
  };

  const stillOpen = async (instance: Browser) => {
    try {
      await instance.pages();
      return true;
    } catch {
      return false;
    }
  };

  const open = async () => {
    if (browser && browserOpen) return browser;
    const next = await openBrowser('chrome');
    browserOpen = true;
    next.on('closed', () => {
      browserOpen = false;
      if (browser === next) browser = null;
    });
    browser = next;
    return next;
  };

  const renderWith = async (url: string, instance: Browser, owner: string, segment: GeneratedSegment) => {
    const inputProps = { segment };
    const composition = await selectComposition({
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
        await renderStill({
          composition,
          serveUrl: url,
          output,
          frame,
          inputProps,
          puppeteerInstance: instance,
          imageFormat: 'png',
        });
        const png = readFileSync(output);
        const blob = blobs.put(owner, `frame-${segment.id}-${frame}.png`, 'image/png', png);
        keyframeIds.push(blob.id);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return { frames, keyframeIds };
  };

  const renderKeyframes = async (owner: string, segment: GeneratedSegment) => {
    const url = await bundleOnce();
    const instance = await open();
    try {
      return await renderWith(url, instance, owner, segment);
    } catch (error) {
      if (await stillOpen(instance)) throw error;
      browserOpen = false;
      browser = null;
      return renderWith(url, await open(), owner, segment);
    }
  };

  return { renderKeyframes, warmup: bundleOnce };
};
