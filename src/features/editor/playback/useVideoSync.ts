import { useEffect } from "react";

import { transport } from "@/features/editor/playback/transport";
import { videoElements } from "@/features/editor/playback/video-registry";
import { clipAtTime } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";
import { VIDEO_TRACK_ID } from "@/types/timeline";

/** Past this the picture is visibly late, so we hard seek instead of easing. */
const HARD_SEEK_THRESHOLD = 0.1;
/** Below this the drift is imperceptible and worth leaving alone. */
const IGNORE_THRESHOLD = 0.02;
const MAX_RATE_TRIM = 0.1;

/**
 * Drives the `<video>` elements from the transport clock.
 *
 * Only `V1` is composited today. The element for the clip under the playhead is
 * shown, seeked to `sourceIn + (playhead - clip.start)`, and nudged with small
 * playback-rate corrections; everything else is paused and faded out. All of it
 * is direct DOM work — no React state is touched per frame.
 */
export function useVideoSync(): void {
  useEffect(() => {
    const apply = (time: number): void => {
      const { clips, assets, tracks } = useTimelineStore.getState();
      const active = clipAtTime(clips, VIDEO_TRACK_ID, time);
      const videoTrackMuted =
        tracks.find((track) => track.id === VIDEO_TRACK_ID)?.muted ?? false;
      const playing = transport.isPlaying();
      const scrubbing = transport.isScrubbing();

      for (const [assetId, element] of videoElements()) {
        const isActive = active?.assetId === assetId;

        if (!isActive) {
          if (!element.paused) element.pause();
          if (element.style.opacity !== "0") element.style.opacity = "0";
          continue;
        }

        if (element.style.opacity !== "1") element.style.opacity = "1";

        // Sound normally comes from the audio track. Files Web Audio can't
        // decode fall back to the element's own audio so they aren't silent.
        const wantsElementAudio =
          assets[assetId]?.waveform === "unavailable" && !videoTrackMuted;
        if (element.muted === wantsElementAudio) {
          element.muted = !wantsElementAudio;
        }

        const target = active.sourceIn + (time - active.start);
        const drift = element.currentTime - target;

        if (playing) {
          if (element.paused) {
            element.currentTime = target;
            element.playbackRate = 1;
            void element.play().catch(() => {
              /* interrupted by a seek or unmount */
            });
          } else if (Math.abs(drift) > HARD_SEEK_THRESHOLD) {
            element.playbackRate = 1;
            element.currentTime = target;
          } else if (Math.abs(drift) > IGNORE_THRESHOLD) {
            const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, -drift));
            element.playbackRate = 1 + trim;
          } else if (element.playbackRate !== 1) {
            element.playbackRate = 1;
          }
          continue;
        }

        if (!element.paused) element.pause();
        if (Math.abs(drift) <= IGNORE_THRESHOLD) continue;
        if (scrubbing) {
          if (element.seeking) continue;
          if (typeof element.fastSeek === "function") {
            element.fastSeek(target);
            continue;
          }
        }
        element.currentTime = target;
      }
    };

    const unsubscribeTime = transport.subscribeTime(apply);
    // Edits made while paused still need the picture refreshed.
    const unsubscribeStore = useTimelineStore.subscribe(() => {
      apply(transport.getTime());
    });

    return () => {
      unsubscribeTime();
      unsubscribeStore();
    };
  }, []);
}
