import { useEffect, useRef } from "react";

import { ArrowComponent } from "@/components/canvas/ArrowComponent";
import { BoxComponent } from "@/components/canvas/BoxComponent";
import { NumberComponent } from "@/components/canvas/NumberComponent";
import {
  scaleBox,
  scaleNumber,
  ZOOM_FACTOR,
} from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomKey } from "@/lib/canvas-keyboard";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  isArrowNode,
  isBoxNode,
  isNumberNode,
} from "@/types/canvas";

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const elements = useCanvasStore((state) => state.elements);
  const selectedId = useCanvasStore((state) => state.selectedId);
  const selectElement = useCanvasStore((state) => state.selectElement);
  const boxes = elements.filter(isBoxNode);
  const arrows = elements.filter(isArrowNode);
  const numbers = elements.filter(isNumberNode);

  useEffect(() => {
    function resizeSelected(factor: number) {
      const { selectedId: id, elements: current, updateElement: update } =
        useCanvasStore.getState();

      if (!id) {
        return false;
      }

      const selected = current.find((element) => element.id === id);
      if (!selected || isArrowNode(selected)) {
        return false;
      }

      if (isBoxNode(selected)) {
        update(selected.id, scaleBox(selected, factor));
        return true;
      }

      if (isNumberNode(selected)) {
        update(selected.id, scaleNumber(selected, factor));
        return true;
      }

      return false;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (!selectedId || isEditableTarget(event.target) || !isZoomKey(event)) {
        return;
      }

      const factor = isZoomInKey(event) ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      if (!resizeSelected(factor)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    function handleWindowWheel(event: WheelEvent) {
      // Chrome/macOS pinch is ctrlKey + wheel; ignore ordinary two-finger scroll.
      if (!event.ctrlKey || !selectedId || isEditableTarget(event.target)) {
        return;
      }

      const factor = Math.exp(-event.deltaY * 0.01);
      if (!resizeSelected(factor)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("keydown", handleWindowKeyDown);
    window.addEventListener("wheel", handleWindowWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
      window.removeEventListener("wheel", handleWindowWheel);
    };
  }, [selectedId]);

  return (
    <div
      ref={canvasRef}
      className="relative aspect-[9/16] w-[min(100cqw,calc(100cqh*9/16))] overflow-hidden rounded-xl border-2 border-canvas-ink bg-canvas-surface text-canvas-ink shadow-sm"
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in srgb, currentColor 10%, transparent) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
      onClick={() => selectElement(null)}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        width="100%"
        height="100%"
      >
        <defs>
          <marker
            id="canvas-arrowhead"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 Z"
              className="fill-canvas-ink"
            />
          </marker>
        </defs>

        {arrows.map((arrow) => (
          <ArrowComponent
            key={arrow.id}
            arrow={arrow}
            boxes={boxes}
            selected={arrow.id === selectedId}
          />
        ))}
      </svg>

      <div className="absolute inset-0">
        {boxes.map((node) => (
          <BoxComponent
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            canvasRef={canvasRef}
          />
        ))}
        {numbers.map((node) => (
          <NumberComponent
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            canvasRef={canvasRef}
          />
        ))}
      </div>
    </div>
  );
}
