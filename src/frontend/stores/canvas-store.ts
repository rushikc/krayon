import { create } from "zustand";

import { clamp } from "@/components/editor/timeline/lib/clamp";
import { cutElementsAtTime } from "@/components/editor/timeline/lib/cutAtTime";
import type { CanvasElement } from "@/types/canvas";

import {
  popTimelineHistoryRedo,
  popTimelineHistoryUndo,
  recordTimelineHistory,
  resetTimelineHistory,
  runWithTimelineHistoryRestore,
  type TimelineHistorySnapshot,
} from "./timeline-history";

interface CanvasState {
  elements: CanvasElement[];
  selectedId: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  trackCount: number;
  setElements: (elements: CanvasElement[]) => void;
  selectElement: (id: string | null) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  addTrack: () => void;
  deleteTrack: (index: number) => void;
  cutAtPlayhead: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const DEFAULT_DURATION = 60;
export const DEFAULT_TRACK_COUNT = 5;

const initialElements: CanvasElement[] = [
  {
    id: "step-1",
    type: "number",
    x: 45,
    y: 10,
    size: 10,
    value: 1,
    colorTheme: "ink",
    time: { start: 0, end: 6, track: 2 },
  },
  {
    id: "api-gateway",
    type: "box",
    x: 12,
    y: 18,
    width: 76,
    height: 14,
    label: "API Gateway",
    sublabel: "Routes incoming requests",
    colorTheme: "violet",
    time: { start: 1, end: 50, track: 0 },
  },
  {
    id: "step-2",
    type: "number",
    x: 45,
    y: 60,
    size: 10,
    value: 2,
    colorTheme: "ink",
    time: { start: 8, end: 14, track: 2 },
  },
  {
    id: "lambda",
    type: "box",
    x: 12,
    y: 68,
    width: 76,
    height: 14,
    label: "Lambda Function",
    sublabel: "Runs application logic",
    colorTheme: "green",
    time: { start: 10, end: 50, track: 1 },
  },
  {
    id: "gw-to-lambda",
    type: "arrow",
    sourceId: "api-gateway",
    targetId: "lambda",
    variant: "dashed",
    time: { start: 12, end: 50, track: 3 },
  },
];

function snapshotOf(state: {
  elements: CanvasElement[];
  selectedId: string | null;
  trackCount: number;
}): TimelineHistorySnapshot {
  return {
    elements: state.elements,
    selectedId: state.selectedId,
    trackCount: state.trackCount,
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  elements: initialElements,
  selectedId: null,
  duration: DEFAULT_DURATION,
  currentTime: 0,
  isPlaying: false,
  trackCount: DEFAULT_TRACK_COUNT,

  setElements: (elements) => {
    recordTimelineHistory(snapshotOf(get()));
    set({ elements });
  },

  selectElement: (id) => set({ selectedId: id }),

  updateElement: (id, patch) => {
    recordTimelineHistory(snapshotOf(get()));
    set((state) => ({
      elements: state.elements.map((element) => {
        if (element.id !== id) {
          return element;
        }

        return {
          ...element,
          ...patch,
          id: element.id,
          type: element.type,
        } as CanvasElement;
      }),
    }));
  },

  setDuration: (duration) => {
    const next = Math.max(1, duration);
    set({
      duration: next,
      currentTime: clamp(get().currentTime, 0, next),
    });
  },

  setCurrentTime: (time) => {
    const { duration } = get();
    set({ currentTime: clamp(time, 0, duration) });
  },

  play: () => {
    const { currentTime, duration } = get();
    set({
      currentTime: currentTime >= duration ? 0 : currentTime,
      isPlaying: true,
    });
  },

  pause: () => set({ isPlaying: false }),

  togglePlayback: () => {
    if (get().isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  addTrack: () => {
    recordTimelineHistory(snapshotOf(get()));
    set({ trackCount: get().trackCount + 1 });
  },

  deleteTrack: (index) => {
    const { trackCount, elements, selectedId } = get();
    if (trackCount <= 1 || index < 0 || index >= trackCount) {
      return;
    }

    recordTimelineHistory(snapshotOf(get()));

    const removedIds = new Set(
      elements.filter((el) => el.time.track === index).map((el) => el.id),
    );
    const nextElements = elements
      .filter((el) => el.time.track !== index)
      .map((el) =>
        el.time.track > index
          ? { ...el, time: { ...el.time, track: el.time.track - 1 } }
          : el,
      );

    set({
      elements: nextElements,
      trackCount: trackCount - 1,
      selectedId:
        selectedId && removedIds.has(selectedId) ? null : selectedId,
    });
  },

  cutAtPlayhead: () => {
    const { elements, currentTime } = get();
    const result = cutElementsAtTime(elements, currentTime);
    if (result.splitIds.length === 0) {
      return;
    }
    recordTimelineHistory(snapshotOf(get()));
    set({
      elements: result.elements,
      selectedId: result.splitIds[0] ?? null,
    });
  },

  undo: () => {
    const previous = popTimelineHistoryUndo(snapshotOf(get()));
    if (!previous) {
      return;
    }
    runWithTimelineHistoryRestore(() => {
      set({
        elements: previous.elements,
        selectedId: previous.selectedId,
        trackCount: previous.trackCount,
      });
    });
  },

  redo: () => {
    const next = popTimelineHistoryRedo(snapshotOf(get()));
    if (!next) {
      return;
    }
    runWithTimelineHistoryRestore(() => {
      set({
        elements: next.elements,
        selectedId: next.selectedId,
        trackCount: next.trackCount,
      });
    });
  },

  reset: () => {
    resetTimelineHistory();
    set({
      elements: initialElements,
      selectedId: null,
      duration: DEFAULT_DURATION,
      currentTime: 0,
      isPlaying: false,
      trackCount: DEFAULT_TRACK_COUNT,
    });
  },
}));
