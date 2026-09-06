import { forwardRef } from "react";
import { Minus, Plus } from "lucide-react";

import {
  TIMELINE_RULER_HEIGHT,
  TRACK_ROW_HEIGHT,
} from "@/components/editor/timeline/lib/timeMath";
import { Button } from "@/components/ui/button";

interface TrackLabelsProps {
  trackCount: number;
  onDeleteTrack: (index: number) => void;
  onAddTrack: () => void;
}

export const TrackLabels = forwardRef<HTMLDivElement, TrackLabelsProps>(
  function TrackLabels({ trackCount, onDeleteTrack, onAddTrack }, ref) {
    return (
      <div className="z-20 flex h-full min-h-0 w-10 shrink-0 flex-col border-r border-border bg-card">
        <div
          ref={ref}
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden"
        >
          <div
            className="sticky top-0 z-10 shrink-0 border-b border-border bg-card"
            style={{ height: TIMELINE_RULER_HEIGHT }}
          />
          {Array.from({ length: trackCount }, (_, track) => (
            <div
              key={track}
              className="box-border flex shrink-0 items-center justify-center border-b border-border/80"
              style={{ height: TRACK_ROW_HEIGHT }}
            >
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete track ${track + 1}`}
                disabled={trackCount <= 1}
                className="text-red-500 hover:bg-transparent hover:text-red-600"
                onClick={() => onDeleteTrack(track)}
              >
                <Minus />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-center border-t border-border py-1">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Add track"
            onClick={onAddTrack}
          >
            <Plus />
          </Button>
        </div>
      </div>
    );
  },
);
