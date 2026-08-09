import { Lock, LockOpen, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  TRACK_GAP,
  TRACK_HEIGHT,
} from "@/features/editor/timeline/constants";
import { useTimelineStore } from "@/stores/timeline-store";
import type { Track } from "@/types/timeline";

interface TrackHeaderProps {
  track: Track;
}

export function TrackHeader({ track }: TrackHeaderProps) {
  const setTrackMuted = useTimelineStore((state) => state.setTrackMuted);
  const setTrackLocked = useTimelineStore((state) => state.setTrackLocked);

  return (
    <div
      className="flex items-center justify-between gap-1 border-y border-border/40 bg-muted/20 px-2"
      style={{ height: TRACK_HEIGHT, marginBottom: TRACK_GAP }}
    >
      <span className="truncate font-mono text-[11px] text-muted-foreground">
        {track.name}
      </span>
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          title={track.muted ? "Unmute track" : "Mute track"}
          onClick={() => setTrackMuted(track.id, !track.muted)}
        >
          {track.muted ? (
            <VolumeX className="size-3 text-destructive" />
          ) : (
            <Volume2 className="size-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={track.locked ? "Unlock track" : "Lock track"}
          onClick={() => setTrackLocked(track.id, !track.locked)}
        >
          {track.locked ? (
            <Lock className="size-3 text-destructive" />
          ) : (
            <LockOpen className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}
