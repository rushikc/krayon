import { useEffect, useMemo, useRef } from "react";

import { ArrowComponent } from "@/components/canvas/ArrowComponent";
import { BoxComponent } from "@/components/canvas/BoxComponent";
import { NumberComponent } from "@/components/canvas/NumberComponent";
import { ReelPreviewOverlay } from "@/components/canvas/ReelPreviewOverlay";
import {
  scaleBox,
  scaleNumber,
  ZOOM_FACTOR,
} from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomKey, isEditableTarget } from "@/lib/canvas-keyboard";
import { isElementActiveAt } from "@/lib/element-visibility";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  isArrowNode,
  isBoxNode,
  isNumberNode,
  type CanvasElement,
} from "@/types/canvas";

/** Higher track index paints first (back); track 0 is on top. */
function byTrackDescending(a: CanvasElement, b: CanvasElement) {
  return b.time.track - a.time.track;
}

export function Canvas({
  showReelPreview = false,
  exporting = false,
}: {
  showReelPreview?: boolean;
  exporting?: boolean;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const elements = useCanvasStore((state) => state.elements);
  const selectedId = useCanvasStore((state) => state.selectedId);
  const selectElement = useCanvasStore((state) => state.selectElement);
  const currentTime = useCanvasStore((state) => state.currentTime);
  const renderTheme = useCanvasStore((state) => state.renderTheme);

  const visible = useMemo(
    () =>
      [...elements]
        .filter((el) => isElementActiveAt(el.time, currentTime))
        .sort(byTrackDescending),
    [elements, currentTime],
  );
  const boxes = elements.filter(isBoxNode);
  const htmlNodes = visible.filter(
    (el): el is Extract<CanvasElement, { type: "box" | "number" }> =>
      isBoxNode(el) || isNumberNode(el),
  );
  const arrows = visible.filter(isArrowNode);
  const markerPrefix = exporting ? "export" : "preview";

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
      data-render-theme={renderTheme}
      data-exporting={exporting ? "true" : undefined}
      className={cn(
        "relative aspect-[9/16] h-full w-auto max-h-full overflow-hidden rounded-xl shadow-sm",
        renderTheme === "bright" &&
          "border-2 border-canvas-ink bg-canvas-surface text-canvas-ink",
        renderTheme === "scalidraw-light" &&
          "border border-neutral-300 bg-white text-neutral-900",
        renderTheme === "scalidraw-dark" &&
          "border border-neutral-700 bg-[#1a1a1a] text-neutral-100",
      )}
      style={
        renderTheme === "bright"
          ? {
              backgroundImage: exporting
                ? "radial-gradient(circle, rgba(0, 0, 0, 0.1) 1px, transparent 1px)"
                : "radial-gradient(circle, color-mix(in srgb, currentColor 10%, transparent) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }
          : undefined
      }
      onClick={() => selectElement(null)}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id={`${markerPrefix}-arrowhead`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 Z" className="fill-canvas-ink" />
          </marker>
          <marker
            id={`${markerPrefix}-arrowhead-scalidraw`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path
              d="M 1 1 L 9 5 L 1 9"
              fill="none"
              className={
                renderTheme === "scalidraw-dark"
                  ? "stroke-neutral-100"
                  : "stroke-canvas-ink"
              }
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </marker>
        </defs>

        {arrows.map((arrow) => (
          <ArrowComponent
            key={arrow.id}
            arrow={arrow}
            boxes={boxes}
            selected={!exporting && arrow.id === selectedId}
            markerPrefix={markerPrefix}
          />
        ))}
      </svg>

      <div className="absolute inset-0">
        {htmlNodes.map((node) =>
          isBoxNode(node) ? (
            <BoxComponent
              key={node.id}
              node={node}
              selected={!exporting && node.id === selectedId}
              canvasRef={canvasRef}
            />
          ) : (
            <NumberComponent
              key={node.id}
              node={node}
              selected={!exporting && node.id === selectedId}
              canvasRef={canvasRef}
            />
          ),
        )}
      </div>
      {showReelPreview ? <ReelPreviewOverlay /> : null}
    </div>
  );
}
