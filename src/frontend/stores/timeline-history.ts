import type { CanvasElement } from "@/types/canvas";

const MAX_HISTORY_ENTRIES = 100;

export interface TimelineHistorySnapshot {
  elements: CanvasElement[];
  selectedId: string | null;
  trackCount: number;
}

let past: TimelineHistorySnapshot[] = [];
let future: TimelineHistorySnapshot[] = [];
let isRestoring = false;
let transactionDepth = 0;
let transactionHasSnapshot = false;

function cloneSnapshot(source: TimelineHistorySnapshot): TimelineHistorySnapshot {
  return {
    elements: structuredClone(source.elements),
    selectedId: source.selectedId,
    trackCount: source.trackCount,
  };
}

function pushPast(snapshot: TimelineHistorySnapshot) {
  past.push(snapshot);
  if (past.length > MAX_HISTORY_ENTRIES) {
    past.shift();
  }
  future = [];
}

export function recordTimelineHistory(source: TimelineHistorySnapshot): void {
  if (isRestoring) {
    return;
  }

  if (transactionDepth > 0) {
    if (!transactionHasSnapshot) {
      pushPast(cloneSnapshot(source));
      transactionHasSnapshot = true;
    }
    return;
  }

  pushPast(cloneSnapshot(source));
}

export function beginTimelineHistoryTransaction(): void {
  transactionDepth += 1;
}

export function endTimelineHistoryTransaction(): void {
  transactionDepth = Math.max(0, transactionDepth - 1);
  if (transactionDepth === 0) {
    transactionHasSnapshot = false;
  }
}

export function resetTimelineHistory(): void {
  past = [];
  future = [];
  transactionDepth = 0;
  transactionHasSnapshot = false;
}

export function canUndoTimelineHistory(): boolean {
  return past.length > 0;
}

export function canRedoTimelineHistory(): boolean {
  return future.length > 0;
}

export function popTimelineHistoryUndo(
  present: TimelineHistorySnapshot,
): TimelineHistorySnapshot | null {
  const previous = past.pop();
  if (!previous) {
    return null;
  }
  future.push(cloneSnapshot(present));
  return previous;
}

export function popTimelineHistoryRedo(
  present: TimelineHistorySnapshot,
): TimelineHistorySnapshot | null {
  const next = future.pop();
  if (!next) {
    return null;
  }
  past.push(cloneSnapshot(present));
  return next;
}

export function runWithTimelineHistoryRestore<T>(restore: () => T): T {
  isRestoring = true;
  try {
    return restore();
  } finally {
    isRestoring = false;
  }
}
