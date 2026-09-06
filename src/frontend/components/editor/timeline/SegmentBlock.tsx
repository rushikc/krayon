import { useRef } from "react";

import {
  segmentWidthPercent,
  timeToPercent,
} from "@/components/editor/timeline/lib/timeMath";
import { cn } from "@/lib/utils";
import { getElementLabel, type CanvasElement } from "@/types/canvas";

import type { useSegmentDrag } from "./hooks/useSegmentDrag";
import type { useSegmentResize } from "./hooks/useSegmentResize";

type DragHandlers = ReturnType<typeof useSegmentDrag>;
type ResizeHandlers = ReturnType<typeof useSegmentResize>;

const TYPE_PILL_CLASS: Record<CanvasElement["type"], string> = {
  box: "bg-violet-600/90",
  number: "bg-slate-700/90",
  arrow: "bg-sky-600/90",
};

interface SegmentBlockProps {
  element: CanvasElement;
  duration: number;
  selected: boolean;
  drag: DragHandlers;
  resize: ResizeHandlers;
}

export function SegmentBlock({
  element,
  duration,
  selected,
  drag,
  resize,
}: SegmentBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const segment = {
    id: element.id,
    start: element.time.start,
    end: element.time.end,
    track: element.time.track,
  };
  const { start, end } = resize.getSegmentDisplayTiming(segment);
  const isDragging = drag.draggingSegmentId === element.id;
  const isResizing = resize.resizingSegmentId === element.id;
  const showHandles = !isDragging && (!resize.isResizing || isResizing);
  const label = getElementLabel(element);

  return (
    <div
      ref={containerRef}
      data-timeline-interactive="true"
      className={cn(
        "group absolute inset-y-1 will-change-transform",
        selected ? "z-40" : "z-10",
        isDragging ? "cursor-grabbing" : resize.isResizing ? "cursor-ew-resize" : "",
      )}
      style={{
        left: timeToPercent(start, duration),
        width: segmentWidthPercent(start, end, duration),
      }}
      onPointerCancel={drag.onSegmentPointerCancel}
      onPointerMove={drag.onSegmentPointerMove}
      onPointerUp={drag.onSegmentPointerUp}
    >
      <div
        className={cn(
          "relative h-full overflow-hidden rounded-md border border-black/10 text-white transition-[box-shadow]",
          TYPE_PILL_CLASS[element.type],
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-card",
          isDragging ? "" : "hover:brightness-105",
        )}
        onPointerDown={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-segment-resize-handle="true"]')
          ) {
            return;
          }
          const container = containerRef.current;
          if (!container) {
            return;
          }
          drag.onSegmentPointerDown(event, segment, container);
        }}
      >
        {showHandles ? (
          <>
            <button
              type="button"
              data-segment-resize-handle="true"
              aria-label={`Resize ${label} start`}
              className={cn(
                "absolute inset-y-0 left-0 z-10 flex w-2.5 cursor-ew-resize touch-none items-stretch justify-start border-0 bg-transparent p-0",
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                isResizing && "opacity-100",
              )}
              onPointerDown={(event) =>
                resize.onResizePointerDown(event, segment, "left")
              }
            >
              <span
                className="pointer-events-none block h-full w-1.5 rounded-l-md bg-black/80"
                aria-hidden
              />
            </button>
            <button
              type="button"
              data-segment-resize-handle="true"
              aria-label={`Resize ${label} end`}
              className={cn(
                "absolute inset-y-0 right-0 z-10 flex w-2.5 cursor-ew-resize touch-none items-stretch justify-end border-0 bg-transparent p-0",
                "opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
                isResizing && "opacity-100",
              )}
              onPointerDown={(event) =>
                resize.onResizePointerDown(event, segment, "right")
              }
            >
              <span
                className="pointer-events-none block h-full w-1.5 rounded-r-md bg-black/80"
                aria-hidden
              />
            </button>
          </>
        ) : null}

        <div
          className={cn(
            "relative z-0 flex h-full flex-col items-center justify-center gap-0.5 px-2 text-center",
            isDragging
              ? "cursor-grabbing"
              : resize.isResizing
                ? "cursor-ew-resize"
                : "cursor-grab",
          )}
        >
          <span className="max-w-full truncate text-[10px] font-medium uppercase tracking-wide opacity-80">
            {element.type}
          </span>
          <span className="max-w-full truncate text-[12px] font-medium leading-none">
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
