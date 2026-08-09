import { AudioLines, Film } from "lucide-react";

import {
  TRACK_HEIGHT,
  TRACK_ROW_HEIGHT,
  TRIM_HANDLE_WIDTH,
} from "@/features/editor/timeline/constants";
import { useDragState } from "@/features/editor/timeline/drag-state";
import { useTimelineDrag } from "@/features/editor/timeline/useTimelineDrag";
import { WaveformCanvas } from "@/features/editor/timeline/WaveformCanvas";
import { timeToPx } from "@/lib/timeline/geometry";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline-store";
import { MIN_CLIP_DURATION, type Clip } from "@/types/timeline";

interface ClipBlockProps {
  clip: Clip;
  selected: boolean;
  pixelsPerSecond: number;
}

export function ClipBlock({ clip, selected, pixelsPerSecond }: ClipBlockProps) {
  const asset = useTimelineStore((state) => state.assets[clip.assetId]);
  const drag = useDragState();
  const { beginMove, beginTrim } = useTimelineDrag();

  const isDragging = drag.kind !== null && drag.clipIds.includes(clip.id);
  const isTrimming = drag.kind === "trim" && drag.primaryId === clip.id;

  let start = clip.start;
  let duration = clip.duration;
  let sourceIn = clip.sourceIn;

  if (isDragging && drag.kind === "move") {
    start += drag.deltaTime;
  } else if (isTrimming) {
    if (drag.edge === "start") {
      const shift = drag.trimTime - clip.start;
      start = drag.trimTime;
      sourceIn = clip.sourceIn + shift;
      duration = clip.duration - shift;
    } else {
      duration = drag.trimTime - clip.start;
    }
  }
  duration = Math.max(duration, MIN_CLIP_DURATION);

  const isAudio = asset?.kind === "audio" || clip.trackId.startsWith("A");
  const width = Math.max(2, timeToPx(duration, pixelsPerSecond));
  const height = TRACK_HEIGHT;
  const label = asset?.name ?? "Missing media";
  const waveformRevision = `${asset?.waveform ?? "idle"}`;

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      title={`${label} — drag to move, drag the edges to trim`}
      onPointerDown={(event) => beginMove(event, clip)}
      className={cn(
        "group absolute top-0 overflow-hidden rounded-md border text-left transition-shadow",
        isAudio
          ? "border-emerald-500/40 bg-emerald-500/20"
          : "border-primary/40 bg-primary/25",
        selected && "ring-2 ring-ring ring-offset-1 ring-offset-card",
        isDragging && "z-20 shadow-xl",
      )}
      style={{
        left: timeToPx(start, pixelsPerSecond),
        width,
        height,
        transform:
          isDragging && drag.trackShift !== 0
            ? `translateY(${drag.trackShift * TRACK_ROW_HEIGHT}px)`
            : undefined,
        cursor: isDragging ? "grabbing" : "grab",
      }}
    >
      {isAudio && (
        <WaveformCanvas
          assetId={clip.assetId}
          sourceIn={sourceIn}
          duration={duration}
          width={width}
          height={height}
          revision={waveformRevision}
        />
      )}

      <div className="pointer-events-none relative flex items-center gap-1 px-1.5 pt-1">
        {isAudio ? (
          <AudioLines className="size-3 shrink-0 text-emerald-300" />
        ) : (
          <Film className="size-3 shrink-0 text-primary" />
        )}
        <span className="truncate font-mono text-[10px] text-foreground/90">
          {label}
        </span>
      </div>

      {asset?.waveform === "loading" && isAudio && (
        <span className="pointer-events-none absolute bottom-1 left-1.5 font-mono text-[9px] text-muted-foreground">
          reading audio…
        </span>
      )}

      <span
        onPointerDown={(event) => beginTrim(event, clip, "start")}
        className="absolute inset-y-0 left-0 z-10 cursor-ew-resize bg-foreground/0 transition-colors group-hover:bg-foreground/20"
        style={{ width: TRIM_HANDLE_WIDTH }}
      />
      <span
        onPointerDown={(event) => beginTrim(event, clip, "end")}
        className="absolute inset-y-0 right-0 z-10 cursor-ew-resize bg-foreground/0 transition-colors group-hover:bg-foreground/20"
        style={{ width: TRIM_HANDLE_WIDTH }}
      />
    </div>
  );
}
