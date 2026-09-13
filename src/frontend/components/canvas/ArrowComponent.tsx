import type { MouseEvent } from "react";

import { findBoxById, getArrowGeometry } from "@/lib/canvas-geometry";
import { isCalidrawTheme } from "@/lib/render-theme";
import { sketchArrowCurve } from "@/lib/sketch-path";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import type { ArrowNode, BoxNode } from "@/types/canvas";

interface ArrowComponentProps {
  arrow: ArrowNode;
  boxes: BoxNode[];
  selected: boolean;
  markerPrefix: string;
}

export function ArrowComponent({
  arrow,
  boxes,
  selected,
  markerPrefix,
}: ArrowComponentProps) {
  const selectElement = useCanvasStore((state) => state.selectElement);
  const renderTheme = useCanvasStore((state) => state.renderTheme);
  const calidraw = isCalidrawTheme(renderTheme);
  const source = findBoxById(boxes, arrow.sourceId);
  const target = findBoxById(boxes, arrow.targetId);

  if (!source || !target) {
    return null;
  }

  const geometry = getArrowGeometry(source, target);

  if (!geometry) {
    return null;
  }

  function handleSelect(event: MouseEvent) {
    event.stopPropagation();
    selectElement(arrow.id);
  }

  const strokeClass = selected
    ? "stroke-primary"
    : renderTheme === "calidraw-dark"
      ? "stroke-neutral-100"
      : "stroke-canvas-ink";

  return (
    <g className="origin-center animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
      <line
        x1={geometry.x1}
        y1={geometry.y1}
        x2={geometry.x2}
        y2={geometry.y2}
        className="pointer-events-auto stroke-transparent"
        strokeWidth={12}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        onClick={handleSelect}
      />
      {calidraw ? (
        <path
          d={sketchArrowCurve(
            arrow.id,
            geometry.x1,
            geometry.y1,
            geometry.x2,
            geometry.y2,
          )}
          className={cn("pointer-events-none fill-none", strokeClass)}
          vectorEffect="non-scaling-stroke"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeDasharray={arrow.variant === "dashed" ? "6 5" : undefined}
          markerEnd={`url(#${markerPrefix}-arrowhead-calidraw)`}
        />
      ) : (
        <line
          x1={geometry.x1}
          y1={geometry.y1}
          x2={geometry.x2}
          y2={geometry.y2}
          className={cn("pointer-events-none", strokeClass)}
          strokeWidth={2.5}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray={arrow.variant === "dashed" ? "6 5" : undefined}
          markerEnd={`url(#${markerPrefix}-arrowhead)`}
        />
      )}
    </g>
  );
}
