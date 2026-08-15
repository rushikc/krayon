import { useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { transport } from "@/features/editor/playback/transport";
import { TRACK_ROW_HEIGHT } from "@/features/editor/timeline/constants";
import {
  clearDragState,
  setDragState,
} from "@/features/editor/timeline/drag-state";
import { pxToTime, snapToFrame } from "@/lib/timeline/geometry";
import type { ClipMove } from "@/lib/timeline/ops";
import {
  collectSnapTargets,
  snapDelta,
  snapTime,
  SNAP_THRESHOLD_PX,
} from "@/lib/timeline/snapping";
import { useTimelineStore } from "@/stores/timeline-store";
import {
  clipEnd,
  MIN_CLIP_DURATION,
  type Clip,
  type ClipEdge,
  type Track,
} from "@/types/timeline";

/**
 * Destination track for each dragged clip, given how many rows the pointer has
 * travelled.
 *
 * The shift is counted within tracks of the clip's own kind and clamped there,
 * which is what lets a linked pair move vertically at all: dragging the audio of
 * an A/V pair down to `A2` leaves the video on `V1` instead of blocking the
 * whole group because picture can't live on an audio track.
 */
function resolveTrackTargets(
  tracks: Track[],
  moving: Clip[],
  rowShift: number,
): Record<string, string> {
  const targets: Record<string, string> = {};
  if (rowShift === 0) return targets;

  const byId = new Map(tracks.map((track) => [track.id, track]));

  for (const clip of moving) {
    const kind = byId.get(clip.trackId)?.kind;
    if (!kind) continue;
    const sameKind = tracks.filter((track) => track.kind === kind);
    const from = sameKind.findIndex((track) => track.id === clip.trackId);
    if (from < 0) continue;
    const to = Math.min(Math.max(from + rowShift, 0), sameKind.length - 1);
    const target = sameKind[to];
    if (target.locked || target.id === clip.trackId) continue;
    targets[clip.id] = target.id;
  }
  return targets;
}

export function useTimelineDrag() {
  const beginMove = useCallback(
    (event: ReactPointerEvent, clip: Clip): void => {
      if (event.button !== 0) return;
      event.stopPropagation();

      const store = useTimelineStore.getState();
      const lockedTracks = new Set(
        store.tracks.filter((track) => track.locked).map((track) => track.id),
      );
      if (lockedTracks.has(clip.trackId)) return;

      const ignoreLinks = event.altKey;
      const additive = event.shiftKey;
      if (additive) {
        store.selectClips([clip.id], true, !ignoreLinks);
      } else if (!store.selectedIds.includes(clip.id)) {
        store.selectClips([clip.id], false, !ignoreLinks);
      }

      const current = useTimelineStore.getState();
      const ids = ignoreLinks ? [clip.id] : current.selectedIds;
      const moving = current.clips.filter(
        (candidate) =>
          ids.includes(candidate.id) && !lockedTracks.has(candidate.trackId),
      );
      if (moving.length === 0) return;

      const { pixelsPerSecond, fps, snapEnabled, clips } = current;
      const targets = collectSnapTargets(
        clips,
        moving.map((candidate) => candidate.id),
        transport.getTime(),
      );
      const tolerance = pxToTime(SNAP_THRESHOLD_PX, pixelsPerSecond);
      const startX = event.clientX;
      const startY = event.clientY;

      let deltaTime = 0;
      let trackTargets: Record<string, string> = {};

      setDragState({
        kind: "move",
        clipIds: moving.map((candidate) => candidate.id),
        deltaTime: 0,
        trackTargets: {},
        primaryId: clip.id,
        edge: null,
        trimTime: 0,
      });

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const raw = pxToTime(moveEvent.clientX - startX, pixelsPerSecond);
        let next = snapToFrame(clip.start + raw, fps) - clip.start;
        if (snapEnabled) next = snapDelta(next, moving, targets, tolerance);
        deltaTime = Math.max(
          next,
          -Math.min(...moving.map((candidate) => candidate.start)),
        );
        trackTargets = resolveTrackTargets(
          current.tracks,
          moving,
          Math.round((moveEvent.clientY - startY) / TRACK_ROW_HEIGHT),
        );
        setDragState({ deltaTime, trackTargets });
      };

      const finish = (commit: boolean): void => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);
        clearDragState();
        if (!commit) return;
        if (deltaTime === 0 && Object.keys(trackTargets).length === 0) return;

        const moves: ClipMove[] = moving.map((candidate) => ({
          id: candidate.id,
          trackId: trackTargets[candidate.id] ?? candidate.trackId,
        }));
        useTimelineStore.getState().commitMove(moves, deltaTime);
      };

      const onPointerUp = (): void => finish(true);
      const onKeyDown = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key === "Escape") finish(false);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
    },
    [],
  );

  const beginTrim = useCallback(
    (event: ReactPointerEvent, clip: Clip, edge: ClipEdge): void => {
      if (event.button !== 0) return;
      event.stopPropagation();

      const store = useTimelineStore.getState();
      const track = store.tracks.find((candidate) => candidate.id === clip.trackId);
      if (track?.locked) return;

      store.selectClips([clip.id], false, !event.altKey);

      const { pixelsPerSecond, fps, snapEnabled, clips, assets } =
        useTimelineStore.getState();
      const assetDuration = assets[clip.assetId]?.duration ?? Number.POSITIVE_INFINITY;
      const targets = collectSnapTargets(clips, [clip.id], transport.getTime());
      const tolerance = pxToTime(SNAP_THRESHOLD_PX, pixelsPerSecond);
      const origin = edge === "start" ? clip.start : clipEnd(clip);
      const startX = event.clientX;

      const lower =
        edge === "start"
          ? Math.max(0, clip.start - clip.sourceIn)
          : clip.start + MIN_CLIP_DURATION;
      const upper =
        edge === "start"
          ? clipEnd(clip) - MIN_CLIP_DURATION
          : clip.start + (assetDuration - clip.sourceIn);

      let trimTime = origin;
      setDragState({
        kind: "trim",
        clipIds: [clip.id],
        deltaTime: 0,
        trackTargets: {},
        primaryId: clip.id,
        edge,
        trimTime: origin,
      });

      const onPointerMove = (moveEvent: PointerEvent): void => {
        const raw = origin + pxToTime(moveEvent.clientX - startX, pixelsPerSecond);
        let next = snapToFrame(raw, fps);
        if (snapEnabled) next = snapTime(next, targets, tolerance);
        trimTime = Math.min(Math.max(next, lower), upper);
        setDragState({ trimTime });
      };

      const finish = (commit: boolean): void => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("keydown", onKeyDown);
        clearDragState();
        if (!commit || trimTime === origin) return;
        useTimelineStore
          .getState()
          .commitTrim(clip.id, edge, trimTime, !event.altKey);
      };

      const onPointerUp = (): void => finish(true);
      const onKeyDown = (keyEvent: KeyboardEvent): void => {
        if (keyEvent.key === "Escape") finish(false);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("keydown", onKeyDown);
    },
    [],
  );

  return { beginMove, beginTrim };
}
