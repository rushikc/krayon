import { create } from "zustand";

import {
  appendPosition,
  clipsOnTrack,
  createId,
  expandWithLinked,
  moveClips,
  removeClips,
  splitClips,
  trimClip as trimClipOp,
  type ClipMove,
} from "@/lib/timeline/ops";
import {
  clampZoom,
  DEFAULT_PIXELS_PER_SECOND,
} from "@/lib/timeline/geometry";
import {
  AUDIO_TRACK_ID,
  DEFAULT_TRACKS,
  VIDEO_TRACK_ID,
  type Clip,
  type ClipEdge,
  type MediaAsset,
  type Track,
} from "@/types/timeline";

const HISTORY_LIMIT = 100;

interface Snapshot {
  clips: Clip[];
  selectedIds: string[];
}

interface TimelineState {
  assets: Record<string, MediaAsset>;
  tracks: Track[];
  clips: Clip[];
  selectedIds: string[];
  pixelsPerSecond: number;
  fps: number;
  snapEnabled: boolean;
  linkedSelection: boolean;
  past: Snapshot[];
  future: Snapshot[];

  registerAsset: (asset: MediaAsset) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  /** Drops a bin item on the timeline as a linked video + audio pair. */
  appendAsset: (asset: MediaAsset) => { start: number; ids: string[] };

  selectClips: (ids: string[], additive?: boolean) => void;
  clearSelection: () => void;

  splitAt: (time: number, ids?: string[]) => void;
  deleteClips: (ids: string[]) => void;
  commitMove: (moves: ClipMove[], deltaTime: number) => void;
  commitTrim: (id: string, edge: ClipEdge, time: number, withLinked?: boolean) => void;

  setZoom: (pixelsPerSecond: number) => void;
  zoomBy: (factor: number) => void;
  setFps: (fps: number) => void;
  toggleSnap: () => void;
  toggleLinkedSelection: () => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackLocked: (trackId: string, locked: boolean) => void;

  undo: () => void;
  redo: () => void;
}

function snapshot(state: TimelineState): Snapshot {
  return { clips: state.clips, selectedIds: state.selectedIds };
}

/** Every mutating action folds this in, so undo works without a middleware. */
function withHistory(state: TimelineState): Pick<TimelineState, "past" | "future"> {
  return {
    past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  assets: {},
  tracks: DEFAULT_TRACKS,
  clips: [],
  selectedIds: [],
  pixelsPerSecond: DEFAULT_PIXELS_PER_SECOND,
  fps: 30,
  snapEnabled: true,
  linkedSelection: true,
  past: [],
  future: [],

  registerAsset: (asset) =>
    set((state) => ({ assets: { ...state.assets, [asset.id]: asset } })),

  updateAsset: (id, patch) =>
    set((state) => {
      const existing = state.assets[id];
      if (!existing) return state;
      return { assets: { ...state.assets, [id]: { ...existing, ...patch } } };
    }),

  appendAsset: (asset) => {
    const state = get();
    const isVideo = asset.kind === "video";
    const videoTrack = state.tracks.find((track) => track.id === VIDEO_TRACK_ID);
    const audioTrack = state.tracks.find((track) => track.id === AUDIO_TRACK_ID);
    const trackIds = isVideo
      ? [VIDEO_TRACK_ID, AUDIO_TRACK_ID]
      : [AUDIO_TRACK_ID];
    const start = appendPosition(state.clips, trackIds);
    const duration = Math.max(asset.duration, 0.1);

    const created: Clip[] = [];
    if (isVideo && videoTrack) {
      const videoId = createId("v");
      const audioId = audioTrack ? createId("a") : undefined;
      created.push({
        id: videoId,
        assetId: asset.id,
        trackId: VIDEO_TRACK_ID,
        start,
        sourceIn: 0,
        duration,
        linkedId: audioId,
      });
      if (audioId) {
        created.push({
          id: audioId,
          assetId: asset.id,
          trackId: AUDIO_TRACK_ID,
          start,
          sourceIn: 0,
          duration,
          linkedId: videoId,
        });
      }
    } else {
      created.push({
        id: createId("a"),
        assetId: asset.id,
        trackId: AUDIO_TRACK_ID,
        start,
        sourceIn: 0,
        duration,
      });
    }

    const ids = created.map((clip) => clip.id);
    set((current) => ({
      ...withHistory(current),
      assets: { ...current.assets, [asset.id]: asset },
      clips: [...current.clips, ...created],
      selectedIds: ids,
    }));

    return { start, ids };
  },

  selectClips: (ids, additive = false) =>
    set((state) => {
      const expanded = state.linkedSelection
        ? expandWithLinked(state.clips, ids)
        : ids;
      if (!additive) return { selectedIds: expanded };
      const next = new Set(state.selectedIds);
      for (const id of expanded) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { selectedIds: [...next] };
    }),

  clearSelection: () => set({ selectedIds: [] }),

  splitAt: (time, ids) =>
    set((state) => {
      const lockedTracks = new Set(
        state.tracks.filter((track) => track.locked).map((track) => track.id),
      );
      const candidateIds = (
        ids && ids.length > 0
          ? state.linkedSelection
            ? expandWithLinked(state.clips, ids)
            : ids
          : state.clips.map((clip) => clip.id)
      ).filter((id) => {
        const clip = state.clips.find((candidate) => candidate.id === id);
        return clip ? !lockedTracks.has(clip.trackId) : false;
      });

      const result = splitClips(state.clips, candidateIds, time);
      if (result.clips === state.clips) return state;
      return {
        ...withHistory(state),
        clips: result.clips,
        selectedIds: result.addedIds,
      };
    }),

  deleteClips: (ids) =>
    set((state) => {
      const expanded = state.linkedSelection
        ? expandWithLinked(state.clips, ids)
        : ids;
      const lockedTracks = new Set(
        state.tracks.filter((track) => track.locked).map((track) => track.id),
      );
      const removable = expanded.filter((id) => {
        const clip = state.clips.find((candidate) => candidate.id === id);
        return clip ? !lockedTracks.has(clip.trackId) : false;
      });
      if (removable.length === 0) return state;
      return {
        ...withHistory(state),
        clips: removeClips(state.clips, removable),
        selectedIds: [],
      };
    }),

  commitMove: (moves, deltaTime) =>
    set((state) => {
      const clips = moveClips(state.clips, moves, deltaTime);
      if (clips === state.clips) return state;
      return { ...withHistory(state), clips };
    }),

  commitTrim: (id, edge, time, withLinked = true) =>
    set((state) => {
      let clips = trimClipOp(state.clips, state.assets, id, edge, time);
      const clip = state.clips.find((candidate) => candidate.id === id);
      if (
        withLinked &&
        state.linkedSelection &&
        clip?.linkedId &&
        clips !== state.clips
      ) {
        clips = trimClipOp(clips, state.assets, clip.linkedId, edge, time);
      }
      if (clips === state.clips) return state;
      return { ...withHistory(state), clips };
    }),

  setZoom: (pixelsPerSecond) =>
    set({ pixelsPerSecond: clampZoom(pixelsPerSecond) }),

  zoomBy: (factor) =>
    set((state) => ({
      pixelsPerSecond: clampZoom(state.pixelsPerSecond * factor),
    })),

  setFps: (fps) => set({ fps }),

  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),

  toggleLinkedSelection: () =>
    set((state) => ({ linkedSelection: !state.linkedSelection })),

  setTrackMuted: (trackId, muted) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, muted } : track,
      ),
    })),

  setTrackLocked: (trackId, locked) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, locked } : track,
      ),
    })),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        clips: previous.clips,
        selectedIds: previous.selectedIds,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        clips: next.clips,
        selectedIds: next.selectedIds,
        past: [...state.past, snapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }),
}));

export function selectTrackClips(trackId: string) {
  return (state: TimelineState) => clipsOnTrack(state.clips, trackId);
}
