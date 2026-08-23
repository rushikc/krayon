import { create } from "zustand";

import type {
  SilenceAnalysis,
  SilenceMethod,
  SilenceOptions,
  SilencePhase,
  ToolStatus,
  WordTiming,
} from "@/types/silence";
import { DEFAULT_SILENCE_OPTIONS } from "@/types/silence";

interface SilenceStoreState {
  options: SilenceOptions;
  activeJobId: string | null;
  phase: SilencePhase;
  progress: number;
  message: string | null;
  error: string | null;
  lastResult: SilenceAnalysis | null;
  tools: ToolStatus | null;
  /** Per-asset whisper words for future multi-take selection. */
  wordsByAssetPath: Record<string, WordTiming[]>;

  setOptions: (patch: Partial<SilenceOptions>) => void;
  setMethod: (method: SilenceMethod) => void;
  setJobState: (patch: {
    activeJobId?: string | null;
    phase?: SilencePhase;
    progress?: number;
    message?: string | null;
    error?: string | null;
  }) => void;
  setLastResult: (result: SilenceAnalysis | null) => void;
  setTools: (tools: ToolStatus | null) => void;
  cacheWords: (assetPath: string, words: WordTiming[]) => void;
  resetJob: () => void;
}

export const useSilenceStore = create<SilenceStoreState>((set) => ({
  options: { ...DEFAULT_SILENCE_OPTIONS },
  activeJobId: null,
  phase: "idle",
  progress: 0,
  message: null,
  error: null,
  lastResult: null,
  tools: null,
  wordsByAssetPath: {},

  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),

  setMethod: (method) =>
    set((state) => ({ options: { ...state.options, method } })),

  setJobState: (patch) =>
    set((state) => ({
      activeJobId:
        patch.activeJobId !== undefined ? patch.activeJobId : state.activeJobId,
      phase: patch.phase ?? state.phase,
      progress: patch.progress ?? state.progress,
      message: patch.message !== undefined ? patch.message : state.message,
      error: patch.error !== undefined ? patch.error : state.error,
    })),

  setLastResult: (lastResult) => set({ lastResult }),

  setTools: (tools) => set({ tools }),

  cacheWords: (assetPath, words) =>
    set((state) => ({
      wordsByAssetPath: { ...state.wordsByAssetPath, [assetPath]: words },
    })),

  resetJob: () =>
    set({
      activeJobId: null,
      phase: "idle",
      progress: 0,
      message: null,
      error: null,
    }),
}));
