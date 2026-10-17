import type { GeneratedSegment } from './scene.js';

const visit = (value: unknown, frames: number[]) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, frames);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.appearAt === 'number') frames.push(record.appearAt + 10);
  for (const child of Object.values(record)) visit(child, frames);
};

/** Frames a reviewer should see: each item's appearAt + 10, plus the frame just before the end. */
export const collectKeyframeFrames = (segment: GeneratedSegment, max: number): number[] => {
  const raw: number[] = [];
  visit(segment.scene?.layout, raw);
  raw.push(segment.durationInFrames - 5);
  const last = Math.max(0, segment.durationInFrames - 1);
  const unique = [...new Set(raw.map((frame) => Math.max(0, Math.min(last, Math.round(frame)))))];
  unique.sort((a, b) => a - b);
  return unique.slice(0, Math.max(0, max));
};
