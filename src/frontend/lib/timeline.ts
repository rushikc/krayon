import type { ClipItem } from "@/types/api";
import { formatDuration } from "@/lib/format";

export type TimelineEntry =
  | { kind: "speech"; clip: ClipItem; start: number; end: number }
  | { kind: "silence"; start: number; end: number; label: string };

export function buildTimeline(
  sourceDuration: number | null | undefined,
  clips: ClipItem[],
): TimelineEntry[] {
  if (!clips.length) return [];

  const sorted = [...clips].sort((a, b) => a.sourceStart - b.sourceStart);
  const duration = sourceDuration ?? sorted[sorted.length - 1]?.sourceEnd ?? 0;
  const entries: TimelineEntry[] = [];

  const pushSilence = (start: number, end: number) => {
    if (end - start < 0.05) return;
    entries.push({
      kind: "silence",
      start,
      end,
      label: `Silence · ${formatDuration(start)}–${formatDuration(end)}`,
    });
  };

  pushSilence(0, sorted[0].sourceStart);

  for (let i = 0; i < sorted.length; i++) {
    const clip = sorted[i];
    entries.push({
      kind: "speech",
      clip,
      start: clip.sourceStart,
      end: clip.sourceEnd,
    });
    const next = sorted[i + 1];
    if (next) {
      pushSilence(clip.sourceEnd, next.sourceStart);
    }
  }

  pushSilence(sorted[sorted.length - 1].sourceEnd, duration);
  return entries;
}

export function isTimelineEntrySelected(
  entry: TimelineEntry,
  selectedEntry: { kind: "speech"; clipId: string } | { kind: "silence"; start: number; end: number } | null,
): boolean {
  if (!selectedEntry) return false;
  if (entry.kind === "speech" && selectedEntry.kind === "speech") {
    return entry.clip.id === selectedEntry.clipId;
  }
  if (entry.kind === "silence" && selectedEntry.kind === "silence") {
    return (
      Math.abs(entry.start - selectedEntry.start) < 0.01 &&
      Math.abs(entry.end - selectedEntry.end) < 0.01
    );
  }
  return false;
}
