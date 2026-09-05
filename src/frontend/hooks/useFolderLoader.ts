import { useCallback, useEffect, useRef } from "react";

import { getToolsStatus, pickFolder, scanFolder } from "@/lib/api/client";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";
import { LAST_FOLDER_KEY } from "@/types/api";

export function useAppInit() {
  const initialized = useRef(false);
  const { setFolder, startFolderLoad, finishFolderLoad } = useMediaStore();
  const { setTools, setToolsLoading } = useSilenceStore();

  const loadFolder = useCallback(
    async (path: string) => {
      startFolderLoad(path);
      try {
        const result = await scanFolder(path);
        localStorage.setItem(LAST_FOLDER_KEY, path);
        setFolder(result.path, result.files);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to scan folder";
        finishFolderLoad(message);
      }
    },
    [setFolder, startFolderLoad, finishFolderLoad],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    setToolsLoading(true);
    void getToolsStatus()
      .then(setTools)
      .catch(() => setTools(null))
      .finally(() => setToolsLoading(false));

    const cached = localStorage.getItem(LAST_FOLDER_KEY);
    if (cached) {
      void loadFolder(cached);
    }
  }, [loadFolder, setTools, setToolsLoading]);
}

export function useFolderActions() {
  const { setPickingFolder, setError, startFolderLoad, finishFolderLoad, setFolder } =
    useMediaStore();

  const loadFolder = useCallback(
    async (path: string) => {
      startFolderLoad(path);
      try {
        const result = await scanFolder(path);
        localStorage.setItem(LAST_FOLDER_KEY, path);
        setFolder(result.path, result.files);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to scan folder";
        finishFolderLoad(message);
      }
    },
    [setFolder, startFolderLoad, finishFolderLoad],
  );

  const handleOpenFolder = useCallback(async () => {
    setPickingFolder(true);
    try {
      const result = await pickFolder();
      if (result.cancelled || !result.path) {
        setPickingFolder(false);
        return;
      }
      await loadFolder(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open folder picker");
    }
  }, [loadFolder, setPickingFolder, setError]);

  return { handleOpenFolder };
}
