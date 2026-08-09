import { useEffect } from "react";

import { transport } from "@/features/editor/playback/transport";
import { useAudioEngine } from "@/features/editor/playback/useAudioEngine";
import { useVideoSync } from "@/features/editor/playback/useVideoSync";
import { sequenceDuration } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";

function useDurationSync(): void {
  const clips = useTimelineStore((state) => state.clips);

  useEffect(() => {
    transport.setDuration(sequenceDuration(clips));
  }, [clips]);
}

/**
 * Headless owner of playback. Mounted once, it keeps the transport's duration in
 * step with the sequence and runs the picture and audio sync loops.
 */
export function PlaybackEngine() {
  useDurationSync();
  useVideoSync();
  useAudioEngine();
  return null;
}
