import type { TrackKind } from "@/types/timeline";

export interface MediaFile {
  name: string;
  path: string;
  kind: TrackKind;
}

export const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm"] as const;

/**
 * Audio files are listed too so generated voice takes can be dropped straight
 * onto an audio track.
 */
export const AUDIO_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".m4a",
  ".aac",
  ".flac",
  ".ogg",
] as const;

export function mediaKind(filename: string): TrackKind | null {
  const lower = filename.toLowerCase();
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "video";
  if (AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return "audio";
  return null;
}

export function isVideoFile(filename: string): boolean {
  return mediaKind(filename) === "video";
}

export function isMediaFile(filename: string): boolean {
  return mediaKind(filename) !== null;
}
