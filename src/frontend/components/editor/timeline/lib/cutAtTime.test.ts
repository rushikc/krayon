import { describe, expect, it } from "vitest";

import { cutElementsAtTime } from "@/components/editor/timeline/lib/cutAtTime";
import type { CanvasElement } from "@/types/canvas";

function box(
  id: string,
  start: number,
  end: number,
  track: number,
): CanvasElement {
  return {
    id,
    type: "box",
    x: 10,
    y: 10,
    width: 20,
    height: 10,
    label: id,
    colorTheme: "ink",
    time: { start, end, track },
  };
}

describe("cutElementsAtTime", () => {
  it("splits a clip in the middle and keeps the left id", () => {
    const result = cutElementsAtTime([box("a", 0, 10, 0)], 4, () => "a-right");
    expect(result.splitIds).toEqual(["a"]);
    expect(result.elements.map((el) => [el.id, el.time])).toEqual([
      ["a", { start: 0, end: 4, track: 0 }],
      ["a-right", { start: 4, end: 10, track: 0 }],
    ]);
  });

  it("skips cuts that would leave a side shorter than 0.5s", () => {
    const result = cutElementsAtTime([box("a", 0, 10, 0)], 0.2, () => "right");
    expect(result.splitIds).toEqual([]);
    expect(result.elements).toHaveLength(1);
  });

  it("splits every intersecting clip across tracks", () => {
    let n = 0;
    const result = cutElementsAtTime(
      [box("top", 0, 20, 0), box("mid", 5, 15, 1), box("skip", 16, 20, 2)],
      10,
      () => `r${n++}`,
    );
    expect(result.splitIds).toEqual(["top", "mid"]);
    expect(result.elements.map((el) => el.id)).toEqual([
      "top",
      "r0",
      "mid",
      "r1",
      "skip",
    ]);
  });
});
