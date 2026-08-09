import { clipEdges } from "@/lib/timeline/ops";
import { clipEnd, type Clip } from "@/types/timeline";

/** Snap distance in pixels, converted to seconds by the caller's zoom level. */
export const SNAP_THRESHOLD_PX = 8;

export function collectSnapTargets(
  clips: Clip[],
  excludeIds: Iterable<string>,
  playhead: number,
): number[] {
  return [...clipEdges(clips, excludeIds), playhead];
}

/** Nearest target within tolerance, or the original time. */
export function snapTime(
  time: number,
  targets: number[],
  tolerance: number,
): number {
  let best = time;
  let bestDistance = tolerance;
  for (const target of targets) {
    const distance = Math.abs(target - time);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Snaps a drag delta so that any edge of the dragged group can land on a
 * target. Both edges of every moving clip are candidates, which is what makes
 * clips feel like they click together.
 */
export function snapDelta(
  delta: number,
  movingClips: Clip[],
  targets: number[],
  tolerance: number,
): number {
  const edges = movingClips.flatMap((clip) => [clip.start, clipEnd(clip)]);
  let best = delta;
  let bestDistance = tolerance;
  for (const edge of edges) {
    for (const target of targets) {
      const candidate = target - edge;
      const distance = Math.abs(candidate - delta);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}
