import { useEffect } from "react";

import { transport } from "@/features/editor/playback/transport";
import { videoElements } from "@/features/editor/playback/video-registry";
import { clipAtTime } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";
import { AUDIO_TRACK_ID, VIDEO_TRACK_ID } from "@/types/timeline";

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
      const audioTrackMuted =
        tracks.find((track) => track.id === AUDIO_TRACK_ID)?.muted ?? false;
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

        // Web Audio drives sound once the waveform is decoded; until then (or
        // when decode fails) the element carries audio so playback isn't silent.
        const waveform = assets[assetId]?.waveform ?? "idle";
        const wantsElementAudio =
          waveform !== "ready" && !audioTrackMuted;
        if (element.muted !== !wantsElementAudio) {
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
    // Edits made while paused still need the picture refreshed; ignore
    // unrelated store updates (selection, zoom, undo stack, etc.).
    let prevClips = useTimelineStore.getState().clips;
    let prevAssets = useTimelineStore.getState().assets;
    let prevTracks = useTimelineStore.getState().tracks;
    const unsubscribeStore = useTimelineStore.subscribe((state) => {
      if (
        state.clips === prevClips &&
        state.assets === prevAssets &&
        state.tracks === prevTracks
      ) {
        return;
      }
      prevClips = state.clips;
      prevAssets = state.assets;
      prevTracks = state.tracks;
      apply(transport.getTime());
    });

    return () => {
      unsubscribeTime();
      unsubscribeStore();
    };
  }, []);
}
