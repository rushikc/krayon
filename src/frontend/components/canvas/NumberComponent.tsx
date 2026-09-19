import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import { clampNumberBounds, matrixToPercents, numberBadgeSize, percentsToNumberMatrix, scaleNumber, ZOOM_FACTOR } from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomOutKey } from "@/lib/canvas-keyboard";
import {
  isCalidrawTheme,
  calidrawStroke,
} from "@/lib/render-theme";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  beginTimelineHistoryTransaction,
  endTimelineHistoryTransaction,
} from "@/stores/timeline-history";
import type { ColorTheme, NumberNode } from "@/types/canvas";

import { SketchFrame } from "./SketchFrame";

interface NumberComponentProps {
  node: NumberNode;
  selected: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
}

const themeStyles: Record<ColorTheme, string> = {
  ink: "bg-canvas-ink text-canvas-surface",
  violet: "bg-canvas-violet text-canvas-ink",
  green: "bg-canvas-green text-canvas-ink",
  blue: "bg-canvas-blue text-canvas-ink",
  sky: "bg-canvas-sky text-canvas-ink",
  lavender: "bg-canvas-lavender text-canvas-ink",
  mint: "bg-canvas-mint text-canvas-ink",
  tan: "bg-canvas-tan text-canvas-ink",
  yellow: "bg-canvas-yellow text-canvas-ink",
  orange: "bg-canvas-orange text-canvas-ink",
  pink: "bg-canvas-pink text-canvas-ink",
  salmon: "bg-canvas-salmon text-canvas-ink",
};

const NUDGE_STEP = 1;
const NUDGE_STEP_SHIFT = 5;

export function NumberComponent({
  node,
  selected,
  canvasRef,
}: NumberComponentProps) {
  const selectElement = useCanvasStore((state) => state.selectElement);
  const updateElement = useCanvasStore((state) => state.updateElement);
  const renderTheme = useCanvasStore((state) => state.renderTheme);
  const calidraw = isCalidrawTheme(renderTheme);
  const stroke = calidrawStroke(node.colorTheme, renderTheme);
  const ink = renderTheme === "calidraw-dark" ? "#f0f0f0" : "#1a1a1a";
  const fill = renderTheme === "calidraw-dark" ? "#1a1a1a" : "#ffffff";
  const rect = matrixToPercents(node.matrix);
  const badgeSize = numberBadgeSize(node);
  const dragOffset = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);

  function toPercent(event: PointerEvent<HTMLDivElement>) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function moveTo(x: number, y: number) {
    const next = clampNumberBounds({
      x,
      y,
      size: badgeSize,
    });
    const matrix = percentsToNumberMatrix({
      left: next.x,
      top: next.y,
      width: rect.width,
      height: rect.height,
    });
    const current = percentsToNumberMatrix({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });

    if (matrix.every((value, index) => value === current[index])) {
      return;
    }

    updateElement(node.id, { matrix });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    selectElement(node.id);
    event.currentTarget.focus();

    const pointer = toPercent(event);
    if (!pointer) {
      return;
    }

    dragOffset.current = {
      pointerId: event.pointerId,
      dx: pointer.x - rect.left,
      dy: pointer.y - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    beginTimelineHistoryTransaction();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragOffset.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const pointer = toPercent(event);
    if (!pointer) {
      return;
    }

    moveTo(pointer.x - drag.dx, pointer.y - drag.dy);
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragOffset.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragOffset.current = null;
    endTimelineHistoryTransaction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      selectElement(node.id);
      return;
    }

    if (isZoomInKey(event) || isZoomOutKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      const scaled = scaleNumber(
        { x: rect.left, y: rect.top, size: badgeSize },
        isZoomInKey(event) ? ZOOM_FACTOR : 1 / ZOOM_FACTOR,
      );
      updateElement(node.id, {
        size: scaled.size,
        matrix: percentsToNumberMatrix({
          left: scaled.x,
          top: scaled.y,
          width: rect.width,
          height: rect.height,
        }),
      });
      return;
    }

    const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
    let nextX = rect.left;
    let nextY = rect.top;

    switch (event.key) {
      case "ArrowLeft":
        nextX -= step;
        break;
      case "ArrowRight":
        nextX += step;
        break;
      case "ArrowUp":
        nextY -= step;
        break;
      case "ArrowDown":
        nextY += step;
        break;
      default:
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectElement(node.id);
    moveTo(nextX, nextY);
  }

  return (
    <div
      className="absolute cursor-grab touch-none rounded-full outline-none animate-in fade-in-0 slide-in-from-bottom-2 duration-300 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-surface"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select and drag number ${node.value}`}
      style={{
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${badgeSize}%`,
        aspectRatio: "1",
        zIndex: 100 - node.time.track,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "flex size-full items-center justify-center text-sm font-bold",
          calidraw
            ? "relative rounded-none border-0 bg-transparent font-calidraw"
            : cn(
                "rounded-full border-2 border-canvas-ink font-canvas",
                themeStyles[node.colorTheme],
              ),
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-canvas-surface",
        )}
        style={calidraw ? { color: ink } : undefined}
      >
        {calidraw ? (
          <SketchFrame id={node.id} kind="circle" stroke={stroke} fill={fill} />
        ) : null}
        <span className="relative z-[1]">{node.value}</span>
      </div>
    </div>
  );
}
