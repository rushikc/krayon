export type TrackKind = "video" | "audio";

export type AssetStatus = "loading" | "ready" | "error";

/** A media file that has been pulled into the project. */
export interface MediaAsset {
  id: string;
  /** Absolute path on disk (or a dev-server URL outside Tauri). */
  path: string;
  name: string;
  /** Value handed to `<video>` / `fetch` — see `lib/media/asset-url`. */
  url: string;
  kind: TrackKind;
  duration: number;
  width?: number;
  height?: number;
  status: AssetStatus;
  error?: string;
  /** Waveform peaks are decoded lazily and cached outside the store. */
  waveform: "idle" | "loading" | "ready" | "unavailable";
}

export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  /** Position on the timeline, in seconds. */
  start: number;
  /** In-point inside the source asset, in seconds. */
  sourceIn: number;
  duration: number;
  /** The video/audio sibling created from the same file. */
  linkedId?: string;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
}

export type ClipEdge = "start" | "end";

export const VIDEO_TRACK_ID = "V1";
export const AUDIO_TRACK_ID = "A1";
export const VOICE_TRACK_ID = "A2";

/**
 * `A2` ships empty on purpose: generated voice takes drop straight onto it
 * without any timeline changes.
 */
export const DEFAULT_TRACKS: Track[] = [
  { id: VIDEO_TRACK_ID, kind: "video", name: "V1", muted: false, locked: false },
  { id: AUDIO_TRACK_ID, kind: "audio", name: "A1", muted: false, locked: false },
  { id: VOICE_TRACK_ID, kind: "audio", name: "A2 Voice", muted: false, locked: false },
];

/** Shortest clip we allow, so trimming can never produce a zero-width clip. */
export const MIN_CLIP_DURATION = 0.05;

export function clipEnd(clip: Clip): number {
  return clip.start + clip.duration;
}

export function clipSourceOut(clip: Clip): number {
  return clip.sourceIn + clip.duration;
}
