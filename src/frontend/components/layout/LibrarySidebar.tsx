import { Film, FolderOpen, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDuration, formatSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import type { MediaFileInfo } from "@/types/api";

interface LibrarySidebarProps {
  onOpenFolder: () => void;
}

function VideoRow({
  file,
  selected,
  onSelect,
}: {
  file: MediaFileInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors",
        selected
          ? "border-primary/40 bg-primary/10"
          : "border-transparent hover:border-border hover:bg-muted/60",
      )}
    >
      <div className="flex items-center gap-2">
        <Film className="size-4 shrink-0 text-primary" />
        <span className="truncate text-sm font-medium">{file.name}</span>
      </div>
      <div className="flex gap-2 pl-6 text-xs text-muted-foreground">
        <span>{formatDuration(file.duration)}</span>
        <span>·</span>
        <span>{formatSize(file.size)}</span>
      </div>
    </button>
  );
}

export function LibrarySidebar({ onOpenFolder }: LibrarySidebarProps) {
  const {
    folderPath,
    files,
    selectedId,
    isLoading,
    isPickingFolder,
    setSelected,
    setSelectedClip,
  } = useMediaStore();

  const waiting = isLoading || isPickingFolder;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background/60 backdrop-blur-2xl">
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Library
          </h2>
          <Button variant="outline" size="xs" onClick={onOpenFolder} disabled={waiting}>
            {isPickingFolder ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FolderOpen className="size-3.5" />
            )}
            Open
          </Button>
        </div>
        {folderPath ? (
          <p className="truncate text-xs text-muted-foreground" title={folderPath}>
            {folderPath}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No folder selected</p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {waiting && (
            <div className="flex items-center gap-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {isPickingFolder ? "Choose a folder…" : "Scanning folder…"}
            </div>
          )}
          {!waiting && files.length === 0 && !folderPath && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Open a folder with `.mov` or `.mp4` files.
            </p>
          )}
          {!waiting && files.length === 0 && folderPath && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              No videos found in this folder.
            </p>
          )}
          {!waiting &&
            files.map((file) => (
              <VideoRow
                key={file.id}
                file={file}
                selected={selectedId === file.id}
                onSelect={() => {
                  setSelected(file.id);
                  setSelectedClip(null);
                }}
              />
            ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
