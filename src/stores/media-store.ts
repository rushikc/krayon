import { create } from "zustand";

import type { MediaFile } from "@/types/media";

interface MediaBinState {
  folderPath: string | null;
  files: MediaFile[];
  isLoading: boolean;
  /** Path of the bin item currently being probed, for per-row feedback. */
  loadingPath: string | null;
  error: string | null;
  setFolder: (path: string, files: MediaFile[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadingPath: (path: string | null) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useMediaStore = create<MediaBinState>((set) => ({
  folderPath: null,
  files: [],
  isLoading: false,
  loadingPath: null,
  error: null,
  setFolder: (path, files) =>
    set({ folderPath: path, files, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setLoadingPath: (loadingPath) => set({ loadingPath }),
  setError: (error) => set({ error, isLoading: false, loadingPath: null }),
  reset: () =>
    set({
      folderPath: null,
      files: [],
      isLoading: false,
      loadingPath: null,
      error: null,
    }),
}));
