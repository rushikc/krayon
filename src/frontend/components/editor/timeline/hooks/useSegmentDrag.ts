import { useCallback, useRef, useState } from "react";

import {
  canPlaceSegment,
  computeSegmentTimingAfterDrag,
  resolveSegmentDrop,
  TRACK_ROW_HEIGHT,
  wouldRejectSegmentDrop,
} from "@/components/editor/timeline/lib/timeMath";
import type { CanvasElement } from "@/types/canvas";

export interface SegmentTiming {
  id: string;
  start: number;
  end: number;
  track: number;
}

interface SegmentDragState {
  element: HTMLDivElement;
  id: string;
  pointerId: number;
  segment: SegmentTiming;
  startClientX: number;
  startClientY: number;
  lastDeltaX: number;
  lastDeltaY: number;
  rafId: number | null;
  wasMoved: boolean;
}

interface UseSegmentDragOptions {
  elements: CanvasElement[];
  duration: number;
  pxPerSecond: number;
  trackCount: number;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, next: { start: number; end: number; track: number }) => void;
}

function getTrackOthers(
  elements: CanvasElement[],
  track: number,
  excludeId: string,
): { start: number; end: number }[] {
  return elements
    .filter((el) => el.id !== excludeId && el.time.track === track)
    .map((el) => ({ start: el.time.start, end: el.time.end }));
}

export function useSegmentDrag({
  elements,
  duration,
  pxPerSecond,
  trackCount,
  onSelect,
  onCommit,
}: UseSegmentDragOptions) {
  const dragRef = useRef<SegmentDragState | null>(null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const [draggingSegmentId, setDraggingSegmentId] = useState<string | null>(null);

  const commitDrag = useCallback(
    (segment: SegmentTiming, deltaX: number, deltaY: number) => {
      const original = { start: segment.start, end: segment.end };
      const proposed = computeSegmentTimingAfterDrag(
        segment,
        deltaX,
        pxPerSecond,
        duration,
      );

      const trackDelta = Math.round(deltaY / TRACK_ROW_HEIGHT);
      const proposedTrack = Math.max(
        0,
        Math.min(trackCount - 1, segment.track + trackDelta),
      );

      const othersOnProposed = getTrackOthers(
        elementsRef.current,
        proposedTrack,
        segment.id,
      );

      let nextTrack = proposedTrack;
      let nextTiming = resolveSegmentDrop(
        original,
        proposed,
        othersOnProposed,
        duration,
      );

      if (
        proposedTrack !== segment.track &&
        !canPlaceSegment(
          nextTiming.start,
          nextTiming.end,
          othersOnProposed,
          duration,
        )
      ) {
        nextTrack = segment.track;
        const othersOnOriginal = getTrackOthers(
          elementsRef.current,
          segment.track,
          segment.id,
        );
        nextTiming = resolveSegmentDrop(
          original,
          proposed,
          othersOnOriginal,
          duration,
        );
      }

      onCommit(segment.id, {
        start: nextTiming.start,
        end: nextTiming.end,
        track: nextTrack,
      });
    },
    [duration, onCommit, pxPerSecond, trackCount],
  );

  const onSegmentPointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLElement>,
      segment: SegmentTiming,
      containerEl: HTMLDivElement,
    ) => {
      if (event.button !== 0) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest('[data-segment-resize-handle="true"]')
      ) {
        return;
      }

      containerEl.setPointerCapture(event.pointerId);
      onSelect(segment.id);
      setDraggingSegmentId(segment.id);
      dragRef.current = {
        element: containerEl,
        id: segment.id,
        pointerId: event.pointerId,
        segment,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastDeltaX: 0,
        lastDeltaY: 0,
        rafId: null,
        wasMoved: false,
      };
    },
    [onSelect],
  );

  const onSegmentPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      drag.lastDeltaX = event.clientX - drag.startClientX;
      drag.lastDeltaY = event.clientY - drag.startClientY;
      drag.wasMoved ||=
        Math.abs(drag.lastDeltaX) > 3 || Math.abs(drag.lastDeltaY) > 3;

      if (drag.rafId !== null) {
        return;
      }

      drag.rafId = window.requestAnimationFrame(() => {
        const latest = dragRef.current;
        if (!latest) {
          return;
        }

        latest.rafId = null;
        latest.element.style.transform = `translate3d(${latest.lastDeltaX}px, ${latest.lastDeltaY}px, 0)`;

        const proposed = computeSegmentTimingAfterDrag(
          latest.segment,
          latest.lastDeltaX,
          pxPerSecond,
          duration,
        );
        const trackDelta = Math.round(latest.lastDeltaY / TRACK_ROW_HEIGHT);
        const proposedTrack = Math.max(
          0,
          Math.min(trackCount - 1, latest.segment.track + trackDelta),
        );
        const others = getTrackOthers(
          elementsRef.current,
          proposedTrack,
          latest.segment.id,
        );
        const original = {
          start: latest.segment.start,
          end: latest.segment.end,
        };
        const rejected =
          proposedTrack !== latest.segment.track
            ? !canPlaceSegment(
                proposed.start,
                proposed.end,
                others,
                duration,
              )
            : wouldRejectSegmentDrop(original, proposed, others, duration);
        latest.element.style.cursor = rejected ? "not-allowed" : "grabbing";
      });
    },
    [duration, pxPerSecond, trackCount],
  );

  const finishSegmentDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      if (drag.rafId !== null) {
        window.cancelAnimationFrame(drag.rafId);
      }
      if (drag.element.hasPointerCapture(event.pointerId)) {
        drag.element.releasePointerCapture(event.pointerId);
      }

      drag.element.style.transform = "";
      drag.element.style.cursor = "";

      const { segment, lastDeltaX, lastDeltaY, wasMoved } = drag;
      dragRef.current = null;
      setDraggingSegmentId(null);
      onSelect(segment.id);

      if (wasMoved) {
        commitDrag(segment, lastDeltaX, lastDeltaY);
      }
    },
    [commitDrag, onSelect],
  );

  return {
    onSegmentPointerDown,
    onSegmentPointerMove,
    onSegmentPointerUp: finishSegmentDrag,
    onSegmentPointerCancel: finishSegmentDrag,
    draggingSegmentId,
  };
}
