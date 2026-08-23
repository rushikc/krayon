import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { mediaProxyUrl, mediaStreamUrl } from "@/lib/api/client";
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

  const playbackRange = useMemo(() => {
    if (selectedEntry?.kind === "silence") {
      return { start: selectedEntry.start, end: selectedEntry.end };
    }
    if (selectedClip) {
      return { start: selectedClip.sourceStart, end: selectedClip.sourceEnd };
    }
    return null;
  }, [selectedEntry, selectedClip]);

  const isSilencePreview = selectedEntry?.kind === "silence";
  const isClipPreview = selectedClip !== null;

  const src = (() => {
    if (!selectedFile) return "";
    if (selectedFile.needsProxy) {
      return mediaProxyUrl(selectedFile.id);
    }
    return mediaStreamUrl(selectedFile.id);
  })();

  const rangeKey = playbackRange
    ? `${playbackRange.start}-${playbackRange.end}`
    : "source";

  const tick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (playbackRange && Number.isFinite(video.currentTime)) {
      if (video.currentTime >= playbackRange.end - 0.02) {
        video.pause();
        setPlaying(false);
        seekVideo(video, playbackRange.end);
      }
      setCurrentTime(Math.max(0, video.currentTime - playbackRange.start));
    } else if (Number.isFinite(video.currentTime)) {
      setCurrentTime(video.currentTime);
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [playbackRange, setCurrentTime, setPlaying]);

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

    if (playbackRange) {
      seekVideo(video, playbackRange.start);
      setCurrentTime(0);
    }

    try {
      await video.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [autoPlayToken, playbackRange, setCurrentTime, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 1) return;
    void tryAutoPlay(video);
  }, [autoPlayToken, tryAutoPlay]);

  const handleLoadedMetadata = async (video: HTMLVideoElement) => {
    if (playbackRange) {
      setDuration(playbackRange.end - playbackRange.start);
      seekVideo(video, playbackRange.start);
      setCurrentTime(0);
    } else {
      setDuration(video.duration);
    }

    await tryAutoPlay(video);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.readyState) return;

    if (playbackRange) {
      seekVideo(video, playbackRange.start);
      setCurrentTime(0);
    }
  }, [playbackRange, setCurrentTime]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (playbackRange) {
        if (
          video.currentTime < playbackRange.start ||
          video.currentTime >= playbackRange.end
        ) {
          seekVideo(video, playbackRange.start);
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
    const target = playbackRange ? playbackRange.start + value : value;
    if (seekVideo(video, target)) {
      setCurrentTime(value);
    }
  };

  const displayDuration = playbackRange
    ? playbackRange.end - playbackRange.start
    : duration;
  const displayCurrentTime = playbackRange
    ? Math.max(0, Math.min(currentTime, displayDuration))
    : currentTime;
  const waiting = isLoading || isPickingFolder;
  const scrubValue = Number.isFinite(displayCurrentTime)
    ? Math.min(displayCurrentTime, displayDuration || 0)
    : 0;

  const title = selectedClip
    ? selectedClip.text
    : isSilencePreview && playbackRange
      ? `Silence ${formatTime(playbackRange.start)}–${formatTime(playbackRange.end)}`
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
                key={`${src}-${rangeKey}`}
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
                {isSilencePreview && (
                  <p className="mt-1 text-xs text-red-300/80">Silence segment preview</p>
                )}
                {isClipPreview && (
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
