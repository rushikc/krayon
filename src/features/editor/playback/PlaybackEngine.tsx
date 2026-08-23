import { useEffect } from "react";

import { transport } from "@/features/editor/playback/transport";
import { useAudioEngine } from "@/features/editor/playback/useAudioEngine";
import { useVideoSync } from "@/features/editor/playback/useVideoSync";
import { ensureAudioData } from "@/lib/media/waveform";
import { sequenceDuration } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";

function useDurationSync(): void {
  useEffect(() => {
    // A store subscription rather than an effect on `clips`: it runs inside the
    // same tick as the edit, so code that appends a clip and immediately seeks
    // to it isn't clamped against a stale duration.
    const apply = (): void => {
      transport.setDuration(sequenceDuration(useTimelineStore.getState().clips));
    };
    apply();
    return useTimelineStore.subscribe(apply);
  }, []);
}

function useDeferredAudioDecode(): void {
  useEffect(() => {
    return transport.subscribe((event) => {
      if (event.type !== "play") return;
      const { clips, assets } = useTimelineStore.getState();
      const seen = new Set<string>();
      for (const clip of clips) {
        if (seen.has(clip.assetId)) continue;
        seen.add(clip.assetId);
        const asset = assets[clip.assetId];
        if (asset?.waveform === "idle") void ensureAudioData(asset);
      }
    });
  }, []);
}

/**
 * Headless owner of playback. Mounted once, it keeps the transport's duration in
 * step with the sequence and runs the picture and audio sync loops.
 */
export function PlaybackEngine() {
  useDurationSync();
  useDeferredAudioDecode();
  useVideoSync();
  useAudioEngine();
  return null;
}
