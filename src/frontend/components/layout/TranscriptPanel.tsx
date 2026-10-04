import { Copy, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatTakeTranscript } from "@/lib/transcript-preview";
import { cn } from "@/lib/utils";
import { useMediaStore } from "@/stores/media-store";
import { useSilenceStore } from "@/stores/silence-store";
import { toast } from "@/stores/toast-store";

export function TranscriptPanel() {
  const { clips, selectedClipId, selectSpeechClip } = useMediaStore();
  const { transcript, setTranscriptOpen } = useSilenceStore();
  const takePreview = useMemo(() => formatTakeTranscript(clips), [clips]);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const copyText = takePreview.copyText || transcript;
  const hasRows = takePreview.rows.length > 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedClipId, hasRows]);

  const copyTranscript = async () => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      toast("Transcript copied to clipboard");
    } catch {
      toast("Could not copy transcript");
    }
  };

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-background/60 backdrop-blur-2xl">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <h2 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Transcript
        </h2>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy transcript"
                  disabled={!copyText}
                  onClick={() => void copyTranscript()}
                />
              }
            >
              <Copy className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Copy transcript</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close transcript"
          onClick={() => setTranscriptOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      {hasRows ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-3">
            {takePreview.rows.map((row) => {
              const selected = row.id === selectedClipId;
              return (
                <button
                  key={row.id}
                  type="button"
                  ref={selected ? selectedRef : undefined}
                  className={cn(
                    "w-full rounded-md border px-2 py-1.5 text-left",
                    selected
                      ? "border-primary/20 bg-primary/15"
                      : "border-transparent hover:bg-muted/60",
                  )}
                  onClick={() => selectSpeechClip(row.id, false)}
                >
                  <p className="text-xs text-muted-foreground">{row.heading}</p>
                  {row.text ? (
                    <p className="text-sm leading-relaxed text-foreground">{row.text}</p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      ) : transcript ? (
        <ScrollArea className="min-h-0 flex-1">
          <p className="whitespace-pre-wrap p-4 text-sm leading-relaxed text-foreground">
            {transcript}
          </p>
        </ScrollArea>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">No transcript for this run</p>
      )}
    </aside>
  );
}
