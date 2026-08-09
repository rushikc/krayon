import { getAudioContext } from "@/lib/media/audio-context";
import { useTimelineStore } from "@/stores/timeline-store";
import type { MediaAsset } from "@/types/timeline";

/**
 * Peak resolution. At the maximum zoom level (600 px/s) this still gives more
 * than one bucket per pixel, and a 2 minute clip costs ~400 KB.
 */
const BUCKETS_PER_SECOND = 500;

export interface PeakData {
  /** min/max pairs per bucket, in the range -1..1. */
  peaks: Float32Array;
  bucketsPerSecond: number;
  duration: number;
}

export interface AudioData {
  buffer: AudioBuffer;
  peaks: PeakData;
}

const cache = new Map<string, AudioData>();
const pending = new Map<string, Promise<AudioData | null>>();

export function getAudioData(assetId: string): AudioData | undefined {
  return cache.get(assetId);
}

function computePeaks(buffer: AudioBuffer): PeakData {
  const bucketCount = Math.max(
    1,
    Math.ceil(buffer.duration * BUCKETS_PER_SECOND),
  );
  const samplesPerBucket = buffer.length / bucketCount;
  const peaks = new Float32Array(bucketCount * 2);
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const from = Math.floor(bucket * samplesPerBucket);
    const to = Math.min(buffer.length, Math.floor((bucket + 1) * samplesPerBucket));
    let min = 0;
    let max = 0;
    for (let index = from; index < to; index += 1) {
      let sum = 0;
      for (const data of channels) sum += data[index];
      const value = sum / channels.length;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    peaks[bucket * 2] = min;
    peaks[bucket * 2 + 1] = max;
  }

  return { peaks, bucketsPerSecond: BUCKETS_PER_SECOND, duration: buffer.duration };
}

/**
 * Decodes an asset's audio once and keeps it around: the same `AudioBuffer`
 * feeds both the waveform drawing and clip playback.
 *
 * Reading the whole file is the pragmatic option today — the tidy version is an
 * FFmpeg sidecar that emits a compact mono wav plus cached peaks, which is the
 * same extraction the voice pipeline needs.
 */
export function ensureAudioData(asset: MediaAsset): Promise<AudioData | null> {
  const cached = cache.get(asset.id);
  if (cached) return Promise.resolve(cached);

  const inFlight = pending.get(asset.id);
  if (inFlight) return inFlight;

  const { updateAsset } = useTimelineStore.getState();
  updateAsset(asset.id, { waveform: "loading" });

  const task = (async (): Promise<AudioData | null> => {
    try {
      const ctx = getAudioContext();
      if (!ctx) throw new Error("Web Audio is unavailable");

      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Could not read media (HTTP ${response.status})`);
      }
      const bytes = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes);
      const data: AudioData = { buffer, peaks: computePeaks(buffer) };
      cache.set(asset.id, data);
      useTimelineStore.getState().updateAsset(asset.id, { waveform: "ready" });
      return data;
    } catch {
      // Container the WebView can't decode (or a file with no audio track).
      // The clip still edits fine, it just renders without a waveform and
      // falls back to the video element for sound.
      useTimelineStore.getState().updateAsset(asset.id, { waveform: "unavailable" });
      return null;
    } finally {
      pending.delete(asset.id);
    }
  })();

  pending.set(asset.id, task);
  return task;
}

export function releaseAudioData(assetId: string): void {
  cache.delete(assetId);
}
