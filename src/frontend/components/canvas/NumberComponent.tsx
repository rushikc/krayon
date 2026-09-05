import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import { clampNumberBounds, scaleNumber, ZOOM_FACTOR } from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomOutKey } from "@/lib/canvas-keyboard";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import type { ColorTheme, NumberNode } from "@/types/canvas";

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
      size: node.size,
    });

    if (next.x === node.x && next.y === node.y) {
      return;
    }

    updateElement(node.id, { x: next.x, y: next.y });
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
      dx: pointer.x - node.x,
      dy: pointer.y - node.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
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
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      selectElement(node.id);
      return;
    }

    if (isZoomInKey(event) || isZoomOutKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      const next = scaleNumber(
        node,
        isZoomInKey(event) ? ZOOM_FACTOR : 1 / ZOOM_FACTOR,
      );
      updateElement(node.id, next);
      return;
    }

    const step = event.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
    let nextX = node.x;
    let nextY = node.y;

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
      className="absolute cursor-grab touch-none rounded-full outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-surface"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select and drag number ${node.value}`}
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        width: `${node.size}%`,
        aspectRatio: "1",
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
          "flex size-full items-center justify-center rounded-full border-2 border-canvas-ink font-canvas text-sm font-bold shadow-[2px_2px_0_0_var(--canvas-ink)] transition-shadow",
          themeStyles[node.colorTheme],
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-canvas-surface",
        )}
      >
        {node.value}
      </div>
    </div>
  );
}
