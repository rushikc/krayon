import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { transport } from "@/features/editor/playback/transport";
import { isTauri } from "@/lib/media/asset-url";
import {
  analyzeSilence,
  checkMediaTools,
  createJobId,
  formatRemovedDuration,
  listenSilenceProgress,
} from "@/lib/silence/api";
import { cn } from "@/lib/utils";
import { useSilenceStore } from "@/stores/silence-store";
import { useTimelineStore } from "@/stores/timeline-store";
import type { SilencePhase } from "@/types/silence";
import { VIDEO_TRACK_ID } from "@/types/timeline";

interface SilenceRemovalButtonProps {
  className?: string;
}

export function SilenceRemovalButton({ className }: SilenceRemovalButtonProps) {
  const [open, setOpen] = useState(false);
  const options = useSilenceStore((state) => state.options);
  const phase = useSilenceStore((state) => state.phase);
  const progress = useSilenceStore((state) => state.progress);
  const message = useSilenceStore((state) => state.message);
  const error = useSilenceStore((state) => state.error);
  const tools = useSilenceStore((state) => state.tools);
  const setOptions = useSilenceStore((state) => state.setOptions);
  const setMethod = useSilenceStore((state) => state.setMethod);
  const setJobState = useSilenceStore((state) => state.setJobState);
  const setLastResult = useSilenceStore((state) => state.setLastResult);
  const setTools = useSilenceStore((state) => state.setTools);
  const cacheWords = useSilenceStore((state) => state.cacheWords);
  const resetJob = useSilenceStore((state) => state.resetJob);

  const selectedIds = useTimelineStore((state) => state.selectedIds);
  const clips = useTimelineStore((state) => state.clips);
  const assets = useTimelineStore((state) => state.assets);
  const applySilenceSegments = useTimelineStore(
    (state) => state.applySilenceSegments,
  );

  const resolvedClipId = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const clip = clips.find((candidate) => candidate.id === selectedIds[0]);
    if (!clip || clip.trackId !== VIDEO_TRACK_ID) return null;
    return clip.id;
  }, [selectedIds, clips]);

  const resolvedPath = useMemo(() => {
    if (!resolvedClipId) return null;
    const clip = clips.find((candidate) => candidate.id === resolvedClipId);
    if (!clip) return null;
    return assets[clip.assetId]?.path ?? null;
  }, [resolvedClipId, clips, assets]);

  const isRunning = phase !== "idle" && phase !== "done" && phase !== "error";
  const canRun = Boolean(resolvedPath && resolvedClipId) && !isRunning && isTauri();

  useEffect(() => {
    if (!isTauri()) return;
    void checkMediaTools().then(setTools).catch(() => setTools(null));
  }, [setTools]);

  const runAnalysis = useCallback(
    async (overrideOptions = options) => {
      if (!resolvedPath || !resolvedClipId) return;

      const jobId = createJobId();
      setOpen(false);
      setJobState({
        activeJobId: jobId,
        phase: "probing",
        progress: 0,
        message: "Starting…",
        error: null,
      });

      const unlisten = await listenSilenceProgress((payload) => {
        if (payload.jobId !== jobId) return;
        setJobState({
          phase: payload.phase as SilencePhase,
          progress: payload.progress,
          message: payload.message,
        });
      });

      try {
        const result = await analyzeSilence(jobId, resolvedPath, overrideOptions);
        setLastResult(result);
        if (result.words.length > 0) {
          cacheWords(resolvedPath, result.words);
        }

        const addedIds = applySilenceSegments(resolvedClipId, result.segments);
        if (addedIds.length > 0) {
          const firstClip = useTimelineStore
            .getState()
            .clips.find((clip) => clip.id === addedIds[0]);
          if (firstClip) transport.seek(firstClip.start);
        }

        setJobState({
          phase: "done",
          progress: 1,
          message: `${result.segments.length} clips · ${formatRemovedDuration(result.removedSeconds)} removed`,
        });
      } catch (err) {
        setJobState({
          phase: "error",
          error: err instanceof Error ? err.message : "Silence removal failed",
        });
      } finally {
        await unlisten();
        window.setTimeout(resetJob, 4000);
      }
    },
    [
      resolvedPath,
      resolvedClipId,
      options,
      setJobState,
      setLastResult,
      cacheWords,
      applySilenceSegments,
      resetJob,
    ],
  );

  const accurateDisabled = tools !== null && !tools.whisperReady;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        title={
          canRun
            ? "Cut silences — fast mode (Shift+S)"
            : "Select one video clip on the timeline"
        }
        disabled={!canRun}
        onClick={() => void runAnalysis({ ...options, method: "fast" })}
      >
        {isRunning ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Scissors className="size-4" />
        )}
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              title="Silence removal options"
              disabled={!canRun}
            >
              <ChevronDown className="size-3.5" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 space-y-3 p-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">Remove silences</p>
            <p className="text-xs text-muted-foreground">
              Splits the clip into speech-only segments on the timeline.
            </p>
          </div>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Mode</span>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-sm"
              value={options.method}
              onChange={(event) =>
                setMethod(event.target.value as "fast" | "accurate")
              }
            >
              <option value="fast">Fast (FFmpeg silencedetect)</option>
              <option value="accurate" disabled={accurateDisabled}>
                Accurate (Whisper word gaps)
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">
              Gap threshold ({options.silenceThreshold.toFixed(2)}s)
            </span>
            <input
              type="range"
              min={0.15}
              max={1.5}
              step={0.05}
              value={options.silenceThreshold}
              onChange={(event) =>
                setOptions({ silenceThreshold: Number(event.target.value) })
              }
            />
          </label>

          {options.method === "fast" && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">
                Noise floor ({options.noiseFloorDb} dB)
              </span>
              <input
                type="range"
                min={-50}
                max={-20}
                step={1}
                value={options.noiseFloorDb}
                onChange={(event) =>
                  setOptions({ noiseFloorDb: Number(event.target.value) })
                }
              />
            </label>
          )}

          <Button className="w-full" disabled={!canRun} onClick={() => void runAnalysis()}>
            Remove silences
          </Button>
        </PopoverContent>
      </Popover>

      {(isRunning || message || error) && (
        <span
          className={cn(
            "max-w-48 truncate text-xs",
            error ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {error ??
            (isRunning
              ? `${message ?? phase} · ${Math.round(progress * 100)}%`
              : message)}
        </span>
      )}
    </div>
  );
}

export async function runSilenceRemovalForClip(clipId: string, path: string) {
  const { options, setJobState, setLastResult, cacheWords, resetJob } =
    useSilenceStore.getState();
  const { applySilenceSegments } = useTimelineStore.getState();

  const jobId = createJobId();
  setJobState({
    activeJobId: jobId,
    phase: "probing",
    progress: 0,
    message: "Starting…",
    error: null,
  });

  const unlisten = await listenSilenceProgress((payload) => {
    if (payload.jobId !== jobId) return;
    setJobState({
      phase: payload.phase as SilencePhase,
      progress: payload.progress,
      message: payload.message,
    });
  });

  try {
    const result = await analyzeSilence(jobId, path, options);
    setLastResult(result);
    if (result.words.length > 0) cacheWords(path, result.words);
    applySilenceSegments(clipId, result.segments);
    setJobState({
      phase: "done",
      progress: 1,
      message: `${result.segments.length} clips created`,
    });
  } catch (err) {
    setJobState({
      phase: "error",
      error: err instanceof Error ? err.message : "Silence removal failed",
    });
    throw err;
  } finally {
    await unlisten();
    window.setTimeout(resetJob, 4000);
  }
}
