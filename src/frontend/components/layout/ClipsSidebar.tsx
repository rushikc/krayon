import { ChevronDown, ChevronRight, Play, Scissors } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TruncatedText } from "@/components/ui/truncated-text";
import { formatDuration } from "@/lib/format";
import { buildTimeline, isTimelineEntrySelected } from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";
import type { ClipGroup, ClipItem } from "@/types/api";

function PlayButton({
  onClick,
}: {
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="shrink-0 text-muted-foreground hover:text-primary"
      onClick={onClick}
      aria-label="Play"
    >
      <Play className="size-3.5" />
    </Button>
  );
}

function SpeechClipRow({
  clip,
  selected,
  onPreview,
  onPlay,
}: {
  clip: ClipItem;
  selected: boolean;
  onPreview: () => void;
  onPlay: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-1 rounded-md px-2 py-1.5 text-left text-xs",
        selected ? "bg-primary/15 text-primary" : "hover:bg-muted/60",
      )}
    >
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onPreview}>
        <span className="font-medium">Take {clip.index + 1}</span>
        <TruncatedText text={clip.text} className="text-muted-foreground" />
        <span className="text-muted-foreground">{formatDuration(clip.duration)}</span>
      </button>
      <PlayButton onClick={(e) => { e.stopPropagation(); onPlay(); }} />
    </div>
  );
}

function ClipGroups({
  groups,
  clips,
  selectedClipId,
  onPreviewClip,
  onPlayClip,
}: {
  groups: ClipGroup[];
  clips: ClipItem[];
  selectedClipId: string | null;
  onPreviewClip: (clipId: string) => void;
  onPlayClip: (clipId: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const clipsById = useMemo(() => {
    const map = new Map<string, ClipItem>();
    for (const clip of clips) map.set(clip.id, clip);
    return map;
  }, [clips]);

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = expanded[group.id] ?? true;
        const groupClips = group.clipIds
          .map((id) => clipsById.get(id))
          .filter(Boolean) as ClipItem[];

        return (
          <div key={group.id} className="rounded-lg border border-border/60 bg-background/40">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
              onClick={() => setExpanded((s) => ({ ...s, [group.id]: !isOpen }))}
            >
              {isOpen ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <TruncatedText text={group.label} className="min-w-0 flex-1" />
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{groupClips.length}</span>
            </button>
            {isOpen && (
              <div className="space-y-1 border-t border-border/60 p-2">
                {groupClips.map((clip) => (
                  <SpeechClipRow
                    key={clip.id}
                    clip={clip}
                    selected={selectedClipId === clip.id}
                    onPreview={() => onPreviewClip(clip.id)}
                    onPlay={() => onPlayClip(clip.id)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineList({
  entries,
  selectedEntry,
  onPreviewSpeech,
  onPlaySpeech,
  onPreviewSilence,
  onPlaySilence,
}: {
  entries: ReturnType<typeof buildTimeline>;
  selectedEntry: ReturnType<typeof useMediaStore.getState>["selectedEntry"];
  onPreviewSpeech: (clipId: string) => void;
  onPlaySpeech: (clipId: string) => void;
  onPreviewSilence: (start: number, end: number) => void;
  onPlaySilence: (start: number, end: number) => void;
}) {
  return (
    <div className="space-y-1">
      {entries.map((entry, i) => {
        const selected = isTimelineEntrySelected(entry, selectedEntry);
        const isSilence = entry.kind === "silence";

        return (
          <div
            key={`${entry.kind}-${entry.start}-${i}`}
            className={cn(
              "flex items-start gap-1 rounded-md border px-2 py-1.5 text-xs",
              isSilence
                ? selected
                  ? "border-red-500/30 bg-red-500/15 text-red-100"
                  : "border-red-500/15 bg-red-500/10 text-red-200/80 hover:bg-red-500/15"
                : selected
                  ? "border-primary/20 bg-primary/15 text-primary"
                  : "border-transparent hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                if (entry.kind === "speech") {
                  onPreviewSpeech(entry.clip.id);
                } else {
                  onPreviewSilence(entry.start, entry.end);
                }
              }}
            >
              {entry.kind === "speech" ? (
                <>
                  <span className="font-medium">Take {entry.clip.index + 1}</span>
                  <TruncatedText text={entry.clip.text} className="text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {formatDuration(entry.start)} · {formatDuration(entry.end - entry.start)}
                  </span>
                </>
              ) : (
                <>
                  <TruncatedText text={entry.label} />
                  <span className="opacity-80">{formatDuration(entry.end - entry.start)}</span>
                </>
              )}
            </button>
            <PlayButton
              onClick={(e) => {
                e.stopPropagation();
                if (entry.kind === "speech") {
                  onPlaySpeech(entry.clip.id);
                } else {
                  onPlaySilence(entry.start, entry.end);
                }
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function ClipsSidebar() {
  const {
    files,
    selectedId,
    clips,
    clipGroups,
    selectedClipId,
    selectedEntry,
    selectSpeechClip,
    selectSilenceRange,
  } = useMediaStore();
  const { listMode } = useSilenceStore();

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

  const timeline = useMemo(
    () => buildTimeline(selectedFile?.duration, clips),
    [selectedFile?.duration, clips],
  );

  if (clips.length === 0) return null;

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background/60 backdrop-blur-2xl">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Scissors className="size-3.5" />
          {listMode === "all" ? "All segments" : "Clips"}
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {listMode === "speech" ? (
            <ClipGroups
              groups={clipGroups}
              clips={clips}
              selectedClipId={selectedClipId}
              onPreviewClip={(id) => selectSpeechClip(id, false)}
              onPlayClip={(id) => selectSpeechClip(id, true)}
            />
          ) : (
            <TimelineList
              entries={timeline}
              selectedEntry={selectedEntry}
              onPreviewSpeech={(id) => selectSpeechClip(id, false)}
              onPlaySpeech={(id) => selectSpeechClip(id, true)}
              onPreviewSilence={(start, end) => selectSilenceRange(start, end, false)}
              onPlaySilence={(start, end) => selectSilenceRange(start, end, true)}
            />
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
