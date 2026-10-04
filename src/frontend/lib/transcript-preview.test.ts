import { describe, expect, it } from "vitest";

import { formatTimestamp } from "@/lib/format";
import { formatTakeTranscript } from "@/lib/transcript-preview";
import type { ClipItem } from "@/types/api";

function clip(overrides: Partial<ClipItem> = {}): ClipItem {
  return {
    id: "c1",
    index: 0,
    sourceStart: 0,
    sourceEnd: 1,
    duration: 1,
    text: "hello",
    groupId: "g1",
    ...overrides,
  };
}

describe("formatTimestamp", () => {
  it("renders zero as 0:00", () => {
    expect(formatTimestamp(0)).toBe("0:00");
  });

  it("pads seconds", () => {
    expect(formatTimestamp(72)).toBe("1:12");
  });
});

describe("formatTakeTranscript", () => {
  it("orders by source time and builds heading plus line", () => {
    const preview = formatTakeTranscript([
      clip({
        id: "later",
        index: 3,
        sourceStart: 12.4,
        sourceEnd: 18.1,
        text: "There was a mistake in Hello interview Uber system design",
      }),
      clip({
        id: "first",
        index: 0,
        sourceStart: 0,
        sourceEnd: 4.2,
        text: "There was a mistake in Hello",
      }),
    ]);

    expect(preview.rows).toEqual([
      {
        id: "first",
        heading: "Take 1  0:00–0:04",
        text: "There was a mistake in Hello",
      },
      {
        id: "later",
        heading: "Take 4  0:12–0:18",
        text: "There was a mistake in Hello interview Uber system design",
      },
    ]);
    expect(preview.copyText).toBe(
      [
        "Take 1  0:00–0:04",
        "There was a mistake in Hello",
        "",
        "Take 4  0:12–0:18",
        "There was a mistake in Hello interview Uber system design",
      ].join("\n"),
    );
  });
});
