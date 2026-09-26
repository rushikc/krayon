import { create } from "zustand";

import type { EditorStateManifest, EditorVersionSummary, SilenceOptions, ToolStatus } from "@/types/api";
import { DEFAULT_SILENCE_OPTIONS, DEFAULT_SIMILARITY_THRESHOLD } from "@/types/api";

export type JobPhase = "idle" | "running" | "done" | "error";
export type ListMode = "speech" | "all";
export type StepStatus = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  id: string;
  label: string;
  status: StepStatus;
  stepProgress: number;
  message: string | null;
}

const PIPELINE_STEP_DEFS = [
  { id: "starting", label: "Starting pipeline" },
  { id: "transcribing", label: "Transcribing speech" },
  { id: "segmenting", label: "Building speech segments" },
  { id: "grouping", label: "Grouping similar takes" },
  { id: "extracting_audio", label: "Extracting clip audio" },
] as const;

export const REBUILD_PIPELINE_STEP_IDS = [
  "starting",
  "segmenting",
  "grouping",
  "extracting_audio",
] as const;

function initialPipelineSteps(stepIds?: readonly string[]): PipelineStep[] {
  const defs = stepIds
    ? PIPELINE_STEP_DEFS.filter((def) => stepIds.includes(def.id))
    : PIPELINE_STEP_DEFS;
  return defs.map((def) => ({
    id: def.id,
    label: def.label,
    status: "pending",
    stepProgress: 0,
    message: null,
  }));
}

interface SilenceStoreState {
  options: SilenceOptions;
  phase: JobPhase;
  progress: number;
  stepProgress: number;
  message: string | null;
  error: string | null;
  tools: ToolStatus | null;
  toolsLoading: boolean;
  listMode: ListMode;
  pipelineSteps: PipelineStep[];
  activePhase: string | null;
  jobStartedAt: number | null;
  clipCount: number;
  removedSeconds: number;
  similarityThreshold: number;
  analysisDurationSeconds: number | null;
  activeVersionId: string | null;
  versions: EditorVersionSummary[];
  transcript: string;
  setOptions: (patch: Partial<SilenceOptions>) => void;
  setSimilarityThreshold: (value: number) => void;
  setJobState: (patch: Partial<{
    phase: JobPhase;
    progress: number;
    stepProgress: number;
    message: string | null;
    error: string | null;
  }>) => void;
  setTools: (tools: ToolStatus | null) => void;
  setToolsLoading: (loading: boolean) => void;
  setListMode: (mode: ListMode) => void;
  setPipelineFromEvent: (phase: string, progress: number, stepProgress: number, message: string) => void;
  setJobSummary: (
    clipCount: number,
    removedSeconds: number,
    analysisDurationSeconds?: number | null,
  ) => void;
  setVersionState: (activeVersionId: string | null, versions: EditorVersionSummary[]) => void;
  hydrateFromManifest: (manifest: EditorStateManifest, versions: EditorVersionSummary[]) => void;
  resetAnalysisState: () => void;
  startPipeline: (stepIds?: readonly string[]) => void;
  resetJob: () => void;
}

export const useSilenceStore = create<SilenceStoreState>((set) => ({
  options: { ...DEFAULT_SILENCE_OPTIONS },
  phase: "idle",
  progress: 0,
  stepProgress: 0,
  message: null,
  error: null,
  tools: null,
  toolsLoading: true,
  listMode: "speech",
  pipelineSteps: initialPipelineSteps(),
  activePhase: null,
  jobStartedAt: null,
  clipCount: 0,
  removedSeconds: 0,
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  analysisDurationSeconds: null,
  activeVersionId: null,
  versions: [],
  transcript: "",

  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),

  setSimilarityThreshold: (similarityThreshold) => set({ similarityThreshold }),

  setJobState: (patch) =>
    set((state) => ({
      phase: patch.phase ?? state.phase,
      progress: patch.progress ?? state.progress,
      stepProgress: patch.stepProgress ?? state.stepProgress,
      message: patch.message !== undefined ? patch.message : state.message,
      error: patch.error !== undefined ? patch.error : state.error,
    })),

  setTools: (tools) => set({ tools }),

  setToolsLoading: (toolsLoading) => set({ toolsLoading }),

  setListMode: (listMode) => set({ listMode }),

  setPipelineFromEvent: (phase, progress, stepProgress, message) =>
    set((state) => {
      const idx = state.pipelineSteps.findIndex((step) => step.id === phase);
      const steps = state.pipelineSteps.map((step, i) => {
        if (idx < 0) return step;
        if (i < idx) {
          return { ...step, status: "done" as StepStatus, stepProgress: 1, message: step.message };
        }
        if (i === idx) {
          return {
            ...step,
            status: stepProgress >= 1 ? ("done" as StepStatus) : ("active" as StepStatus),
            stepProgress,
            message,
          };
        }
        return { ...step, status: "pending" as StepStatus, stepProgress: 0, message: null };
      });

      return {
        pipelineSteps: steps,
        activePhase: phase,
        progress,
        stepProgress,
        message,
      };
    }),

  setJobSummary: (clipCount, removedSeconds, analysisDurationSeconds = null) =>
    set({
      clipCount,
      removedSeconds,
      analysisDurationSeconds: analysisDurationSeconds ?? null,
    }),

  setVersionState: (activeVersionId, versions) => set({ activeVersionId, versions }),

  hydrateFromManifest: (manifest, versions) =>
    set({
      options: { ...manifest.options },
      similarityThreshold: manifest.similarityThreshold,
      clipCount: manifest.clipCount,
      removedSeconds: manifest.removedSeconds,
      analysisDurationSeconds: manifest.processingDurationSeconds ?? null,
      activeVersionId: manifest.versionId,
      versions,
      transcript: manifest.transcript ?? "",
      phase: "done",
      message: `Restored ${manifest.clipCount} clips`,
      error: null,
    }),

  resetAnalysisState: () =>
    set({
      clipCount: 0,
      removedSeconds: 0,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
      analysisDurationSeconds: null,
      activeVersionId: null,
      versions: [],
      transcript: "",
      phase: "idle",
      progress: 0,
      stepProgress: 0,
      message: null,
      error: null,
      pipelineSteps: initialPipelineSteps(),
      activePhase: null,
      jobStartedAt: null,
      options: { ...DEFAULT_SILENCE_OPTIONS },
    }),

  startPipeline: (stepIds) =>
    set(() => ({
      phase: "running",
      progress: 0,
      stepProgress: 0,
      message: "Starting pipeline…",
      error: null,
      pipelineSteps: initialPipelineSteps(stepIds).map((step, i) =>
        i === 0
          ? { ...step, status: "active" as StepStatus, message: "Starting pipeline…" }
          : step,
      ),
      activePhase: "starting",
      jobStartedAt: Date.now(),
    })),

  resetJob: () =>
    set({
      phase: "idle",
      progress: 0,
      stepProgress: 0,
      message: null,
      error: null,
      pipelineSteps: initialPipelineSteps(),
      activePhase: null,
      jobStartedAt: null,
    }),
}));
