import type { LessonSegment } from './types.ts';

export const totalFrames = (segments: LessonSegment[]) =>
  segments.reduce((total, segment) => total + segment.durationInFrames, 0);

export const segmentStartFrames = (segments: LessonSegment[]) => {
  let cursor = 0;
  return segments.map((segment) => {
    const start = cursor;
    cursor += segment.durationInFrames;
    return start;
  });
};

export const segmentIndexAtFrame = (frame: number, segments: LessonSegment[]) => {
  const starts = segmentStartFrames(segments);
  let index = 0;
  for (let i = 0; i < starts.length; i++) {
    if (frame >= starts[i]) index = i;
  }
  return index;
};

export const formatFrames = (frames: number, fps: number) =>
  `${(frames / fps).toFixed(1)}s`;
