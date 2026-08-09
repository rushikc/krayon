import type { RefObject } from "react";

import { RULER_HEIGHT } from "@/features/editor/timeline/constants";
import { beginScrub } from "@/features/editor/timeline/scrub";
import { formatClock, generateTicks, timeToPx } from "@/lib/timeline/geometry";

interface TimelineRulerProps {
  duration: number;
  pixelsPerSecond: number;
  fps: number;
  contentRef: RefObject<HTMLDivElement | null>;
}

export function TimelineRuler({
  duration,
  pixelsPerSecond,
  fps,
  contentRef,
}: TimelineRulerProps) {
  const { ticks } = generateTicks(duration, pixelsPerSecond);

  return (
    <div
      className="relative z-30 cursor-ew-resize select-none border-b border-border bg-card"
      style={{ height: RULER_HEIGHT }}
      onPointerDown={(event) => {
        const content = contentRef.current;
        if (!content) return;
        event.preventDefault();
        beginScrub(event.clientX, content, pixelsPerSecond, fps);
      }}
    >
      {ticks.map((tick) => (
        <div
          key={tick.time}
          className="absolute bottom-0"
          style={{ left: timeToPx(tick.time, pixelsPerSecond) }}
        >
          <div
            className={tick.major ? "w-px bg-border" : "w-px bg-border/60"}
            style={{ height: tick.major ? 10 : 5 }}
          />
          {tick.major && (
            <span className="absolute bottom-3 left-1 font-mono text-[10px] text-muted-foreground">
              {formatClock(tick.time)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
