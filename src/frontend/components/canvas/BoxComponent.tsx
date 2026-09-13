import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

import {
  clampBoxBounds,
  DEFAULT_BOX_FONT_SIZE,
  matrixToPercents,
  percentsToMatrix,
  scaleBox,
  ZOOM_FACTOR,
} from "@/lib/canvas-geometry";
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
  const calidraw = isCalidrawTheme(renderTheme);
  const stroke = calidrawStroke(node.colorTheme, renderTheme);
  const ink = renderTheme === "calidraw-dark" ? "#f0f0f0" : "#1a1a1a";
  const fill = renderTheme === "calidraw-dark" ? "#1a1a1a" : "#ffffff";
  const rect = matrixToPercents(node.matrix);
  const aspect = rect.height > 0 ? rect.width / rect.height : 1;
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
      width: rect.width,
      height: rect.height,
    });
    const matrix = percentsToMatrix({
      left: next.x,
      top: next.y,
      width: next.width,
      height: next.height,
    });

    if (
      matrix[0] === node.matrix[0] &&
      matrix[1] === node.matrix[1] &&
      matrix[2] === node.matrix[2] &&
      matrix[3] === node.matrix[3]
    ) {
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
      const scaled = scaleBox(
        {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        },
        isZoomInKey(event) ? ZOOM_FACTOR : 1 / ZOOM_FACTOR,
      );
      updateElement(node.id, {
        matrix: percentsToMatrix({
          left: scaled.x,
          top: scaled.y,
          width: scaled.width,
          height: scaled.height,
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
      className="absolute cursor-grab touch-none rounded-lg outline-none animate-in fade-in-0 slide-in-from-bottom-2 duration-300 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-surface"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Select and drag ${node.label}`}
      style={{
        left: `${rect.left}%`,
        top: `${rect.top}%`,
        width: `${rect.width}%`,
        height: `${rect.height}%`,
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
          calidraw
            ? "relative items-start rounded-none border-0 bg-transparent px-4 py-2 text-left font-calidraw shadow-none"
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
        style={calidraw ? { color: ink } : undefined}
      >
        {calidraw ? (
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
            calidraw ? "whitespace-normal break-words" : "truncate",
          )}
          style={{ fontSize: `${labelSize}px` }}
        >
          {node.label}
        </span>
        {node.sublabel && (
          <span
            className={cn(
              "relative z-[1] w-full font-medium",
              calidraw
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
              opacity: calidraw ? 0.72 : undefined,
            }}
          >
            {node.sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
