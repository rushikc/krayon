import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  canResizeSegmentTo,
  computeSegmentTimingAfterResize,
} from "@/components/editor/timeline/lib/timeMath";
import type { CanvasElement } from "@/types/canvas";

import type { SegmentTiming } from "./useSegmentDrag";

export type SegmentResizeEdge = "left" | "right";

export interface SegmentResizePreview {
  segmentId: string;
  start: number;
  end: number;
}

interface SegmentResizeState {
  segment: SegmentTiming;
  edge: SegmentResizeEdge;
  pointerId: number;
  startClientX: number;
  original: { start: number; end: number };
  lastDeltaX: number;
  lastProposed: { start: number; end: number };
  rafId: number | null;
  wasMoved: boolean;
}

interface UseSegmentResizeOptions {
  elements: CanvasElement[];
  duration: number;
  pxPerSecond: number;
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

export function useSegmentResize({
  elements,
  duration,
  pxPerSecond,
  onSelect,
  onCommit,
}: UseSegmentResizeOptions) {
  const resizeRef = useRef<SegmentResizeState | null>(null);
  const windowListenersRef = useRef<{
    move: (event: PointerEvent) => void;
    up: (event: PointerEvent) => void;
  } | null>(null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const [resizingSegmentId, setResizingSegmentId] = useState<string | null>(
    null,
  );
  const [resizePreview, setResizePreview] =
    useState<SegmentResizePreview | null>(null);

  const applyGlobalResizeCursor = useCallback(() => {
    document.body.style.cursor = "ew-resize";
    document.documentElement.style.cursor = "ew-resize";
  }, []);

  const clearGlobalResizeCursor = useCallback(() => {
    document.body.style.cursor = "";
    document.documentElement.style.cursor = "";
  }, []);

  const removeWindowListeners = useCallback(() => {
    const listeners = windowListenersRef.current;
    if (!listeners) {
      return;
    }
    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.up);
    window.removeEventListener("pointercancel", listeners.up);
    windowListenersRef.current = null;
  }, []);

  const getSegmentDisplayTiming = useCallback(
    (segment: SegmentTiming) => {
      if (resizePreview?.segmentId === segment.id) {
        return { start: resizePreview.start, end: resizePreview.end };
      }
      return { start: segment.start, end: segment.end };
    },
    [resizePreview],
  );

  const finishSegmentResize = useCallback(
    (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) {
        return;
      }

      removeWindowListeners();

      if (resize.rafId !== null) {
        window.cancelAnimationFrame(resize.rafId);
      }

      const { segment, wasMoved, lastProposed } = resize;
      resizeRef.current = null;

      if (wasMoved && lastProposed) {
        const others = getTrackOthers(
          elementsRef.current,
          segment.track,
          segment.id,
        );
        if (canResizeSegmentTo(lastProposed, others, duration)) {
          flushSync(() => {
            onCommit(segment.id, {
              start: lastProposed.start,
              end: lastProposed.end,
              track: segment.track,
            });
          });
        }
      }

      clearGlobalResizeCursor();
      setResizePreview(null);
      setResizingSegmentId(null);
      onSelect(segment.id);
    },
    [clearGlobalResizeCursor, duration, onCommit, onSelect, removeWindowListeners],
  );

  const onResizePointerDown = useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      segment: SegmentTiming,
      edge: SegmentResizeEdge,
    ) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();
      event.preventDefault();

      const original = { start: segment.start, end: segment.end };

      onSelect(segment.id);
      setResizingSegmentId(segment.id);
      setResizePreview({
        segmentId: segment.id,
        start: original.start,
        end: original.end,
      });
      applyGlobalResizeCursor();

      resizeRef.current = {
        segment,
        edge,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        original,
        lastDeltaX: 0,
        lastProposed: { ...original },
        rafId: null,
        wasMoved: false,
      };

      const onWindowMove = (moveEvent: PointerEvent) => {
        const active = resizeRef.current;
        if (!active || active.pointerId !== moveEvent.pointerId) {
          return;
        }

        applyGlobalResizeCursor();
        active.lastDeltaX = moveEvent.clientX - active.startClientX;
        active.wasMoved ||= Math.abs(active.lastDeltaX) > 2;

        if (active.rafId !== null) {
          return;
        }

        active.rafId = window.requestAnimationFrame(() => {
          const latest = resizeRef.current;
          if (!latest) {
            return;
          }

          latest.rafId = null;
          const others = getTrackOthers(
            elementsRef.current,
            latest.segment.track,
            latest.segment.id,
          );
          const proposed = computeSegmentTimingAfterResize(
            latest.original,
            latest.edge,
            latest.lastDeltaX,
            pxPerSecond,
            duration,
            others,
          );

          latest.lastProposed = proposed;
          setResizePreview({
            segmentId: latest.segment.id,
            start: proposed.start,
            end: proposed.end,
          });
        });
      };

      const onWindowUp = (upEvent: PointerEvent) => {
        finishSegmentResize(upEvent);
      };

      windowListenersRef.current = { move: onWindowMove, up: onWindowUp };
      window.addEventListener("pointermove", onWindowMove);
      window.addEventListener("pointerup", onWindowUp);
      window.addEventListener("pointercancel", onWindowUp);
    },
    [
      applyGlobalResizeCursor,
      duration,
      finishSegmentResize,
      onSelect,
      pxPerSecond,
    ],
  );

  return {
    onResizePointerDown,
    isResizing: resizingSegmentId !== null,
    resizingSegmentId,
    getSegmentDisplayTiming,
  };
}
