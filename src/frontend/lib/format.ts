export function formatDuration(seconds?: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Human-readable elapsed time, e.g. "2 min 40 sec", "45 sec", "3 min". */
export function formatElapsedHuman(seconds?: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const parts: string[] = [];
  if (min > 0) parts.push(`${min} min`);
  if (sec > 0 || min === 0) parts.push(`${sec} sec`);
  return parts.join(" ");
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatResolution(width?: number | null, height?: number | null): string {
  if (!width || !height) return "—";
  return `${width}×${height}`;
}
