import type { CanvasElement } from "@/types/canvas";

export const REEL_CLOCK_FPS = 30;

export function durationFromElements(elements: CanvasElement[]): number {
  let maxEnd = 0;
  for (const element of elements) {
    maxEnd = Math.max(maxEnd, element.time.end, element.time.start);
  }
  return Math.max(1, maxEnd);
}

/** Last timestamp that is still inside `[start, end)` for clips that end at `duration`. */
export function lastVisibleTime(
  duration: number,
  fps = REEL_CLOCK_FPS,
): number {
  const safe = Math.max(duration, 0);
  if (safe <= 0) {
    return 0;
  }
  return Math.max(0, safe - 1 / fps);
}
