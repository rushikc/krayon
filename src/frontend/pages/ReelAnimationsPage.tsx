import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Canvas } from "@/components/canvas/Canvas";
import { SchemaInspector } from "@/components/canvas/SchemaInspector";
import { EditorKeyboardShortcuts } from "@/components/editor/EditorKeyboardShortcuts";
import { ExportProgressDialog } from "@/components/editor/ExportProgressDialog";
import { PlaybackBar } from "@/components/editor/PlaybackBar";
import { Timeline } from "@/components/editor/timeline/Timeline";
import { WorkspaceToolbar } from "@/components/editor/WorkspaceToolbar";
import {
  clamp,
  DEFAULT_TIMELINE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  TRACK_ROW_HEIGHT,
} from "@/components/editor/timeline/lib/timeMath";
import { AppShell } from "@/components/layout/AppShell";
import { PanelResizeHandle } from "@/components/layout/PanelResizeHandle";
import { usePlaybackClock } from "@/hooks/usePlaybackClock";
import {
  exportReelMp4,
  sanitizeExportFilename,
} from "@/lib/export-reel";
import { useCanvasStore } from "@/stores/canvas-store";
import { toast } from "@/stores/toast-store";

const MIN_TIMELINE_HEIGHT = TIMELINE_RULER_HEIGHT + TRACK_ROW_HEIGHT;

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function ReelAnimationsPage() {
  const middleRef = useRef<HTMLDivElement>(null);
  const elements = useCanvasStore((state) => state.elements);
  const duration = useCanvasStore((state) => state.duration);
  const selectedId = useCanvasStore((state) => state.selectedId);
  const selectElement = useCanvasStore((state) => state.selectElement);
  const setElements = useCanvasStore((state) => state.setElements);
  const currentTime = useCanvasStore((state) => state.currentTime);
  const setCurrentTime = useCanvasStore((state) => state.setCurrentTime);
  const trackCount = useCanvasStore((state) => state.trackCount);
  const addTrack = useCanvasStore((state) => state.addTrack);
  const deleteTrack = useCanvasStore((state) => state.deleteTrack);
  const renderTheme = useCanvasStore((state) => state.renderTheme);
  const setRenderTheme = useCanvasStore((state) => state.setRenderTheme);

  usePlaybackClock();

  const [showTimeline, setShowTimeline] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [showReelPreview, setShowReelPreview] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStartedAt, setExportStartedAt] = useState<number | null>(null);
  const [projectName, setProjectName] = useState("krayon-reel");
  const exportAbortRef = useRef<AbortController | null>(null);

  const onTimelineResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = timelineHeight;
      const middle = middleRef.current?.clientHeight ?? 800;

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        const maxHeight = middle * 0.7;
        const next = startHeight + (startY - moveEvent.clientY);
        setTimelineHeight(clamp(next, MIN_TIMELINE_HEIGHT, maxHeight));
      }

      function onUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== event.pointerId) {
          return;
        }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        if (handle.hasPointerCapture(upEvent.pointerId)) {
          handle.releasePointerCapture(upEvent.pointerId);
        }
      }

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [timelineHeight],
  );

  const onExport = useCallback(async () => {
    if (exporting) {
      return;
    }

    const { flushSync } = await import("react-dom");
    const store = useCanvasStore.getState();
    store.pause();
    const restoreTime = store.currentTime;
    const filename = sanitizeExportFilename(projectName);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    flushSync(() => {
      setExporting(true);
      setExportProgress(0);
      setExportStartedAt(Date.now());
    });

    try {
      const captureElement = document.querySelector<HTMLElement>(
        "[data-render-theme]",
      );
      if (!captureElement) {
        throw new Error("Export canvas is not ready.");
      }
      await exportReelMp4({
        captureElement,
        duration: store.duration,
        setCurrentTime: useCanvasStore.getState().setCurrentTime,
        onProgress: setExportProgress,
        filename,
        signal: controller.signal,
      });
      toast(`Exported ${filename}`);
    } catch (error) {
      if (isAbortError(error)) {
        toast("Export cancelled");
      } else {
        toast(error instanceof Error ? error.message : "Export failed");
      }
    } finally {
      exportAbortRef.current = null;
      useCanvasStore.getState().setCurrentTime(restoreTime);
      setExporting(false);
      setExportProgress(0);
      setExportStartedAt(null);
    }
  }, [exporting, projectName]);

  return (
    <AppShell hideHeader>
      <EditorKeyboardShortcuts />
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex h-full min-h-0 shrink-0 items-stretch p-2">
          <Canvas
            showReelPreview={showReelPreview}
            exporting={exporting}
          />
        </div>

        <div
          ref={middleRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <WorkspaceToolbar
            showTimeline={showTimeline}
            showEditor={showEditor}
            showReelPreview={showReelPreview}
            onToggleTimeline={() => setShowTimeline((value) => !value)}
            onToggleEditor={() => setShowEditor((value) => !value)}
            onToggleReelPreview={() => setShowReelPreview((value) => !value)}
            renderTheme={renderTheme}
            onRenderThemeChange={setRenderTheme}
            exporting={exporting}
            onExport={() => void onExport()}
          />

          <div className="flex min-h-0 min-w-0 flex-1 p-2">
            {showEditor ? (
              <SchemaInspector
                projectName={projectName}
                onProjectNameChange={setProjectName}
              />
            ) : null}
          </div>

          <PlaybackBar />

          {showTimeline ? (
            <div className="flex w-full shrink-0 flex-col">
              <PanelResizeHandle
                orientation="horizontal"
                placement="bar"
                label="Resize timeline"
                onPointerDown={onTimelineResizeStart}
              />
              <div className="min-h-0 w-full" style={{ height: timelineHeight }}>
                <Timeline
                  elements={elements}
                  duration={duration}
                  currentTime={currentTime}
                  trackCount={trackCount}
                  selectedId={selectedId}
                  onSelect={selectElement}
                  onChange={setElements}
                  onSeek={setCurrentTime}
                  onAddTrack={addTrack}
                  onDeleteTrack={deleteTrack}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <ExportProgressDialog
        open={exporting}
        progress={exportProgress}
        startedAt={exportStartedAt}
        onCancel={() => exportAbortRef.current?.abort()}
      />
    </AppShell>
  );
}
