import type { SourceSegment } from "@/types/api";

/** Normalize segment times from API (handles legacy snake_case responses). */
export function normalizeSegment(
  seg: SourceSegment & { source_start?: number; source_end?: number },
): SourceSegment {
  const sourceStart = seg.sourceStart ?? seg.source_start;
  const sourceEnd = seg.sourceEnd ?? seg.source_end;
  return {
    sourceStart: Number.isFinite(sourceStart) ? sourceStart! : 0,
    sourceEnd: Number.isFinite(sourceEnd) ? sourceEnd! : 0,
  };
}

export function safeVideoTime(time: number | undefined | null): number | null {
  if (time == null || !Number.isFinite(time) || time < 0) return null;
  return time;
}

export function seekVideo(video: HTMLVideoElement, time: number | undefined | null): boolean {
  const safe = safeVideoTime(time);
  if (safe === null) return false;
  try {
    video.currentTime = safe;
    return true;
  } catch {
    return false;
  }
}
