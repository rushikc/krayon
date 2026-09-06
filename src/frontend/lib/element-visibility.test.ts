import { describe, expect, it } from "vitest";

import { isElementActiveAt } from "@/lib/element-visibility";

describe("isElementActiveAt", () => {
  const clip = { start: 0, end: 10 };

  it("is visible from start up to but not including end", () => {
    expect(isElementActiveAt(clip, 0)).toBe(true);
    expect(isElementActiveAt(clip, 9.9)).toBe(true);
    expect(isElementActiveAt(clip, 10)).toBe(false);
  });

  it("hands off sequential clips at the shared boundary", () => {
    const next = { start: 10, end: 20 };
    expect(isElementActiveAt(clip, 10)).toBe(false);
    expect(isElementActiveAt(next, 10)).toBe(true);
  });
});
