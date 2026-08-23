import { Loader2, VolumeX, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  generateProxy,
  getToolsStatus,
  listenJobProgress,
  startClipsJob,
} from "@/lib/api/client";
import type { ClipsGenerateResponse } from "@/types/api";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";

export function ControlsPanel() {
  const {
    files,
    selectedId,
    setClips,
    loadEditorState,
    switchEditorVersion,
    updateFile,
  } = useMediaStore();
  const {
    options,
    phase,
    progress,
    message,
    error,
    tools,
    toolsLoading,
    listMode,
    clipCount,
    removedSeconds,
    activeVersionId,
    versions,
    setOptions,
    setJobState,
    setTools,
    setToolsLoading,
    setListMode,
    setPipelineFromEvent,
    setJobSummary,
    startPipeline,
  } = useSilenceStore();

  const [proxyLoading, setProxyLoading] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const busy = phase === "running" || proxyLoading;
  const hasClips = clipCount > 0;

  useEffect(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, [selectedId]);

  const refreshTools = async () => {
    setToolsLoading(true);
    try {
      const status = await getToolsStatus();
      setTools(status);
    } catch {
      setTools(null);
    } finally {
      setToolsLoading(false);
    }
  };

  const runAnalysisPipeline = async () => {
    if (!selectedFile) return;

    const mediaId = selectedFile.id;
    unsubscribeRef.current?.();
    startPipeline();

    try {
      const { jobId } = await startClipsJob(selectedFile.path, options);

      unsubscribeRef.current = listenJobProgress(
        "/api/clips/progress",
        jobId,
        (event) => {
          if (useMediaStore.getState().selectedId !== mediaId) return;
          if (event.phase === "complete" || event.phase === "error") return;
          setPipelineFromEvent(
            event.phase,
            event.progress,
            event.stepProgress ?? event.progress,
            event.message,
          );
          setJobState({
            phase: "running",
            progress: event.progress,
            stepProgress: event.stepProgress ?? event.progress,
            message: event.message,
          });
        },
        (payload) => {
          unsubscribeRef.current = null;
          if (useMediaStore.getState().selectedId !== mediaId) return;
          if (!payload) {
            setJobState({
              phase: "error",
              error: "Pipeline finished but no result was received",
            });
            return;
          }
          try {
            const result = JSON.parse(payload) as ClipsGenerateResponse;
            setClips(result.clips, result.groups);

            const kept = result.clips.reduce((sum, c) => sum + c.duration, 0);
            const sourceDuration = selectedFile.duration ?? kept;
            const removed = Math.max(0, sourceDuration - kept);

            setJobSummary(result.clips.length, removed);
            setPipelineFromEvent("grouping", 1, 1, `Generated ${result.clips.length} clips`);
            setJobState({
              phase: "done",
              progress: 1,
              stepProgress: 1,
              message: `Generated ${result.clips.length} clips in ${result.groups.length} groups`,
            });
            void loadEditorState(mediaId);
          } catch (err) {
            setJobState({
              phase: "error",
              error: err instanceof Error ? err.message : "Failed to parse pipeline result",
            });
          }
        },
        (errMsg) => {
          unsubscribeRef.current = null;
          if (useMediaStore.getState().selectedId !== mediaId) return;
          setJobState({ phase: "error", progress: 1, error: errMsg });
        },
      );
    } catch (err) {
      setJobState({
        phase: "error",
        error: err instanceof Error ? err.message : "Failed to start pipeline",
      });
    }
  };

  const runGenerateProxy = async () => {
    if (!selectedFile) return;
    setProxyLoading(true);
    try {
      await generateProxy(selectedFile.id);
      updateFile(selectedFile.id, { proxyReady: true });
    } catch (err) {
      setJobState({
        phase: "error",
        error: err instanceof Error ? err.message : "Proxy generation failed",
      });
    } finally {
      setProxyLoading(false);
    }
  };

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background/60 backdrop-blur-2xl">
      <div className="border-b border-border p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Controls
        </h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {!selectedFile && (
          <p className="text-sm text-muted-foreground">Select a video to see processing options.</p>
        )}

        {selectedFile && (
          <>
            <section className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <VolumeX className="size-4 text-primary" />
                Silence removal
              </div>
              <p className="text-xs text-muted-foreground">
                Transcribes speech, cuts clips, and groups similar takes automatically.
              </p>

              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Silence threshold (s)</span>
                <input
                  type="number"
                  min={0.1}
                  max={2}
                  step={0.05}
                  value={options.silenceThreshold}
                  onChange={(e) =>
                    setOptions({ silenceThreshold: Number(e.target.value) })
                  }
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5"
                />
              </label>

              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Pad (s)</span>
                <input
                  type="number"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={options.pad}
                  onChange={(e) => setOptions({ pad: Number(e.target.value) })}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5"
                />
              </label>

              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void runAnalysisPipeline()}
              >
                {phase === "running" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wand2 className="size-4" />
                )}
                Analyze silence
              </Button>

              {versions.length > 0 && (
                <label className="block space-y-1 text-xs">
                  <span className="text-muted-foreground">Analysis run</span>
                  <select
                    value={activeVersionId ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      if (!selectedId || !e.target.value) return;
                      void switchEditorVersion(selectedId, e.target.value);
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5"
                  >
                    {versions.map((v) => (
                      <option key={v.versionId} value={v.versionId}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {hasClips && (
                <Button
                  variant={listMode === "all" ? "default" : "outline"}
                  className="w-full"
                  disabled={busy}
                  onClick={() => setListMode(listMode === "speech" ? "all" : "speech")}
                >
                  {listMode === "speech" ? "Show all segments" : "Speech clips only"}
                </Button>
              )}

              {hasClips && (
                <p className="text-xs text-muted-foreground">
                  {clipCount} clips · removed {removedSeconds.toFixed(1)}s
                </p>
              )}
            </section>

            {selectedFile.needsProxy && !selectedFile.proxyReady && (
              <section className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
                <p className="text-sm font-medium">Large file proxy</p>
                <p className="text-xs text-muted-foreground">
                  This file is over 1 GB. Generate a low-res proxy for smooth playback.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy}
                  onClick={() => void runGenerateProxy()}
                >
                  {proxyLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  Generate proxy
                </Button>
              </section>
            )}
          </>
        )}

        {(message || error) && phase !== "running" && (
          <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {error ?? message}
          </p>
        )}

        {phase === "running" && (
          <p className="text-xs text-muted-foreground">
            Processing… {Math.round(progress * 100)}%
          </p>
        )}

        <section className="mt-auto space-y-2 rounded-xl border border-border/60 p-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Backend tools</span>
            <Button
              variant="ghost"
              size="xs"
              disabled={toolsLoading}
              onClick={() => void refreshTools()}
            >
              {toolsLoading ? <Loader2 className="size-3 animate-spin" /> : "Refresh"}
            </Button>
          </div>
          {toolsLoading && !tools ? (
            <div className="flex items-center gap-2 py-1">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Checking tools…</span>
            </div>
          ) : tools ? (
            <ul className="space-y-1">
              <li>ffmpeg: {tools.ffmpeg ? "ready" : "missing"}</li>
              <li>ffprobe: {tools.ffprobe ? "ready" : "missing"}</li>
              <li>
                whisper ({tools.whisperModel || "unknown"}):{" "}
                {tools.whisperReady ? "ready" : "unavailable"}
              </li>
            </ul>
          ) : (
            <button type="button" className="underline" onClick={() => void refreshTools()}>
              Check tool status
            </button>
          )}
        </section>
      </div>
    </aside>
  );
}
