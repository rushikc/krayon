import {
  clipEnd,
  MIN_CLIP_DURATION,
  type Clip,
  type ClipEdge,
  type MediaAsset,
} from "@/types/timeline";

export type AssetMap = Record<string, MediaAsset>;

/** Destination track for one clip taking part in a drag. */
export interface ClipMove {
  id: string;
  trackId: string;
}

let idCounter = 0;

export function createId(prefix = "clip"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function clipsOnTrack(clips: Clip[], trackId: string): Clip[] {
  return clips
    .filter((clip) => clip.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}

export function clipAtTime(
  clips: Clip[],
  trackId: string,
  time: number,
): Clip | undefined {
  return clips.find(
    (clip) =>
      clip.trackId === trackId && time >= clip.start && time < clipEnd(clip),
  );
}

export function sequenceDuration(clips: Clip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}

export function trackEnd(clips: Clip[], trackId: string): number {
  return sequenceDuration(clips.filter((clip) => clip.trackId === trackId));
}

/** Clip edges, useful as snap targets and for jump-to-next-edit. */
export function clipEdges(clips: Clip[], excludeIds: Iterable<string> = []): number[] {
  const skip = new Set(excludeIds);
  const edges = new Set<number>([0]);
  for (const clip of clips) {
    if (skip.has(clip.id)) continue;
    edges.add(clip.start);
    edges.add(clipEnd(clip));
  }
  return [...edges].sort((a, b) => a - b);
}

/** Adds the video/audio sibling of every selected clip. */
export function expandWithLinked(clips: Clip[], ids: Iterable<string>): string[] {
  const result = new Set<string>();
  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  for (const id of ids) {
    result.add(id);
    const linkedId = byId.get(id)?.linkedId;
    if (linkedId && byId.has(linkedId)) result.add(linkedId);
  }
  return [...result];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd - 1e-6 && bStart < aEnd - 1e-6;
}

/**
 * Splits every given clip that straddles `time`.
 *
 * The left half keeps the original id so links held by other clips stay valid;
 * the right half is new, and is only re-linked when its sibling was cut too.
 */
export function splitClips(
  clips: Clip[],
  ids: Iterable<string>,
  time: number,
): { clips: Clip[]; addedIds: string[] } {
  const target = new Set(ids);
  const rightIdByOriginal = new Map<string, string>();

  const splittable = clips.filter(
    (clip) =>
      target.has(clip.id) &&
      time > clip.start + MIN_CLIP_DURATION &&
      time < clipEnd(clip) - MIN_CLIP_DURATION,
  );
  if (splittable.length === 0) return { clips, addedIds: [] };

  for (const clip of splittable) rightIdByOriginal.set(clip.id, createId());

  const next: Clip[] = [];
  for (const clip of clips) {
    const rightId = rightIdByOriginal.get(clip.id);
    if (!rightId) {
      next.push(clip);
      continue;
    }

    const offset = time - clip.start;
    next.push({ ...clip, duration: offset });
    next.push({
      ...clip,
      id: rightId,
      start: time,
      sourceIn: clip.sourceIn + offset,
      duration: clip.duration - offset,
      linkedId: clip.linkedId
        ? rightIdByOriginal.get(clip.linkedId)
        : undefined,
    });
  }

  return { clips: next, addedIds: [...rightIdByOriginal.values()] };
}

export function removeClips(clips: Clip[], ids: Iterable<string>): Clip[] {
  const removed = new Set(ids);
  if (removed.size === 0) return clips;
  return clips
    .filter((clip) => !removed.has(clip.id))
    .map((clip) =>
      clip.linkedId && removed.has(clip.linkedId)
        ? { ...clip, linkedId: undefined }
        : clip,
    );
}

/**
 * Shifts a group of clips by one shared delta, optionally onto new tracks.
 *
 * The whole group moves by the same amount so linked video and audio never
 * drift apart. When the requested position overlaps something, the delta snaps
 * to the nearest neighbouring edge; if no nearby position is free the move is
 * rejected and `clips` comes back untouched.
 */
export function moveClips(
  clips: Clip[],
  moves: ClipMove[],
  deltaTime: number,
): Clip[] {
  const destinations = new Map(moves.map((move) => [move.id, move.trackId]));
  const moving = clips.filter((clip) => destinations.has(clip.id));
  if (moving.length === 0) return clips;

  const statics = clips.filter((clip) => !destinations.has(clip.id));
  const minStart = Math.min(...moving.map((clip) => clip.start));
  const requested = Math.max(deltaTime, -minStart);

  const isValid = (delta: number): boolean => {
    if (delta < -minStart - 1e-6) return false;
    for (let i = 0; i < moving.length; i += 1) {
      const clip = moving[i];
      const trackId = destinations.get(clip.id)!;
      const start = clip.start + delta;
      const end = start + clip.duration;

      for (const other of statics) {
        if (other.trackId !== trackId) continue;
        if (overlaps(start, end, other.start, clipEnd(other))) return false;
      }
      for (let j = i + 1; j < moving.length; j += 1) {
        const sibling = moving[j];
        if (destinations.get(sibling.id) !== trackId) continue;
        const siblingStart = sibling.start + delta;
        if (overlaps(start, end, siblingStart, siblingStart + sibling.duration))
          return false;
      }
    }
    return true;
  };

  const apply = (delta: number): Clip[] =>
    clips.map((clip) => {
      const trackId = destinations.get(clip.id);
      if (trackId === undefined) return clip;
      return { ...clip, trackId, start: clip.start + delta };
    });

  if (isValid(requested)) return apply(requested);

  const candidates: number[] = [];
  for (const clip of moving) {
    const trackId = destinations.get(clip.id)!;
    for (const other of statics) {
      if (other.trackId !== trackId) continue;
      candidates.push(clipEnd(other) - clip.start);
      candidates.push(other.start - clipEnd(clip));
    }
  }

  const ordered = candidates
    .filter((delta) => delta >= -minStart - 1e-6)
    .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested))
    .slice(0, 16);

  for (const delta of ordered) {
    if (isValid(delta)) return apply(delta);
  }
  return clips;
}

/**
 * Drags one edge of a clip. `newTime` is a timeline position; it gets clamped
 * to the source's available media and to the neighbouring clips.
 */
export function trimClip(
  clips: Clip[],
  assets: AssetMap,
  id: string,
  edge: ClipEdge,
  newTime: number,
): Clip[] {
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return clips;

  const siblings = clipsOnTrack(clips, clip.trackId).filter(
    (candidate) => candidate.id !== id,
  );
  const assetDuration = assets[clip.assetId]?.duration ?? Number.POSITIVE_INFINITY;

  let start = clip.start;
  let sourceIn = clip.sourceIn;
  let duration = clip.duration;

  if (edge === "start") {
    const previousEnd = siblings
      .filter((candidate) => candidate.start < clip.start)
      .reduce((max, candidate) => Math.max(max, clipEnd(candidate)), 0);
    const lower = Math.max(previousEnd, clip.start - clip.sourceIn, 0);
    const upper = clipEnd(clip) - MIN_CLIP_DURATION;
    const time = Math.min(Math.max(newTime, lower), upper);
    const delta = time - clip.start;
    start = time;
    sourceIn = clip.sourceIn + delta;
    duration = clip.duration - delta;
  } else {
    const nextStart = siblings
      .filter((candidate) => candidate.start >= clipEnd(clip))
      .reduce((min, candidate) => Math.min(min, candidate.start), Number.POSITIVE_INFINITY);
    const mediaEnd = clip.start + (assetDuration - clip.sourceIn);
    const upper = Math.min(nextStart, mediaEnd);
    const lower = clip.start + MIN_CLIP_DURATION;
    const time = Math.min(Math.max(newTime, lower), upper);
    duration = time - clip.start;
  }

  if (duration < MIN_CLIP_DURATION) return clips;

  return clips.map((candidate) =>
    candidate.id === id ? { ...candidate, start, sourceIn, duration } : candidate,
  );
}

/** First free slot at the end of a track, used when appending from the bin. */
export function appendPosition(clips: Clip[], trackIds: string[]): number {
  return trackIds.reduce((max, trackId) => Math.max(max, trackEnd(clips, trackId)), 0);
}
