import { formatTimestamp } from "@/lib/format";
import type { ClipItem } from "@/types/api";

export interface TakeTranscriptRow {
  id: string;
  heading: string;
  text: string;
}

export interface TakeTranscriptPreview {
  rows: TakeTranscriptRow[];
  copyText: string;
}

export function formatTakeTranscript(clips: ClipItem[]): TakeTranscriptPreview {
  const rows = [...clips]
    .sort((a, b) => a.sourceStart - b.sourceStart)
    .map((clip) => {
      const heading = `Take ${clip.index + 1}  ${formatTimestamp(clip.sourceStart)}–${formatTimestamp(clip.sourceEnd)}`;
      return {
        id: clip.id,
        heading,
        text: clip.text.trim(),
      };
    });

  const copyText = rows
    .map((row) => (row.text ? `${row.heading}\n${row.text}` : row.heading))
    .join("\n\n");

  return { rows, copyText };
}
