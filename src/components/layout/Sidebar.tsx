import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MediaBinPanel } from "@/features/media-bin/MediaBinPanel";

export function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-background/60 backdrop-blur-2xl">
      <div data-tauri-drag-region className="h-10 w-full shrink-0" />

      <div className="flex min-h-0 flex-1 flex-col p-4">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Library
        </h2>
        <MediaBinPanel />
      </div>

      <div className="shrink-0 border-t border-border p-4">
        <Button variant="ghost" className="h-8 w-full justify-start px-2 text-sm">
          <Settings className="mr-2 size-4" />
          Preferences
        </Button>
      </div>
    </aside>
  );
}
