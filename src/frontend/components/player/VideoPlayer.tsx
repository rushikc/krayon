import { Loader2, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { mediaStreamUrl } from "@/lib/api/client";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import { usePlayerStore } from "@/stores/player-store";
import { LIBRARY_PREVIEW_DURATION_SECONDS } from "@/types/api";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);

  const { files, selectedId, isLoading, isPickingFolder } = useMediaStore();
  const {
    isPlaying,
    currentTime,
    setPlaying,
    setCurrentTime,
    setDuration,
    reset,
  } = usePlayerStore();

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;
  const sourceDuration = selectedFile?.duration ?? null;
  const src = selectedFile ? mediaStreamUrl(selectedFile.id) : "";

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      if (!video) return;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [selectedId]);

  useEffect(() => {
    reset();
  }, [selectedId, reset]);

  const tick = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Number.isFinite(video.currentTime)) {
      const time = Math.min(video.currentTime, LIBRARY_PREVIEW_DURATION_SECONDS);
      setCurrentTime(time);
      if (video.currentTime >= LIBRARY_PREVIEW_DURATION_SECONDS - 0.02) {
        video.pause();
        setPlaying(false);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [setCurrentTime, setPlaying]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, tick]);

  const handleLoadedMetadata = () => {
    setDuration(LIBRARY_PREVIEW_DURATION_SECONDS);
    setCurrentTime(0);
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (video.currentTime >= LIBRARY_PREVIEW_DURATION_SECONDS) {
        video.currentTime = 0;
        setCurrentTime(0);
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
    video.currentTime = value;
    setCurrentTime(value);
  };

  const waiting = isLoading || isPickingFolder;
  const displayDuration = LIBRARY_PREVIEW_DURATION_SECONDS;
  const scrubValue = Number.isFinite(currentTime)
    ? Math.min(currentTime, displayDuration)
    : 0;

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
                key={`${selectedId}-${src}`}
                src={src}
                className="aspect-video w-full bg-black object-contain"
                onLoadedMetadata={() => handleLoadedMetadata()}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            </div>

            <div className="px-1">
              <p className="text-sm leading-relaxed text-foreground">{selectedFile.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Showing first {LIBRARY_PREVIEW_DURATION_SECONDS}s
                {sourceDuration != null && sourceDuration > LIBRARY_PREVIEW_DURATION_SECONDS
                  ? ` · full duration ${formatDuration(sourceDuration)}`
                  : ""}
              </p>
            </div>

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
                    <span>{formatTime(currentTime)}</span>
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
