import { ExternalLink, Film } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { formatDuration, formatResolution, formatSize } from "@/lib/format";
import { useMediaStore } from "@/stores/media-store";

export function DashboardPanel() {
  const navigate = useNavigate();
  const { files, selectedId } = useMediaStore();
  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background/60 backdrop-blur-2xl">
      <div className="border-b border-border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Video details
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {!selectedFile ? (
          <p className="text-sm text-muted-foreground">
            Select a video from the library to preview and open in the editor.
          </p>
        ) : (
          <>
            <section className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Film className="size-4 text-primary" />
                <span className="truncate">{selectedFile.name}</span>
              </div>

              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd>{formatDuration(selectedFile.duration)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Size</dt>
                  <dd>{formatSize(selectedFile.size)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Resolution</dt>
                  <dd>{formatResolution(selectedFile.width, selectedFile.height)}</dd>
                </div>
                {selectedFile.fps != null && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Frame rate</dt>
                    <dd>{Math.round(selectedFile.fps)} fps</dd>
                  </div>
                )}
                {selectedFile.needsProxy && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Proxy</dt>
                    <dd>{selectedFile.proxyReady ? "ready" : "needed"}</dd>
                  </div>
                )}
              </dl>
            </section>

            <Button
              className="w-full"
              onClick={() => navigate(`/editor/${selectedFile.id}`)}
            >
              <ExternalLink className="size-4" />
              Open in editor
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
