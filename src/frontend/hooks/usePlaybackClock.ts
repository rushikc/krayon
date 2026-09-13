import { useEffect } from "react";

import { useCanvasStore } from "@/stores/canvas-store";
import { lastVisibleTime } from "@/lib/reel-duration";

export function usePlaybackClock() {
  const isPlaying = useCanvasStore((state) => state.isPlaying);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const { currentTime, duration, setCurrentTime, pause } =
        useCanvasStore.getState();
      const next = currentTime + dt;
      if (next >= duration) {
        setCurrentTime(lastVisibleTime(duration));
        pause();
        return;
      }
      setCurrentTime(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);
}
