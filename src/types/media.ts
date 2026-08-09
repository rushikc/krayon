export interface MediaFile {
  name: string;
  path: string;
}

export const VIDEO_EXTENSIONS = [".mp4", ".mov"] as const;

export function isVideoFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
