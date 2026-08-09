import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  seekToNextEdge,
  seekToPreviousEdge,
  stepFrames,
} from "@/features/editor/playback/navigation";
import {
  transport,
  useTransportDuration,
  useTransportPlaying,
} from "@/features/editor/playback/transport";
import { Timecode } from "@/features/editor/preview/Timecode";
import { formatTimecode } from "@/lib/timeline/geometry";
import { useTimelineStore } from "@/stores/timeline-store";

export function TransportBar() {
  const isPlaying = useTransportPlaying();
  const duration = useTransportDuration();
  const fps = useTimelineStore((state) => state.fps);
  const isEmpty = duration <= 0;

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-t border-border bg-card px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        title="Go to start (Home)"
        disabled={isEmpty}
        onClick={() => transport.seek(0)}
      >
        <ChevronFirst className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Previous edit (Up)"
        disabled={isEmpty}
        onClick={seekToPreviousEdge}
      >
        <SkipBack className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Back one frame (Left)"
        disabled={isEmpty}
        onClick={() => stepFrames(-1)}
      >
        <span className="font-mono text-[10px]">-1</span>
      </Button>

      <Button
        variant={isPlaying ? "secondary" : "default"}
        size="icon-sm"
        title="Play / Pause (Space)"
        disabled={isEmpty}
        onClick={() => transport.toggle()}
      >
        {isPlaying ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 fill-current" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        title="Forward one frame (Right)"
        disabled={isEmpty}
        onClick={() => stepFrames(1)}
      >
        <span className="font-mono text-[10px]">+1</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Next edit (Down)"
        disabled={isEmpty}
        onClick={seekToNextEdge}
      >
        <SkipForward className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Go to end (End)"
        disabled={isEmpty}
        onClick={() => transport.seek(duration)}
      >
        <ChevronLast className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Stop"
        disabled={isEmpty}
        onClick={() => transport.stop()}
      >
        <Square className="size-3.5" />
      </Button>

      <div className="ml-3 flex items-baseline gap-1.5">
        <Timecode />
        <span className="font-mono text-xs text-muted-foreground">
          / {formatTimecode(duration, fps)}
        </span>
      </div>
    </div>
  );
}
