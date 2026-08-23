import {
  Link2,
  Link2Off,
  Magnet,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SilenceRemovalButton } from "@/features/silence-removal/SilenceRemovalButton";
import { transport } from "@/features/editor/playback/transport";
import { cn } from "@/lib/utils";
import { useTimelineStore } from "@/stores/timeline-store";

export function TimelineToolbar() {
  const selectedIds = useTimelineStore((state) => state.selectedIds);
  const snapEnabled = useTimelineStore((state) => state.snapEnabled);
  const linkedSelection = useTimelineStore((state) => state.linkedSelection);
  const canUndo = useTimelineStore((state) => state.past.length > 0);
  const canRedo = useTimelineStore((state) => state.future.length > 0);
  const hasClips = useTimelineStore((state) => state.clips.length > 0);

  const splitAt = useTimelineStore((state) => state.splitAt);
  const deleteClips = useTimelineStore((state) => state.deleteClips);
  const toggleSnap = useTimelineStore((state) => state.toggleSnap);
  const toggleLinkedSelection = useTimelineStore(
    (state) => state.toggleLinkedSelection,
  );
  const zoomBy = useTimelineStore((state) => state.zoomBy);
  const undo = useTimelineStore((state) => state.undo);
  const redo = useTimelineStore((state) => state.redo);

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-muted/30 px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        title="Split at playhead (S) — selected clips, or every track when nothing is selected"
        disabled={!hasClips}
        onClick={() => splitAt(transport.getTime(), selectedIds)}
      >
        <Scissors className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Delete selected clips (Delete)"
        disabled={selectedIds.length === 0}
        onClick={() => deleteClips(selectedIds)}
      >
        <Trash2 className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="icon-sm"
        title={snapEnabled ? "Snapping on" : "Snapping off"}
        onClick={toggleSnap}
      >
        <Magnet className={cn("size-4", snapEnabled && "text-primary")} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title={
          linkedSelection
            ? "Linked audio and video edit together — click to unlink (hold Alt to override per drag)"
            : "Audio and video edit independently"
        }
        onClick={toggleLinkedSelection}
      >
        {linkedSelection ? (
          <Link2 className="size-4 text-primary" />
        ) : (
          <Link2Off className="size-4" />
        )}
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        variant="ghost"
        size="icon-sm"
        title="Undo (Cmd+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title="Redo (Shift+Cmd+Z)"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2 className="size-4" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <SilenceRemovalButton />

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          title="Zoom out (-)"
          onClick={() => zoomBy(1 / 1.25)}
        >
          <ZoomOut className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="Zoom in (+)"
          onClick={() => zoomBy(1.25)}
        >
          <ZoomIn className="size-4" />
        </Button>
      </div>
    </div>
  );
}
