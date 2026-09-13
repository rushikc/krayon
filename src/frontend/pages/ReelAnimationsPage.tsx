import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Canvas } from "@/components/canvas/Canvas";
import { SchemaInspector } from "@/components/canvas/SchemaInspector";
import { EditorKeyboardShortcuts } from "@/components/editor/EditorKeyboardShortcuts";
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
} from "@/lib/export-reel";
import { useCanvasStore } from "@/stores/canvas-store";
import { toast } from "@/stores/toast-store";

const DEFAULT_INSPECTOR_WIDTH = 640;
const MIN_INSPECTOR_WIDTH = 240;
const MIN_MIDDLE_WIDTH = 180;
const MIN_TIMELINE_HEIGHT = TIMELINE_RULER_HEIGHT + TRACK_ROW_HEIGHT;

export function ReelAnimationsPage() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const canvasColRef = useRef<HTMLDivElement>(null);
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
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);

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

  const onInspectorResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = inspectorWidth;
      const workspace = workspaceRef.current?.clientWidth ?? 1200;
      const canvasWidth = canvasColRef.current?.clientWidth ?? 0;

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        const maxWidth = Math.max(
          MIN_INSPECTOR_WIDTH,
          workspace - canvasWidth - MIN_MIDDLE_WIDTH,
        );
        const next = startWidth + (startX - moveEvent.clientX);
        setInspectorWidth(clamp(next, MIN_INSPECTOR_WIDTH, maxWidth));
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
    [inspectorWidth],
  );

  const onExport = useCallback(async () => {
    if (exporting) {
      return;
    }

    const { flushSync } = await import("react-dom");
    const store = useCanvasStore.getState();
    store.pause();
    const restoreTime = store.currentTime;
    flushSync(() => {
      setExporting(true);
      setExportProgress(0);
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
      });
      toast("Exported krayon-reel.mp4");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Export failed");
    } finally {
      useCanvasStore.getState().setCurrentTime(restoreTime);
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting]);

  return (
    <AppShell
      showBack
      backTo="/"
      backLabel="Back to home"
      subtitle="reel animations"
    >
      <EditorKeyboardShortcuts />
      <div ref={workspaceRef} className="flex min-h-0 min-w-0 flex-1">
        <div
          ref={canvasColRef}
          className="flex h-full min-h-0 shrink-0 items-stretch p-2"
        >
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
            exportProgress={exportProgress}
            onExport={() => void onExport()}
          />

          <div className="flex min-h-0 min-w-0 flex-1">
            <div className="min-h-0 min-w-0 flex-1" />

            {showEditor ? (
              <div className="relative flex h-full min-h-0 shrink-0">
                <PanelResizeHandle
                  orientation="vertical"
                  label="Resize editor"
                  onPointerDown={onInspectorResizeStart}
                />
                <SchemaInspector width={inspectorWidth} />
              </div>
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
    </AppShell>
  );
}
