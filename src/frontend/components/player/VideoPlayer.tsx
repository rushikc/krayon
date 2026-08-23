import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  clipStreamUrl,
  mediaProxyUrl,
  mediaStreamUrl,
} from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { seekVideo } from "@/lib/video-seek";
import { useMediaStore } from "@/stores/media-store";
import { usePlayerStore } from "@/stores/player-store";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const handledAutoPlayRef = useRef(0);

  const {
    files,
    selectedId,
    clips,
    selectedClipId,
    selectedEntry,
    activeClipVersionId,
    isLoading,
    isPickingFolder,
  } = useMediaStore();
  const {
    isPlaying,
    currentTime,
    duration,
    autoPlayToken,
    setPlaying,
    setCurrentTime,
    setDuration,
    reset,
  } = usePlayerStore();

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;
  const silenceRange =
    selectedEntry?.kind === "silence"
      ? { start: selectedEntry.start, end: selectedEntry.end }
      : null;

  const src = (() => {
    if (!selectedFile) return "";
    if (selectedClip) {
      const filename = selectedClip.path.split("/").pop() ?? "";
      return clipStreamUrl(selectedFile.id, filename, activeClipVersionId);
    }
    if (selectedFile.needsProxy) {
      return mediaProxyUrl(selectedFile.id);
    }
    return mediaStreamUrl(selectedFile.id);
  })();

  const tick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (silenceRange && Number.isFinite(video.currentTime)) {
      if (video.currentTime >= silenceRange.end - 0.02) {
        video.pause();
        setPlaying(false);
        seekVideo(video, silenceRange.end);
      }
      setCurrentTime(
        silenceRange
          ? Math.max(0, video.currentTime - silenceRange.start)
          : video.currentTime,
      );
    } else if (Number.isFinite(video.currentTime)) {
      setCurrentTime(video.currentTime);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [silenceRange, setCurrentTime, setPlaying]);

  useEffect(() => {
    reset();
    handledAutoPlayRef.current = 0;
  }, [selectedId, selectedClipId, selectedEntry, reset]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick]);

  const tryAutoPlay = useCallback(async (video: HTMLVideoElement) => {
    if (autoPlayToken <= handledAutoPlayRef.current) return;
    handledAutoPlayRef.current = autoPlayToken;

    if (silenceRange) {
      seekVideo(video, silenceRange.start);
      setCurrentTime(0);
    } else if (selectedClip) {
      seekVideo(video, 0);
    }

    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [autoPlayToken, selectedClip, silenceRange, setCurrentTime, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return;
    void tryAutoPlay(video);
  }, [autoPlayToken, tryAutoPlay]);

  const handleLoadedMetadata = async (video: HTMLVideoElement) => {
    if (selectedClip) {
      setDuration(video.duration);
      seekVideo(video, 0);
    } else if (silenceRange) {
      setDuration(silenceRange.end - silenceRange.start);
      seekVideo(video, silenceRange.start);
      setCurrentTime(0);
    } else {
      setDuration(video.duration);
    }

    await tryAutoPlay(video);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.readyState) return;

    if (selectedClip) {
      seekVideo(video, 0);
      return;
    }
    if (silenceRange) {
      seekVideo(video, silenceRange.start);
      setCurrentTime(0);
    }
  }, [selectedClip, silenceRange, setCurrentTime]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (silenceRange) {
        if (video.currentTime < silenceRange.start || video.currentTime >= silenceRange.end) {
          seekVideo(video, silenceRange.start);
        }
      }
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const onSeek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = silenceRange ? silenceRange.start + value : value;
    if (seekVideo(video, target)) {
      setCurrentTime(value);
    }
  };

  const clipDuration =
    selectedClip && Number.isFinite(duration) && duration > 0 ? duration : selectedClip?.duration;

  const displayDuration =
    clipDuration ?? (silenceRange ? silenceRange.end - silenceRange.start : duration);
  const displayCurrentTime = silenceRange
    ? Math.max(0, Math.min(currentTime, displayDuration))
    : currentTime;
  const waiting = isLoading || isPickingFolder;
  const scrubValue = Number.isFinite(displayCurrentTime)
    ? Math.min(displayCurrentTime, displayDuration || 0)
    : 0;

  const title = selectedClip
    ? selectedClip.text
    : silenceRange
      ? `Silence ${formatTime(silenceRange.start)}–${formatTime(silenceRange.end)}`
      : selectedFile?.name ?? "";

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {waiting ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm">
              {isPickingFolder ? "Waiting for folder selection…" : "Loading videos…"}
            </p>
          </div>
        ) : !selectedFile ? (
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium">No video selected</p>
            <p className="mt-1 text-sm">Open a folder and pick a video from the library.</p>
          </div>
        ) : (
          <div className="flex w-full max-w-3xl flex-col gap-3">
            <div className="overflow-hidden rounded-xl border border-border bg-black shadow-2xl">
              <video
                ref={videoRef}
                key={`${src}-${selectedEntry?.kind === "silence" ? `${selectedEntry.start}-${selectedEntry.end}` : selectedClipId ?? "source"}`}
                src={src}
                className="aspect-video w-full bg-black object-contain"
                onLoadedMetadata={(e) => void handleLoadedMetadata(e.currentTarget)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            </div>

            {title && (
              <div className="px-1">
                <p className="text-sm leading-relaxed text-foreground">{title}</p>
                {silenceRange && (
                  <p className="mt-1 text-xs text-red-300/80">Silence segment preview</p>
                )}
                {selectedClip && (
                  <p className="mt-1 text-xs text-primary">Clip preview</p>
                )}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur">
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <input
                    type="range"
                    min={0}
                    max={displayDuration || 0}
                    step={0.01}
                    value={scrubValue}
                    onChange={(e) => onSeek(Number(e.target.value))}
                    className={cn("h-1.5 w-full cursor-pointer accent-primary")}
                  />
                  <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
                    <span>{formatTime(displayCurrentTime)}</span>
                    <span>{formatTime(displayDuration)}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="icon-lg"
                  className="size-14 shrink-0 rounded-full"
                  onClick={() => void togglePlay()}
                >
                  {isPlaying ? <Pause className="size-7" /> : <Play className="size-7" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
