export const MIN_PIXELS_PER_SECOND = 4;
export const MAX_PIXELS_PER_SECOND = 600;
export const DEFAULT_PIXELS_PER_SECOND = 60;

/** Blank space kept to the right of the last clip so it can be dragged out. */
export const TIMELINE_TAIL_SECONDS = 12;

export function clampZoom(pixelsPerSecond: number): number {
  return Math.min(
    MAX_PIXELS_PER_SECOND,
    Math.max(MIN_PIXELS_PER_SECOND, pixelsPerSecond),
  );
}

export function timeToPx(time: number, pixelsPerSecond: number): number {
  return time * pixelsPerSecond;
}

export function pxToTime(px: number, pixelsPerSecond: number): number {
  return px / pixelsPerSecond;
}

export function snapToFrame(time: number, fps: number): number {
  if (!fps) return time;
  return Math.round(time * fps) / fps;
}

export function formatTimecode(seconds: number, fps: number): string {
  const safe = Math.max(0, seconds);
  const totalFrames = Math.round(safe * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(mins)}:${pad(secs)}:${pad(frames)}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const TICK_INTERVALS = [
  0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800,
];

export interface Tick {
  time: number;
  major: boolean;
}

/**
 * Ruler ticks whose density follows the zoom level: labelled majors stay at
 * least ~72px apart, with four minor ticks in between.
 */
export function generateTicks(
  duration: number,
  pixelsPerSecond: number,
): { ticks: Tick[]; majorInterval: number } {
  const majorInterval =
    TICK_INTERVALS.find((interval) => interval * pixelsPerSecond >= 72) ??
    TICK_INTERVALS[TICK_INTERVALS.length - 1];
  const minorInterval = majorInterval / 4;
  const ticks: Tick[] = [];
  const count = Math.floor(duration / minorInterval) + 1;

  for (let index = 0; index < count; index += 1) {
    const time = index * minorInterval;
    const isMajor = Math.abs(time / majorInterval - Math.round(time / majorInterval)) < 1e-6;
    if (!isMajor && minorInterval * pixelsPerSecond < 8) continue;
    ticks.push({ time, major: isMajor });
  }

  return { ticks, majorInterval };
}
