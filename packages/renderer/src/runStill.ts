import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { collectKeyframeFrames } from '@krayon/shared';
import type { GeneratedSegment } from '@krayon/shared';
import path from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

let serveUrl: string | null = process.env.SERVE_URL || null;

const bundleUrl = async () => {
  if (serveUrl) return serveUrl;
  serveUrl = await bundle({
    entryPoint: path.resolve('packages/shared/dist/remotion/entry.js'),
    webpackOverride: (config) => config,
  });
  return serveUrl;
};

/**
 * Renders the keyframe stills for one segment. The Remotion bundle is built into the image
 * and SERVE_URL points at it, so a cold start does not webpack the composition again.
 */
export const renderStills = async (input: {
  uid: string;
  lessonId: string;
  segmentId: string;
  attempt: number;
  round: number;
  segment: GeneratedSegment;
}) => {
  const url = await bundleUrl();
  const composition = await selectComposition({
    serveUrl: url,
    id: 'GeneratedLesson',
    inputProps: { segments: [input.segment], audio: {} },
  });
  const frames = collectKeyframeFrames(input.segment, 4);
  if (frames.length === 0) frames.push(0);
  const keys: string[] = [];
  const pngs: string[] = [];
  const dir = await mkdtemp(path.join(tmpdir(), 'krayon-still-'));
  try {
    for (const frame of frames) {
      const file = path.join(dir, `${frame}.png`);
      await renderStill({ composition, serveUrl: url, frame, output: file });
      keys.push(`users/${input.uid}/keyframes/${input.lessonId}/${input.segmentId}/a${input.attempt}-r${input.round}-${frame}.png`);
      pngs.push((await readFile(file)).toString('base64'));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return { frames, keys, pngs };
};
