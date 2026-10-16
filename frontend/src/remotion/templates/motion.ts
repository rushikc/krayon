import { interpolate } from 'remotion';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

export const resolvedAppearAt = (
  index: number,
  count: number,
  durationInFrames: number,
  appearAt?: number,
) => {
  if (appearAt !== undefined) return appearAt;
  if (count <= 1) return 8;
  return Math.round((index / count) * durationInFrames * 0.6);
};

export const enterStyle = (frame: number, at: number) => {
  const opacity = interpolate(frame, [at, at + 10], [0, 1], clamp);
  const y = interpolate(frame, [at, at + 10], [14, 0], clamp);
  return { opacity, transform: `translateY(${y}px)` };
};

export const drawOffset = (frame: number, at: number) =>
  interpolate(frame, [at, at + 18], [1, 0], clamp);
