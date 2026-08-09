import { useEffect, useRef } from "react";

import { getAudioData } from "@/lib/media/waveform";

/**
 * Canvases have a hard size limit, so at extreme zoom the backing store is
 * capped and the browser scales it. Peaks are already averaged, so the result
 * only softens slightly.
 */
const MAX_BACKING_WIDTH = 8192;

interface WaveformCanvasProps {
  assetId: string;
  sourceIn: number;
  duration: number;
  width: number;
  height: number;
  /** Redraw trigger for when decoding finishes. */
  revision: string;
}

export function WaveformCanvas({
  assetId,
  sourceIn,
  duration,
  width,
  height,
  revision,
}: WaveformCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(width));
    const backingWidth = Math.min(Math.floor(cssWidth * dpr), MAX_BACKING_WIDTH);
    const backingHeight = Math.max(1, Math.floor(height * dpr));

    canvas.width = backingWidth;
    canvas.height = backingHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    const data = getAudioData(assetId);
    const middle = backingHeight / 2;

    if (!data || duration <= 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.fillRect(0, middle - dpr / 2, backingWidth, Math.max(1, dpr));
      return;
    }

    const { peaks, bucketsPerSecond } = data.peaks;
    const bucketCount = peaks.length / 2;
    const secondsPerColumn = duration / backingWidth;

    ctx.fillStyle = "rgba(255, 255, 255, 0.72)";

    for (let column = 0; column < backingWidth; column += 1) {
      const from = (sourceIn + column * secondsPerColumn) * bucketsPerSecond;
      const to = (sourceIn + (column + 1) * secondsPerColumn) * bucketsPerSecond;
      const firstBucket = Math.max(0, Math.floor(from));
      const lastBucket = Math.min(bucketCount - 1, Math.max(firstBucket, Math.floor(to) - 1));

      let min = 0;
      let max = 0;
      for (let bucket = firstBucket; bucket <= lastBucket; bucket += 1) {
        const bucketMin = peaks[bucket * 2];
        const bucketMax = peaks[bucket * 2 + 1];
        if (bucketMin < min) min = bucketMin;
        if (bucketMax > max) max = bucketMax;
      }

      const top = middle - max * middle;
      const bottom = middle - min * middle;
      ctx.fillRect(column, top, 1, Math.max(dpr, bottom - top));
    }
  }, [assetId, sourceIn, duration, width, height, revision]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 size-full"
      style={{ width, height }}
    />
  );
}
