import { create } from "zustand";

import { clamp } from "@/components/editor/timeline/lib/clamp";
import { cutElementsAtTime } from "@/components/editor/timeline/lib/cutAtTime";
import type { RenderTheme } from "@/lib/render-theme";
import {
  durationFromElements,
  lastVisibleTime,
} from "@/lib/reel-duration";
import type { CanvasElement } from "@/types/canvas";

export { durationFromElements, lastVisibleTime } from "@/lib/reel-duration";

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
  renderTheme: RenderTheme;
  setElements: (elements: CanvasElement[]) => void;
  selectElement: (id: string | null) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  setCurrentTime: (time: number) => void;
  setRenderTheme: (theme: RenderTheme) => void;
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  addTrack: () => void;
  deleteTrack: (index: number) => void;
  deleteSelectedElement: () => void;
  cutAtPlayhead: () => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

export const DEFAULT_TRACK_COUNT = 10;

const initialElements: CanvasElement[] = [
  {
    id: "client",
    type: "box",
    matrix: [2, 1, 15, 3],
    label: "Client",
    colorTheme: "sky",
    time: { start: 0.4, end: 30, track: 2 },
  },
  {
    id: "step-1",
    type: "number",
    matrix: [0, 1, 1, 2],
    value: 1,
    colorTheme: "ink",
    time: { start: 0, end: 3, track: 1 },
  },
  {
    id: "api-gateway",
    type: "box",
    matrix: [2, 5, 15, 7],
    label: "API Gateway",
    colorTheme: "violet",
    time: { start: 1, end: 30, track: 3 },
  },
  {
    id: "client-to-gw",
    type: "arrow",
    sourceId: "client",
    targetId: "api-gateway",
    variant: "solid",
    time: { start: 2.2, end: 30, track: 7 },
  },
  {
    id: "step-2",
    type: "number",
    matrix: [0, 5, 1, 6],
    value: 2,
    colorTheme: "ink",
    time: { start: 3.5, end: 6.5, track: 1 },
  },
  {
    id: "lambda",
    type: "box",
    matrix: [2, 10, 15, 12],
    label: "Lambda Function",
    colorTheme: "green",
    time: { start: 5, end: 30, track: 4 },
  },
  {
    id: "gw-to-lambda",
    type: "arrow",
    sourceId: "api-gateway",
    targetId: "lambda",
    variant: "dashed",
    time: { start: 6.5, end: 30, track: 8 },
  },
  {
    id: "callout-rest",
    type: "box",
    matrix: [10, 9, 16, 11],
    label: "REST + WS",
    colorTheme: "lavender",
    fontSize: 12,
    time: { start: 7, end: 12, track: 0 },
  },
  {
    id: "step-3",
    type: "number",
    matrix: [0, 10, 1, 11],
    value: 3,
    colorTheme: "ink",
    time: { start: 8.5, end: 11.5, track: 1 },
  },
  {
    id: "dynamo",
    type: "box",
    matrix: [2, 15, 15, 17],
    label: "DynamoDB",
    colorTheme: "blue",
    time: { start: 10, end: 30, track: 5 },
  },
  {
    id: "lambda-to-dynamo",
    type: "arrow",
    sourceId: "lambda",
    targetId: "dynamo",
    variant: "solid",
    time: { start: 11.5, end: 30, track: 9 },
  },
  {
    id: "callout-query",
    type: "box",
    matrix: [10, 14, 16, 16],
    label: "Query in ms",
    colorTheme: "tan",
    fontSize: 12,
    time: { start: 14, end: 19, track: 0 },
  },
  {
    id: "step-4",
    type: "number",
    matrix: [0, 15, 1, 16],
    value: 4,
    colorTheme: "ink",
    time: { start: 16, end: 19, track: 1 },
  },
  {
    id: "ok",
    type: "box",
    matrix: [2, 20, 15, 22],
    label: "200 OK",
    colorTheme: "mint",
    time: { start: 18, end: 30, track: 6 },
  },
  {
    id: "step-5",
    type: "number",
    matrix: [0, 20, 1, 21],
    value: 5,
    colorTheme: "ink",
    time: { start: 21, end: 24.5, track: 1 },
  },
  {
    id: "callout-fast",
    type: "box",
    matrix: [10, 23, 16, 25],
    label: "Warm path",
    colorTheme: "orange",
    fontSize: 12,
    time: { start: 23, end: 30, track: 0 },
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

function commitElements(
  get: () => CanvasState,
  elements: CanvasElement[],
  extra: Partial<CanvasState> = {},
): Partial<CanvasState> {
  const duration = durationFromElements(elements);
  return {
    elements,
    duration,
    currentTime: clamp(get().currentTime, 0, lastVisibleTime(duration)),
    ...extra,
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  elements: initialElements,
  selectedId: null,
  duration: durationFromElements(initialElements),
  currentTime: 0,
  isPlaying: false,
  trackCount: DEFAULT_TRACK_COUNT,
  renderTheme: "bright",

  setElements: (elements) => {
    recordTimelineHistory(snapshotOf(get()));
    set(commitElements(get, elements));
  },

  selectElement: (id) => set({ selectedId: id }),

  updateElement: (id, patch) => {
    recordTimelineHistory(snapshotOf(get()));
    const elements = get().elements.map((element) => {
      if (element.id !== id) {
        return element;
      }

      return {
        ...element,
        ...patch,
        id: element.id,
        type: element.type,
      } as CanvasElement;
    });
    set(commitElements(get, elements));
  },

  setCurrentTime: (time) => {
    const { duration } = get();
    set({ currentTime: clamp(time, 0, lastVisibleTime(duration)) });
  },

  setRenderTheme: (theme) => set({ renderTheme: theme }),

  play: () => {
    const { currentTime, duration } = get();
    set({
      currentTime:
        currentTime >= lastVisibleTime(duration) ? 0 : currentTime,
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

    set(
      commitElements(get, nextElements, {
        trackCount: trackCount - 1,
        selectedId:
          selectedId && removedIds.has(selectedId) ? null : selectedId,
      }),
    );
  },

  deleteSelectedElement: () => {
    const { selectedId, elements } = get();
    if (!selectedId) {
      return;
    }
    recordTimelineHistory(snapshotOf(get()));
    set(
      commitElements(get, elements.filter((element) => element.id !== selectedId), {
        selectedId: null,
      }),
    );
  },

  cutAtPlayhead: () => {
    const { elements, currentTime } = get();
    const result = cutElementsAtTime(elements, currentTime);
    if (result.splitIds.length === 0) {
      return;
    }
    recordTimelineHistory(snapshotOf(get()));
    set(
      commitElements(get, result.elements, {
        selectedId: result.splitIds[0] ?? null,
      }),
    );
  },

  undo: () => {
    const previous = popTimelineHistoryUndo(snapshotOf(get()));
    if (!previous) {
      return;
    }
    runWithTimelineHistoryRestore(() => {
      set(
        commitElements(get, previous.elements, {
          selectedId: previous.selectedId,
          trackCount: previous.trackCount,
        }),
      );
    });
  },

  redo: () => {
    const next = popTimelineHistoryRedo(snapshotOf(get()));
    if (!next) {
      return;
    }
    runWithTimelineHistoryRestore(() => {
      set(
        commitElements(get, next.elements, {
          selectedId: next.selectedId,
          trackCount: next.trackCount,
        }),
      );
    });
  },

  reset: () => {
    resetTimelineHistory();
    set({
      ...commitElements(get, initialElements, {
        selectedId: null,
        isPlaying: false,
        trackCount: DEFAULT_TRACK_COUNT,
        renderTheme: "bright",
      }),
      currentTime: 0,
    });
  },
}));
