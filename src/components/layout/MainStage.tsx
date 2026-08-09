import { TitleBar } from "@/components/layout/TitleBar";
import { Button } from "@/components/ui/button";
import { PlaybackEngine } from "@/features/editor/playback/PlaybackEngine";
import { PreviewPlayer } from "@/features/editor/preview/PreviewPlayer";
import { TransportBar } from "@/features/editor/preview/TransportBar";
import { Timeline } from "@/features/editor/timeline/Timeline";
import { useEditorShortcuts } from "@/features/editor/useEditorShortcuts";

export function MainStage() {
  useEditorShortcuts();

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <PlaybackEngine />

      <TitleBar
        title="Reel Composer"
        action={
          <Button size="sm" className="h-7 rounded-full px-4 text-xs">
            Export 2K 60fps
          </Button>
        }
      />

      <PreviewPlayer />
      <TransportBar />

      <div className="h-72 shrink-0">
        <Timeline />
      </div>
    </main>
  );
}
