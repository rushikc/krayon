import { open } from "@tauri-apps/plugin-dialog";
import { readDir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { Film, FolderOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMediaStore } from "@/stores/media-store";
import { isVideoFile } from "@/types/media";

export function MediaBinPanel() {
  const { folderPath, files, isLoading, error, setFolder, setLoading, setError } =
    useMediaStore();

  async function handleSelectFolder() {
    try {
      setLoading(true);
      setError(null);

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
      const videoFiles = await Promise.all(
        entries
          .filter((entry) => entry.isFile && isVideoFile(entry.name))
          .map(async (entry) => ({
            name: entry.name,
            path: await join(selected, entry.name),
          })),
      );

      videoFiles.sort((a, b) => a.name.localeCompare(b.name));
      setFolder(selected, videoFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read folder");
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
              No .mp4 or .mov files found
            </li>
          )}
          {files.map((file) => (
            <li key={file.path}>
              <Button
                variant="ghost"
                className="h-8 w-full justify-start px-2 text-sm font-normal"
                title={file.path}
              >
                <Film className="mr-2 size-4 shrink-0 text-primary" />
                <span className="truncate">{file.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
