import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import { clampBoxBounds, DEFAULT_BOX_FONT_SIZE, scaleBox, ZOOM_FACTOR } from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomOutKey } from "@/lib/canvas-keyboard";
import {
  isScalidrawTheme,
  scalidrawStroke,
} from "@/lib/render-theme";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  beginTimelineHistoryTransaction,
  endTimelineHistoryTransaction,
} from "@/stores/timeline-history";
import type { BoxNode, ColorTheme } from "@/types/canvas";

import { SketchFrame } from "./SketchFrame";

interface BoxComponentProps {
  node: BoxNode;
  selected: boolean;
  canvasRef: RefObject<HTMLDivElement | null>;
}

const themeStyles: Record<ColorTheme, string> = {
  ink: "bg-canvas-ink",
  violet: "bg-canvas-violet",
  green: "bg-canvas-green",
  blue: "bg-canvas-blue",
  sky: "bg-canvas-sky",
  lavender: "bg-canvas-lavender",
  mint: "bg-canvas-mint",
  tan: "bg-canvas-tan",
  yellow: "bg-canvas-yellow",
  orange: "bg-canvas-orange",
  pink: "bg-canvas-pink",
  salmon: "bg-canvas-salmon",
};

const NUDGE_STEP = 1;
const NUDGE_STEP_SHIFT = 5;

export function BoxComponent({
  node,
  selected,
  canvasRef,
}: BoxComponentProps) {
  const selectElement = useCanvasStore((state) => state.selectElement);
  const updateElement = useCanvasStore((state) => state.updateElement);
  const renderTheme = useCanvasStore((state) => state.renderTheme);
  const scalidraw = isScalidrawTheme(renderTheme);
  const stroke = scalidrawStroke(node.colorTheme, renderTheme);
  const ink = renderTheme === "scalidraw-dark" ? "#f0f0f0" : "#1a1a1a";
  const fill = renderTheme === "scalidraw-dark" ? "#1a1a1a" : "#ffffff";
  const aspect = node.height > 0 ? node.width / node.height : 1;
  const dragOffset = useRef<{
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);
  const labelSize = node.fontSize ?? DEFAULT_BOX_FONT_SIZE;
  const sublabelSize = labelSize * 0.75;

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
    const next = clampBoxBounds({
      x,
      y,
      width: node.width,
      height: node.height,
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
      const next = scaleBox(
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
      className="absolute cursor-grab touch-none rounded-lg outline-none animate-in fade-in-0 slide-in-from-bottom-2 duration-300 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-surface"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select and drag ${node.label}`}
      style={{
        left: `${node.x}%`,
        top: `${node.y}%`,
        width: `${node.width}%`,
        height: `${node.height}%`,
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
          "flex size-full flex-col justify-center gap-0.5",
          scalidraw
            ? "relative items-start rounded-none border-0 bg-transparent px-4 py-2 text-left font-scalidraw shadow-none"
            : cn(
                "rounded-lg border-2 border-canvas-ink px-3 font-canvas shadow-[3px_3px_0_0_var(--canvas-ink)] transition-shadow",
                node.sublabel ? "items-start text-left" : "items-center text-center",
                themeStyles[node.colorTheme],
                node.colorTheme === "ink"
                  ? "text-canvas-surface"
                  : "text-canvas-ink",
              ),
          selected &&
            "ring-2 ring-primary ring-offset-2 ring-offset-canvas-surface",
        )}
        style={scalidraw ? { color: ink } : undefined}
      >
        {scalidraw ? (
          <SketchFrame
            id={node.id}
            kind="rect"
            stroke={stroke}
            fill={fill}
            aspect={aspect}
          />
        ) : null}
        <span
          className={cn(
            "relative z-[1] w-full font-bold",
            scalidraw ? "whitespace-normal break-words" : "truncate",
          )}
          style={{ fontSize: `${labelSize}px` }}
        >
          {node.label}
        </span>
        {node.sublabel && (
          <span
            className={cn(
              "relative z-[1] w-full font-medium",
              scalidraw
                ? "whitespace-normal break-words"
                : cn(
                    "truncate",
                    node.colorTheme === "ink"
                      ? "text-canvas-surface/75"
                      : "text-canvas-ink/75",
                  ),
            )}
            style={{
              fontSize: `${sublabelSize}px`,
              opacity: scalidraw ? 0.72 : undefined,
            }}
          >
            {node.sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
