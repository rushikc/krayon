import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { clipAudioUrl } from "@/lib/api/client";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import { usePlayerStore } from "@/stores/player-store";
import { useSilenceStore } from "@/stores/silence-store";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const handledAutoPlayRef = useRef(0);

  const { selectedId, clips, selectedClipId, selectedEntry } = useMediaStore();
  const { clipCount, phase } = useSilenceStore();
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

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;
  const hasClips = clipCount > 0 || clips.length > 0;
  const isSilenceSelected = selectedEntry?.kind === "silence";

  const src =
    selectedId && selectedClip && !isSilenceSelected
      ? clipAudioUrl(selectedId, selectedClip.id)
      : "";

  useEffect(() => {
    reset();
    handledAutoPlayRef.current = 0;
  }, [selectedId, selectedClipId, reset]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (!audio) return;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [selectedId]);

  const tryAutoPlay = useCallback(async (audio: HTMLAudioElement) => {
    if (autoPlayToken <= handledAutoPlayRef.current) return;
    handledAutoPlayRef.current = autoPlayToken;
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [autoPlayToken, setPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || audio.readyState < 1) return;
    void tryAutoPlay(audio);
  }, [autoPlayToken, src, tryAutoPlay]);

  const handleLoadedMetadata = async (audio: HTMLAudioElement) => {
    setDuration(selectedClip?.duration ?? audio.duration);
    setCurrentTime(0);
    await tryAutoPlay(audio);
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  if (!hasClips && phase === "idle") {
    return (
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8">
        <div className="max-w-md space-y-2 text-center text-muted-foreground">
          <Volume2 className="mx-auto size-10 opacity-60" />
          <p className="text-lg font-medium text-foreground">Ready to analyze</p>
          <p className="text-sm">
            Run Analyze silence in the controls panel to transcribe speech and generate audio clips.
          </p>
        </div>
      </main>
    );
  }

  if (!selectedClip && !isSilenceSelected) {
    return (
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8">
        <p className="text-sm text-muted-foreground">Select a clip from the sidebar to preview audio.</p>
      </main>
    );
  }

  if (isSilenceSelected && selectedEntry?.kind === "silence") {
    return (
      <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background p-8">
        <div className="max-w-md space-y-2 text-center">
          <p className="text-lg font-medium">Silence segment</p>
          <p className="text-sm text-muted-foreground">
            {formatTime(selectedEntry.start)} – {formatTime(selectedEntry.end)}
            {" · "}
            {formatDuration(selectedEntry.end - selectedEntry.start)}
          </p>
          <p className="text-xs text-muted-foreground">Audio preview is not available for silence gaps.</p>
        </div>
      </main>
    );
  }

  const displayDuration = selectedClip?.duration ?? duration;
  const scrubValue = Number.isFinite(currentTime)
    ? Math.min(currentTime, displayDuration || 0)
    : 0;

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-3xl flex-col gap-4">
          <div className="rounded-xl border border-border bg-card/50 p-8">
            <div className="mb-4 flex items-center gap-3">
              <Volume2 className="size-8 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Take {(selectedClip?.index ?? 0) + 1}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedClip?.text}</p>
              </div>
            </div>
            {src ? (
              <audio
                ref={audioRef}
                key={src}
                src={src}
                className="hidden"
                onLoadedMetadata={(e) => void handleLoadedMetadata(e.currentTarget)}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading clip audio…
              </div>
            )}
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
                  disabled={!src}
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
                disabled={!src}
                onClick={() => void togglePlay()}
              >
                {isPlaying ? <Pause className="size-7" /> : <Play className="size-7" />}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
