import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { openBrowser, renderStill, selectComposition } from '@remotion/renderer';
import { collectKeyframeFrames } from '@krayon/shared';
import type { BlobStorage, GeneratedSegment } from '@krayon/shared';

type Renderer = { serveUrl: string; browser: Awaited<ReturnType<typeof openBrowser>> };

export const createRenderer = (remotionEntry: string, blobs: BlobStorage, maxFrames: number) => {
  let opening: Promise<Renderer> | null = null;
  const getRenderer = () => {
    opening ??= (async () => {
      const serveUrl = await bundle({ entryPoint: remotionEntry, webpackOverride: (config) => config });
      const browser = await openBrowser('chrome');
      return { serveUrl, browser };
    })();
    return opening;
  };

  const renderKeyframes = async (owner: string, segment: GeneratedSegment) => {
    const { serveUrl, browser } = await getRenderer();
    const inputProps = { segment };
    const composition = await selectComposition({
      serveUrl,
      id: 'SegmentStill',
      inputProps,
      puppeteerInstance: browser,
    });
    const frames = collectKeyframeFrames(segment, maxFrames);
    const dir = mkdtempSync(path.join(tmpdir(), 'krayon-still-'));
    const keyframeIds: string[] = [];
    try {
      for (const frame of frames) {
        const output = path.join(dir, `${frame}.png`);
        await renderStill({
          composition,
          serveUrl,
          output,
          frame,
          inputProps,
          puppeteerInstance: browser,
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

  return { renderKeyframes };
};
