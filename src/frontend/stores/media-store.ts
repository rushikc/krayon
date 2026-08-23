import { create } from "zustand";

import { getEditorState, setActiveEditorVersion } from "@/lib/api/client";
import type {
  ClipGroup,
  ClipItem,
  EditorStateManifest,
  EditorVersionSummary,
  MediaFileInfo,
} from "@/types/api";
import { usePlayerStore } from "@/stores/player-store";
import { useSilenceStore } from "@/stores/silence-store";

export type SelectedEntry =
  | { kind: "speech"; clipId: string }
  | { kind: "silence"; start: number; end: number }
  | null;

interface MediaState {
  folderPath: string | null;
  files: MediaFileInfo[];
  selectedId: string | null;
  isLoading: boolean;
  isPickingFolder: boolean;
  error: string | null;
  clips: ClipItem[];
  clipGroups: ClipGroup[];
  selectedClipId: string | null;
  selectedEntry: SelectedEntry;
  activeClipVersionId: string | null;
  setFolder: (path: string, files: MediaFileInfo[]) => void;
  startFolderLoad: (path: string) => void;
  finishFolderLoad: (error?: string | null) => void;
  setSelected: (id: string | null) => void;
  setPickingFolder: (picking: boolean) => void;
  setError: (error: string | null) => void;
  updateFile: (id: string, patch: Partial<MediaFileInfo>) => void;
  setClips: (clips: ClipItem[], groups: ClipGroup[], versionId?: string | null) => void;
  setSelectedClip: (clipId: string | null) => void;
  selectSpeechClip: (clipId: string, autoPlay?: boolean) => void;
  selectSilenceRange: (start: number, end: number, autoPlay?: boolean) => void;
  clearSelection: () => void;
  resetClips: () => void;
  loadEditorState: (mediaId: string) => Promise<void>;
  switchEditorVersion: (mediaId: string, versionId: string) => Promise<void>;
  applyManifest: (manifest: EditorStateManifest, versions?: EditorVersionSummary[]) => void;
}

function triggerAutoPlay(autoPlay?: boolean) {
  if (autoPlay) {
    usePlayerStore.getState().requestAutoPlay();
  }
}

export const useMediaStore = create<MediaState>((set, get) => ({
  folderPath: null,
  files: [],
  selectedId: null,
  isLoading: false,
  isPickingFolder: false,
  error: null,
  clips: [],
  clipGroups: [],
  selectedClipId: null,
  selectedEntry: null,
  activeClipVersionId: null,

  setFolder: (path, files) =>
    set({
      folderPath: path,
      files,
      isLoading: false,
      isPickingFolder: false,
      error: null,
      selectedId: files[0]?.id ?? null,
      clips: [],
      clipGroups: [],
      selectedClipId: null,
      selectedEntry: null,
      activeClipVersionId: null,
    }),

  startFolderLoad: (path) =>
    set({
      folderPath: path,
      isLoading: true,
      isPickingFolder: false,
      error: null,
    }),

  finishFolderLoad: (error) =>
    set({
      isLoading: false,
      isPickingFolder: false,
      error: error ?? null,
    }),

  setSelected: (selectedId) => {
    const prev = get().selectedId;
    if (prev !== selectedId) {
      useSilenceStore.getState().resetAnalysisState();
    }
    set({
      selectedId,
      selectedClipId: null,
      selectedEntry: null,
      ...(prev !== selectedId
        ? { clips: [], clipGroups: [], activeClipVersionId: null }
        : {}),
    });
  },

  setPickingFolder: (isPickingFolder) => set({ isPickingFolder }),

  setError: (error) => set({ error, isLoading: false, isPickingFolder: false }),

  updateFile: (id, patch) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),

  setClips: (clips, clipGroups, versionId = null) =>
    set({ clips, clipGroups, activeClipVersionId: versionId ?? null }),

  setSelectedClip: (selectedClipId) =>
    set({
      selectedClipId,
      selectedEntry: selectedClipId ? { kind: "speech", clipId: selectedClipId } : null,
    }),

  selectSpeechClip: (clipId, autoPlay) => {
    set({
      selectedClipId: clipId,
      selectedEntry: { kind: "speech", clipId },
    });
    triggerAutoPlay(autoPlay);
  },

  selectSilenceRange: (start, end, autoPlay) => {
    set({
      selectedClipId: null,
      selectedEntry: { kind: "silence", start, end },
    });
    triggerAutoPlay(autoPlay);
  },

  clearSelection: () => set({ selectedClipId: null, selectedEntry: null }),

  resetClips: () =>
    set({
      clips: [],
      clipGroups: [],
      selectedClipId: null,
      selectedEntry: null,
      activeClipVersionId: null,
    }),

  applyManifest: (manifest, versions) => {
    set({
      clips: manifest.clips,
      clipGroups: manifest.groups,
      activeClipVersionId: manifest.versionId,
      selectedClipId: null,
      selectedEntry: null,
    });
    useSilenceStore.getState().hydrateFromManifest(
      manifest,
      versions ?? useSilenceStore.getState().versions,
    );
  },

  loadEditorState: async (mediaId) => {
    try {
      const state = await getEditorState(mediaId);
      if (get().selectedId !== mediaId) return;
      if (!state?.activeVersion) {
        useSilenceStore.getState().resetAnalysisState();
        return;
      }
      useSilenceStore.getState().setVersionState(
        state.index.activeVersionId,
        state.index.versions,
      );
      if (get().selectedId !== mediaId) return;
      get().applyManifest(state.activeVersion, state.index.versions);
    } catch {
      if (get().selectedId === mediaId) {
        useSilenceStore.getState().resetAnalysisState();
      }
    }
  },

  switchEditorVersion: async (mediaId, versionId) => {
    const state = await setActiveEditorVersion(mediaId, versionId);
    if (get().selectedId !== mediaId) return;
    useSilenceStore.getState().setVersionState(
      state.index.activeVersionId,
      state.index.versions,
    );
    if (get().selectedId !== mediaId) return;
    get().applyManifest(state.activeVersion, state.index.versions);
  },
}));
