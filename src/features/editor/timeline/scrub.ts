import { transport } from "@/features/editor/playback/transport";
import { pxToTime, snapToFrame } from "@/lib/timeline/geometry";

/**
 * Starts a playhead drag. Shared by the ruler and the playhead handle so both
 * feel identical. `content` is the scrolled timeline content, which is what the
 * clip positions are measured against.
 */
export function beginScrub(
  clientX: number,
  content: HTMLElement,
  pixelsPerSecond: number,
  fps: number,
): void {
  const timeAt = (x: number): number => {
    const rect = content.getBoundingClientRect();
    return Math.max(0, snapToFrame(pxToTime(x - rect.left, pixelsPerSecond), fps));
  };

  transport.setScrubbing(true);
  transport.seek(timeAt(clientX));

  const onPointerMove = (event: PointerEvent): void => {
    transport.seek(timeAt(event.clientX));
  };

  const onPointerUp = (): void => {
    transport.setScrubbing(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}
