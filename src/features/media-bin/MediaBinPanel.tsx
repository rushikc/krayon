import { join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { AudioLines, Film, FolderOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { transport } from "@/features/editor/playback/transport";
import { isTauri } from "@/lib/media/asset-url";
import { listDevMedia } from "@/lib/media/dev-media";
import { createAsset } from "@/lib/media/load-asset";
import { ensureAudioData } from "@/lib/media/waveform";
import { useMediaStore } from "@/stores/media-store";
import { useTimelineStore } from "@/stores/timeline-store";
import { mediaKind, type MediaFile } from "@/types/media";

export function MediaBinPanel() {
  const {
    folderPath,
    files,
    isLoading,
    loadingPath,
    error,
    setFolder,
    setLoading,
    setLoadingPath,
    setError,
  } = useMediaStore();

  async function handleSelectFolder() {
    try {
      setLoading(true);
      setError(null);

      if (!isTauri()) {
        const { folder, files: devFiles } = await listDevMedia();
        setFolder(folder, devFiles);
        return;
      }

      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select a folder with video files",
      });

      if (selected === null) {
        setLoading(false);
        return;
      }

      const entries = await readDir(selected);
      const mediaFiles = await Promise.all(
        entries
          .filter((entry) => entry.isFile && mediaKind(entry.name) !== null)
          .map(async (entry) => ({
            name: entry.name,
            path: await join(selected, entry.name),
            kind: mediaKind(entry.name)!,
          })),
      );

      mediaFiles.sort((a, b) => a.name.localeCompare(b.name));
      setFolder(selected, mediaFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read folder");
    }
  }

  async function handleOpenFile(file: MediaFile) {
    if (loadingPath) return;
    try {
      setLoadingPath(file.path);
      setError(null);

      const { assets, appendAsset } = useTimelineStore.getState();
      const asset =
        Object.values(assets).find((candidate) => candidate.path === file.path) ??
        (await createAsset(file));

      const { start } = appendAsset(asset);
      transport.seek(start);
      // Decoding runs in the background; the clip is editable immediately.
      void ensureAudioData(asset);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Could not open ${file.name}`,
      );
    } finally {
      setLoadingPath(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Button
        variant="secondary"
        className="h-8 w-full justify-start px-2 text-sm shadow-sm"
        onClick={handleSelectFolder}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <FolderOpen className="mr-2 size-4" />
        )}
        Select Folder
      </Button>

      {folderPath && (
        <p className="truncate text-xs text-muted-foreground" title={folderPath}>
          {folderPath}
        </p>
      )}

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <ul className="space-y-1 pr-3">
          {files.length === 0 && !isLoading && (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">
              No video or audio files found
            </li>
          )}
          {files.map((file) => {
            const isBusy = loadingPath === file.path;
            const Icon = file.kind === "video" ? Film : AudioLines;
            return (
              <li key={file.path}>
                <Button
                  variant="ghost"
                  className="h-8 w-full justify-start px-2 text-sm font-normal"
                  title={`${file.path}\nClick to add to the timeline`}
                  disabled={loadingPath !== null && !isBusy}
                  onClick={() => void handleOpenFile(file)}
                >
                  {isBusy ? (
                    <Loader2 className="mr-2 size-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Icon
                      className={
                        file.kind === "video"
                          ? "mr-2 size-4 shrink-0 text-primary"
                          : "mr-2 size-4 shrink-0 text-emerald-400"
                      }
                    />
                  )}
                  <span className="truncate">{file.name}</span>
                </Button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </div>
  );
}
