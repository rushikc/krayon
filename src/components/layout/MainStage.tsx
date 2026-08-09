import { Pause, Play, Scissors } from "lucide-react";

import { TitleBar } from "@/components/layout/TitleBar";
import { Button } from "@/components/ui/button";

export function MainStage() {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <TitleBar
        title="Reel Composer"
        action={
          <Button size="sm" className="h-7 rounded-full px-4 text-xs">
            Export 2K 60fps
          </Button>
        }
      />

      <div className="relative flex flex-1 items-center justify-center bg-black">
        <div className="flex h-[711px] w-[400px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-500 shadow-2xl">
          Video Preview (9:16)
        </div>
      </div>

      <div className="flex h-64 shrink-0 flex-col border-t border-border bg-card">
        <div className="flex h-10 shrink-0 items-center space-x-4 border-b border-border bg-muted/30 px-4">
          <Button variant="ghost" size="icon" className="size-7 rounded-md">
            <Play className="size-4 fill-current" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-md">
            <Pause className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7 rounded-md">
            <Scissors className="size-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          <div className="flex h-12 items-center rounded-md border border-primary/30 bg-primary/20 px-4 font-mono text-xs text-primary-foreground">
            Video Track 1
          </div>
          <div className="flex h-12 items-center rounded-md border border-green-500/30 bg-green-500/20 px-4 font-mono text-xs text-green-400">
            Audio Track (Takes)
          </div>
        </div>
      </div>
    </main>
  );
}
