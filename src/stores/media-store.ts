import { create } from "zustand";

import type { MediaFile } from "@/types/media";

interface MediaBinState {
  folderPath: string | null;
  files: MediaFile[];
  isLoading: boolean;
  error: string | null;
  setFolder: (path: string, files: MediaFile[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useMediaStore = create<MediaBinState>((set) => ({
  folderPath: null,
  files: [],
  isLoading: false,
  error: null,
  setFolder: (path, files) =>
    set({ folderPath: path, files, isLoading: false, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  reset: () =>
    set({ folderPath: null, files: [], isLoading: false, error: null }),
}));
