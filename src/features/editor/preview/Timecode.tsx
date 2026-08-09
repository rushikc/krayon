import { useEffect, useRef } from "react";

import { transport } from "@/features/editor/playback/transport";
import { formatTimecode } from "@/lib/timeline/geometry";
import { useTimelineStore } from "@/stores/timeline-store";

/**
 * Writes the playhead position straight to the DOM on every frame — React
 * doesn't need to re-render 60 times a second for a text node.
 */
export function Timecode() {
  const fps = useTimelineStore((state) => state.fps);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    return transport.subscribeTime((time) => {
      const node = ref.current;
      if (node) node.textContent = formatTimecode(time, fps);
    });
  }, [fps]);

  return (
    <span
      ref={ref}
      className="font-mono text-xs tabular-nums text-foreground"
      aria-label="Playhead position"
    >
      {formatTimecode(0, fps)}
    </span>
  );
}
