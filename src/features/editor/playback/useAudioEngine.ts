import { useEffect } from "react";

import { transport } from "@/features/editor/playback/transport";
import { getAudioContext, getMasterGain } from "@/lib/media/audio-context";
import { getAudioData } from "@/lib/media/waveform";
import { useTimelineStore } from "@/stores/timeline-store";
import { clipEnd } from "@/types/timeline";

/** Ramp applied at clip boundaries so cuts don't click. */
const EDGE_FADE = 0.008;

interface Scheduled {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/**
 * Plays audio clips through Web Audio rather than `<audio>` elements.
 *
 * Every clip that starts at or after the playhead gets its own
 * `AudioBufferSourceNode` scheduled against the same clock the transport reads,
 * which keeps cuts gapless and sample-accurate. The per-clip `GainNode` is also
 * where ducking and fades will hang later.
 */
export function useAudioEngine(): void {
  useEffect(() => {
    let scheduled: Scheduled[] = [];

    const stopAll = (): void => {
      for (const { source, gain } of scheduled) {
        try {
          source.stop();
        } catch {
          // already finished
        }
        source.disconnect();
        gain.disconnect();
      }
      scheduled = [];
    };

    const scheduleFrom = (time: number): void => {
      stopAll();
      const ctx = getAudioContext();
      const master = getMasterGain();
      if (!ctx || !master || ctx.state !== "running") return;

      const { clips, tracks } = useTimelineStore.getState();
      const audible = new Set(
        tracks
          .filter((track) => track.kind === "audio" && !track.muted)
          .map((track) => track.id),
      );

      for (const clip of clips) {
        if (!audible.has(clip.trackId)) continue;
        if (clipEnd(clip) <= time) continue;

        const data = getAudioData(clip.assetId);
        if (!data) continue;

        const intoClip = Math.max(0, time - clip.start);
        const mapped = transport.clockTimeFor(clip.start + intoClip);
        if (mapped === null) return;

        let when = mapped;
        let offset = clip.sourceIn + intoClip;
        let duration = clip.duration - intoClip;

        // Scheduling can't happen in the past; trim whatever we already missed.
        const late = ctx.currentTime - when;
        if (late > 0) {
          when = ctx.currentTime;
          offset += late;
          duration -= late;
        }
        if (duration <= EDGE_FADE * 2) continue;
        if (offset >= data.buffer.duration) continue;

        const gain = ctx.createGain();
        gain.connect(master);
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(1, when + EDGE_FADE);
        gain.gain.setValueAtTime(1, when + duration - EDGE_FADE);
        gain.gain.linearRampToValueAtTime(0, when + duration);

        const source = ctx.createBufferSource();
        source.buffer = data.buffer;
        source.connect(gain);
        source.start(when, offset, duration);

        scheduled.push({ source, gain });
      }
    };

    const unsubscribe = transport.subscribe((event) => {
      if (event.type === "play") scheduleFrom(event.time);
      else if (event.type === "pause") stopAll();
      else if (event.type === "seek") {
        if (transport.isPlaying()) scheduleFrom(event.time);
        else stopAll();
      }
    });

    // Edits (and freshly decoded audio) invalidate what is already queued.
    const unsubscribeStore = useTimelineStore.subscribe(() => {
      if (transport.isPlaying()) scheduleFrom(transport.getTime());
    });

    return () => {
      unsubscribe();
      unsubscribeStore();
      stopAll();
    };
  }, []);
}
