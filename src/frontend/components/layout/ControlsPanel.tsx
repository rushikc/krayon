import { Copy, Loader2, VolumeX, Wand2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  getToolsStatus,
  listenJobProgress,
  startClipsJob,
} from "@/lib/api/client";
import { formatElapsedHuman } from "@/lib/format";
import type { ClipsGenerateResponse } from "@/types/api";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";
import { toast } from "@/stores/toast-store";

export function ControlsPanel() {
  const {
    files,
    selectedId,
    setClips,
    loadEditorState,
    switchEditorVersion,
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
    similarityThreshold,
    analysisDurationSeconds,
    activeVersionId,
    versions,
    transcript,
    setOptions,
    setSimilarityThreshold,
    setJobState,
    setTools,
    setToolsLoading,
    setListMode,
    setPipelineFromEvent,
    setJobSummary,
    startPipeline,
  } = useSilenceStore();

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const busy = phase === "running";
  const hasClips = clipCount > 0;

  const copyTranscript = async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      toast("Transcript copied to clipboard");
    } catch {
      toast("Could not copy transcript");
    }
  };

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
      const { jobId } = await startClipsJob(
        selectedFile.path,
        options,
        similarityThreshold,
      );

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

            const startedAt = useSilenceStore.getState().jobStartedAt;
            const durationSec = startedAt
              ? (Date.now() - startedAt) / 1000
              : null;

            setJobSummary(result.clips.length, removed, durationSec);
            setPipelineFromEvent("extracting_audio", 1, 1, `Generated ${result.clips.length} clips`);
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

  const elapsedLabel = formatElapsedHuman(analysisDurationSeconds);

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
              <TooltipProvider>
              <div className="flex items-center gap-2 text-sm font-medium">
                <VolumeX className="size-4 text-primary" />
                Silence removal
              </div>
              <p className="text-xs text-muted-foreground">
                Transcribes speech, detects segments, and groups similar takes.
              </p>

              <label className="block space-y-1 text-xs">
                <FieldLabel
                  label="Silence threshold (s)"
                  help="Maximum gap between words (seconds) still treated as the same speech segment. Lower values remove more silence."
                />
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
                <FieldLabel
                  label="Pad (s)"
                  help="Extra time added before and after each word when building segments. Helps avoid cutting off syllables at edges."
                />
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

              <label className="block space-y-1 text-xs">
                <FieldLabel
                  label="Similarity threshold"
                  help="How similar two clip transcripts must be to group as the same take (0–1). Lower values merge more takes into one group."
                />
                <input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
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
                  <FieldLabel
                    label="Analysis run"
                    help="Switch between saved analysis runs for this video."
                  />
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
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={busy || !transcript}
                      />
                    }
                  >
                    View transcript
                  </PopoverTrigger>
                  <PopoverContent
                    side="left"
                    align="start"
                    className="w-[min(28rem,calc(100vw-2rem))] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <PopoverHeader className="min-w-0 flex-1">
                        <PopoverTitle>Full transcript</PopoverTitle>
                        <PopoverDescription>
                          From the active analysis run
                        </PopoverDescription>
                      </PopoverHeader>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Copy transcript"
                              disabled={!transcript}
                              onClick={() => void copyTranscript()}
                            />
                          }
                        >
                          <Copy className="size-4" />
                        </TooltipTrigger>
                        <TooltipContent>Copy transcript</TooltipContent>
                      </Tooltip>
                    </div>
                    {transcript ? (
                      <ScrollArea className="h-72 pr-2">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {transcript}
                        </p>
                      </ScrollArea>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No transcript for this run
                      </p>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {hasClips && (
                <p className="text-xs text-muted-foreground">
                  {elapsedLabel ? `in ${elapsedLabel} · ` : ""}
                  {clipCount} clips · removed {removedSeconds.toFixed(1)}s
                </p>
              )}
              </TooltipProvider>
            </section>
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
