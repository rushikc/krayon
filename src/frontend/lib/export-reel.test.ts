import { describe, expect, it } from "vitest";

import {
  alignH264Size,
  cssValueNeedsRgbFallback,
  ENCODE_HEIGHT,
  ENCODE_WIDTH,
  EXPORT_HEIGHT,
  EXPORT_WIDTH,
  isEvenExportSize,
  reelFrameTimes,
  reelVideoEncoderConfig,
} from "@/lib/export-reel";

describe("reel export helpers", () => {
  it("builds 30fps timestamps up to duration", () => {
    const times = reelFrameTimes(1, 30);
    expect(times).toHaveLength(30);
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(1 / 30);
    expect(times[29]).toBeCloseTo(29 / 30);
    expect(times.every((time) => time <= 1)).toBe(true);
  });

  it("clamps the last frame to duration and never goes empty", () => {
    expect(reelFrameTimes(0)).toEqual([0]);
    const times = reelFrameTimes(0.04, 30);
    expect(times[times.length - 1]).toBeLessThanOrEqual(0.04);
  });

  it("uses a 9:16 capture size and 16-aligned H.264 High Level 4+ encode size", () => {
    expect(isEvenExportSize()).toBe(true);
    expect(EXPORT_WIDTH).toBe(1080);
    expect(EXPORT_HEIGHT).toBe(1920);
    expect(alignH264Size(1080)).toBe(1088);
    expect(ENCODE_WIDTH).toBe(1088);
    expect(ENCODE_HEIGHT).toBe(1920);
    expect(ENCODE_WIDTH % 16).toBe(0);
    expect(ENCODE_HEIGHT % 16).toBe(0);

    const hardware = reelVideoEncoderConfig(true);
    expect(hardware.codec).toBe("avc1.640032");
    expect(hardware.width).toBe(1088);
    expect(hardware.height).toBe(1920);
    expect(hardware.hardwareAcceleration).toBe("prefer-hardware");
    expect(reelVideoEncoderConfig(false).hardwareAcceleration).toBeUndefined();
  });

  it("flags CSS colors that SVG foreignObject cannot paint", () => {
    expect(cssValueNeedsRgbFallback("oklch(0.7 0.1 180)")).toBe(true);
    expect(cssValueNeedsRgbFallback("color-mix(in srgb, black 10%, transparent)")).toBe(
      true,
    );
    expect(cssValueNeedsRgbFallback("rgb(255, 255, 255)")).toBe(false);
  });
});
