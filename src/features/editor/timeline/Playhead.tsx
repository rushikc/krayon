import { useEffect, useRef, type RefObject } from "react";

import { transport } from "@/features/editor/playback/transport";
import { beginScrub } from "@/features/editor/timeline/scrub";
import { timeToPx } from "@/lib/timeline/geometry";

interface PlayheadProps {
  pixelsPerSecond: number;
  fps: number;
  contentRef: RefObject<HTMLDivElement | null>;
}

/**
 * Position is written as a transform straight from the clock subscription, so
 * the playhead tracks playback without re-rendering the timeline.
 */
export function Playhead({ pixelsPerSecond, fps, contentRef }: PlayheadProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return transport.subscribeTime((time) => {
      const node = ref.current;
      if (node) {
        node.style.transform = `translateX(${timeToPx(time, pixelsPerSecond)}px)`;
      }
    });
  }, [pixelsPerSecond]);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-y-0 left-0 z-40 w-px bg-red-500"
    >
      <div
        className="pointer-events-auto absolute -left-[6px] top-0 h-3 w-3 cursor-ew-resize rounded-b-sm bg-red-500"
        onPointerDown={(event) => {
          const content = contentRef.current;
          if (!content) return;
          event.preventDefault();
          event.stopPropagation();
          beginScrub(event.clientX, content, pixelsPerSecond, fps);
        }}
      />
    </div>
  );
}
