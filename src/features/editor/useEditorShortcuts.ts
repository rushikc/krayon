import { useEffect } from "react";

import {
  seekToNextEdge,
  seekToPreviousEdge,
  stepFrames,
} from "@/features/editor/playback/navigation";
import { transport } from "@/features/editor/playback/transport";
import { runSilenceRemovalForClip } from "@/features/silence-removal/SilenceRemovalButton";
import { useTimelineStore } from "@/stores/timeline-store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/** Editor-wide keyboard map. Mounted once by the main stage. */
export function useEditorShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const store = useTimelineStore.getState();
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) store.redo();
        else store.undo();
        return;
      }

      switch (event.key) {
        case " ":
          event.preventDefault();
          transport.toggle();
          return;
        case "ArrowLeft":
          event.preventDefault();
          stepFrames(event.shiftKey ? -10 : -1);
          return;
        case "ArrowRight":
          event.preventDefault();
          stepFrames(event.shiftKey ? 10 : 1);
          return;
        case "ArrowUp":
          event.preventDefault();
          seekToPreviousEdge();
          return;
        case "ArrowDown":
          event.preventDefault();
          seekToNextEdge();
          return;
        case "Home":
          event.preventDefault();
          transport.seek(0);
          return;
        case "End":
          event.preventDefault();
          transport.seek(transport.getDuration());
          return;
        case "Backspace":
        case "Delete":
          if (store.selectedIds.length === 0) return;
          event.preventDefault();
          store.deleteClips(store.selectedIds);
          return;
        case "Escape":
          store.clearSelection();
          return;
        case "+":
        case "=":
          event.preventDefault();
          store.zoomBy(1.25);
          return;
        case "-":
        case "_":
          event.preventDefault();
          store.zoomBy(1 / 1.25);
          return;
        default:
          break;
      }

      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "s") {
        event.preventDefault();
        const videoClipId = store.selectedIds.find((id) => {
          const clip = store.clips.find((candidate) => candidate.id === id);
          return clip?.trackId === "V1";
        });
        if (!videoClipId) return;
        const clip = store.clips.find((candidate) => candidate.id === videoClipId);
        if (!clip) return;
        const asset = store.assets[clip.assetId];
        if (!asset?.path) return;
        void runSilenceRemovalForClip(videoClipId, asset.path);
        return;
      }
      if (key === "s") {
        event.preventDefault();
        store.splitAt(transport.getTime(), store.selectedIds);
      } else if (key === "n") {
        event.preventDefault();
        store.toggleSnap();
      } else if (key === "l") {
        event.preventDefault();
        store.toggleLinkedSelection();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
