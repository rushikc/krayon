import { useSyncExternalStore } from "react";

import type { ClipEdge } from "@/types/timeline";

export interface DragState {
  kind: "move" | "trim" | null;
  /** Clips taking part in the gesture. */
  clipIds: string[];
  /** Live offset applied to a move, in seconds. */
  deltaTime: number;
  /** Signed number of track rows the group is being dragged across. */
  trackShift: number;
  /** Clip being trimmed. */
  primaryId: string | null;
  edge: ClipEdge | null;
  /** Live timeline position of the edge being trimmed. */
  trimTime: number;
}

const IDLE: DragState = {
  kind: null,
  clipIds: [],
  deltaTime: 0,
  trackShift: 0,
  primaryId: null,
  edge: null,
  trimTime: 0,
};

/**
 * Drag previews live outside the timeline store: they change on every pointer
 * move, must never enter undo history, and only the clips being dragged should
 * re-render.
 */
let state: DragState = IDLE;
const listeners = new Set<() => void>();

export function getDragState(): DragState {
  return state;
}

export function setDragState(next: Partial<DragState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function clearDragState(): void {
  state = IDLE;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDragState(): DragState {
  return useSyncExternalStore(subscribe, getDragState);
}
