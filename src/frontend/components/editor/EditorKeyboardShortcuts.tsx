import { useEffect } from "react";

import { isEditableTarget } from "@/lib/canvas-keyboard";
import { useCanvasStore } from "@/stores/canvas-store";

function isUndoRedoShortcut(event: KeyboardEvent): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return false;
  }
  return event.code === "KeyZ";
}

function isTimelineFocused(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(target.closest("[data-timeline-root]"));
}

export function EditorKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) {
        return;
      }

      if (isUndoRedoShortcut(event)) {
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        if (event.shiftKey) {
          useCanvasStore.getState().redo();
        } else {
          useCanvasStore.getState().undo();
        }
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.code === "Space") {
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        useCanvasStore.getState().togglePlayback();
        return;
      }

      if (event.code === "KeyS") {
        if (!isTimelineFocused(event.target) || isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        useCanvasStore.getState().cutAtPlayhead();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
