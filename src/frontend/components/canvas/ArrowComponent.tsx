import type { MouseEvent } from "react";

import { findBoxById, getArrowGeometry } from "@/lib/canvas-geometry";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import type { ArrowNode, BoxNode } from "@/types/canvas";

interface ArrowComponentProps {
  arrow: ArrowNode;
  boxes: BoxNode[];
  selected: boolean;
}

export function ArrowComponent({ arrow, boxes, selected }: ArrowComponentProps) {
  const selectElement = useCanvasStore((state) => state.selectElement);
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

  return (
    <g>
      <line
        x1={`${geometry.x1}%`}
        y1={`${geometry.y1}%`}
        x2={`${geometry.x2}%`}
        y2={`${geometry.y2}%`}
        className="pointer-events-auto stroke-transparent"
        strokeWidth={12}
        strokeLinecap="round"
        onClick={handleSelect}
      />
      <line
        x1={`${geometry.x1}%`}
        y1={`${geometry.y1}%`}
        x2={`${geometry.x2}%`}
        y2={`${geometry.y2}%`}
        className={cn(
          "pointer-events-none",
          selected ? "stroke-primary" : "stroke-canvas-ink",
        )}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={arrow.variant === "dashed" ? "6 5" : undefined}
        markerEnd="url(#canvas-arrowhead)"
      />
    </g>
  );
}
