import { ClipBlock } from "@/features/editor/timeline/ClipBlock";
import {
  TRACK_GAP,
  TRACK_HEIGHT,
} from "@/features/editor/timeline/constants";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline-store";
import type { Clip, Track } from "@/types/timeline";

interface TrackLaneProps {
  track: Track;
  clips: Clip[];
  selectedIds: string[];
  pixelsPerSecond: number;
}

export function TrackLane({
  track,
  clips,
  selectedIds,
  pixelsPerSecond,
}: TrackLaneProps) {
  const clearSelection = useTimelineStore((state) => state.clearSelection);

  return (
    <div
      // Clips being dragged to another track render outside these bounds.
      className={cn(
        "relative overflow-visible border-y border-border/40",
        track.kind === "video" ? "bg-primary/5" : "bg-emerald-500/5",
        track.locked && "opacity-60",
      )}
      style={{ height: TRACK_HEIGHT, marginBottom: TRACK_GAP }}
      onPointerDown={() => clearSelection()}
    >
      {clips.map((clip) => (
        <ClipBlock
          key={clip.id}
          clip={clip}
          selected={selectedIds.includes(clip.id)}
          pixelsPerSecond={pixelsPerSecond}
        />
      ))}
    </div>
  );
}
