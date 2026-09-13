import { Pause, Play } from "lucide-react";

import { formatRulerLabel } from "@/components/editor/timeline/lib/timeMath";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "@/stores/canvas-store";

export function PlaybackBar() {
  const currentTime = useCanvasStore((state) => state.currentTime);
  const duration = useCanvasStore((state) => state.duration);
  const isPlaying = useCanvasStore((state) => state.isPlaying);
  const togglePlayback = useCanvasStore((state) => state.togglePlayback);

  return (
    <div className="flex items-center justify-start gap-3 px-3 py-2">
      <Button
        type="button"
        size="icon"
        variant="outline"
        aria-label={isPlaying ? "Pause" : "Play"}
        aria-pressed={isPlaying}
        onClick={togglePlayback}
        className="size-12 rounded-full [&_svg]:size-6"
      >
        {isPlaying ? <Pause /> : <Play />}
      </Button>
      <span className="font-mono text-sm tabular-nums text-muted-foreground">
        {formatRulerLabel(currentTime)} / {formatRulerLabel(duration)}
      </span>
    </div>
  );
}
