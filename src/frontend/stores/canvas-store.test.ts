import { beforeEach, describe, expect, it } from "vitest";

import {
  clampBoxBounds,
  clampBoxFontSize,
  clampNumberBounds,
  getArrowGeometry,
  scaleBox,
} from "@/lib/canvas-geometry";
import { isZoomInKey, isZoomKey, isZoomOutKey } from "@/lib/canvas-keyboard";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  getElementLabel,
  isArrowNode,
  isBoxNode,
  isNumberNode,
} from "@/types/canvas";

describe("canvas seed scene", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it("seeds overlapping explainer clips on a 60s reel", () => {
    const { elements, duration } = useCanvasStore.getState();
    expect(duration).toBe(60);
    expect(elements.map((el) => [el.id, el.time])).toEqual([
      ["step-1", { start: 0, end: 6, track: 2 }],
      ["api-gateway", { start: 1, end: 50, track: 0 }],
      ["step-2", { start: 8, end: 14, track: 2 }],
      ["lambda", { start: 10, end: 50, track: 1 }],
      ["gw-to-lambda", { start: 12, end: 50, track: 3 }],
    ]);
    expect(elements.some(isBoxNode)).toBe(true);
    expect(elements.some(isNumberNode)).toBe(true);
    expect(elements.some(isArrowNode)).toBe(true);
    expect(useCanvasStore.getState().trackCount).toBe(5);
  });

  it("updates time through onChange-style setElements and preserves type", () => {
    const store = useCanvasStore.getState();
    store.updateElement("api-gateway", {
      time: { start: 12, end: 22, track: 1 },
    });
    const box = useCanvasStore.getState().elements.find((el) => el.id === "api-gateway");
    expect(box?.type).toBe("box");
    expect(box?.time).toEqual({ start: 12, end: 22, track: 1 });
  });

  it("rejects duration below 1s", () => {
    useCanvasStore.getState().setDuration(0);
    expect(useCanvasStore.getState().duration).toBe(1);
  });

  it("plays from the marker and restarts at the end", () => {
    const store = useCanvasStore.getState();
    store.setCurrentTime(12);
    store.play();
    expect(useCanvasStore.getState().isPlaying).toBe(true);
    expect(useCanvasStore.getState().currentTime).toBe(12);

    store.pause();
    expect(useCanvasStore.getState().isPlaying).toBe(false);

    store.setCurrentTime(60);
    store.play();
    expect(useCanvasStore.getState().currentTime).toBe(0);
    expect(useCanvasStore.getState().isPlaying).toBe(true);
  });

  it("undoes and redoes element edits without recording playback", () => {
    const store = useCanvasStore.getState();
    store.updateElement("api-gateway", { label: "Gateway" });
    expect(
      useCanvasStore.getState().elements.find((el) => el.id === "api-gateway"),
    ).toMatchObject({ label: "Gateway" });

    store.play();
    store.undo();
    expect(
      useCanvasStore.getState().elements.find((el) => el.id === "api-gateway"),
    ).toMatchObject({ label: "API Gateway" });
    expect(useCanvasStore.getState().isPlaying).toBe(true);

    store.redo();
    expect(
      useCanvasStore.getState().elements.find((el) => el.id === "api-gateway"),
    ).toMatchObject({ label: "Gateway" });
  });

  it("adds tracks and deletes a track while reindexing clips", () => {
    const store = useCanvasStore.getState();
    expect(store.trackCount).toBe(5);
    store.addTrack();
    expect(useCanvasStore.getState().trackCount).toBe(6);

    store.deleteTrack(0);
    const next = useCanvasStore.getState();
    expect(next.trackCount).toBe(5);
    expect(next.elements.find((el) => el.id === "api-gateway")).toBeUndefined();
    expect(next.elements.find((el) => el.id === "lambda")?.time.track).toBe(0);
    expect(next.elements.find((el) => el.id === "step-1")?.time.track).toBe(1);
  });

  it("cuts clips at the playhead", () => {
    const store = useCanvasStore.getState();
    store.setCurrentTime(20);
    store.cutAtPlayhead();
    expect(
      useCanvasStore.getState().elements.find((el) => el.id === "api-gateway")
        ?.time,
    ).toEqual({ start: 1, end: 20, track: 0 });
    expect(
      useCanvasStore.getState().elements.some((el) => el.time.start === 20),
    ).toBe(true);
    expect(useCanvasStore.getState().selectedId).toBe("api-gateway");
  });
});

describe("canvas geometry", () => {
  it("keeps boxes inside the 0–100 frame", () => {
    expect(clampBoxBounds({ x: -10, y: 90, width: 50, height: 50 })).toEqual({
      x: 0,
      y: 50,
      width: 50,
      height: 50,
    });
  });

  it("keeps number badges inside the 9:16 frame", () => {
    const clamped = clampNumberBounds({ x: 99, y: 99, size: 50 });
    expect(clamped.size).toBe(40);
    expect(clamped.x).toBeLessThanOrEqual(60);
    expect(clamped.y).toBeLessThanOrEqual(100 - clamped.size * (9 / 16));
  });

  it("scales a box around its center then clamps", () => {
    const scaled = scaleBox({ x: 40, y: 40, width: 20, height: 20 }, 2);
    expect(scaled.width).toBe(40);
    expect(scaled.height).toBe(40);
    expect(scaled.x).toBe(30);
    expect(scaled.y).toBe(30);
  });

  it("builds arrow endpoints that do not sit on box centers", () => {
    const source = {
      id: "a",
      type: "box" as const,
      x: 10,
      y: 10,
      width: 20,
      height: 10,
      label: "A",
      colorTheme: "ink" as const,
      time: { start: 0, end: 10, track: 0 },
    };
    const target = {
      ...source,
      id: "b",
      y: 50,
      label: "B",
    };
    const geom = getArrowGeometry(source, target);
    expect(geom).not.toBeNull();
    expect(geom!.y1).toBeGreaterThan(source.y);
    expect(geom!.y2).toBeLessThan(target.y + target.height);
  });

  it("clamps box font size", () => {
    expect(clampBoxFontSize(3)).toBe(10);
    expect(clampBoxFontSize(99)).toBe(48);
  });
});

describe("element labels and zoom keys", () => {
  it("labels boxes, numbers, and arrows", () => {
    expect(
      getElementLabel({
        id: "b",
        type: "box",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        label: "API Gateway",
        colorTheme: "violet",
        time: { start: 0, end: 10, track: 0 },
      }),
    ).toBe("API Gateway");
    expect(
      getElementLabel({
        id: "n",
        type: "number",
        x: 0,
        y: 0,
        size: 10,
        value: 2,
        colorTheme: "ink",
        time: { start: 0, end: 10, track: 0 },
      }),
    ).toBe("2");
    expect(
      getElementLabel({
        id: "a",
        type: "arrow",
        sourceId: "api-gateway",
        targetId: "lambda",
        time: { start: 0, end: 10, track: 0 },
      }),
    ).toBe("api-gateway → lambda");
  });

  it("treats +/= and -/_ as zoom keys", () => {
    expect(isZoomInKey({ key: "=", ctrlKey: false, metaKey: false })).toBe(true);
    expect(isZoomOutKey({ key: "-", ctrlKey: false, metaKey: false })).toBe(true);
    expect(isZoomKey({ key: "a", ctrlKey: false, metaKey: false })).toBe(false);
  });
});
