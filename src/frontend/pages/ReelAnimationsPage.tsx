import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { Canvas } from "@/components/canvas/Canvas";
import { SchemaInspector } from "@/components/canvas/SchemaInspector";
import { EditorKeyboardShortcuts } from "@/components/editor/EditorKeyboardShortcuts";
import { PlaybackBar } from "@/components/editor/PlaybackBar";
import { Timeline } from "@/components/editor/timeline/Timeline";
import { Button } from "@/components/ui/button";
import {
  clamp,
  DEFAULT_TIMELINE_HEIGHT,
  TIMELINE_RULER_HEIGHT,
  TRACK_ROW_HEIGHT,
} from "@/components/editor/timeline/lib/timeMath";
import { AppShell } from "@/components/layout/AppShell";
import { PanelResizeHandle } from "@/components/layout/PanelResizeHandle";
import { usePlaybackClock } from "@/hooks/usePlaybackClock";
import { useCanvasStore } from "@/stores/canvas-store";

const DEFAULT_INSPECTOR_WIDTH = 640;
const MIN_INSPECTOR_WIDTH = 240;
const MIN_TIMELINE_HEIGHT = TIMELINE_RULER_HEIGHT + TRACK_ROW_HEIGHT;

export function ReelAnimationsPage() {
  const workspaceRef = useRef<HTMLDivElement>(null);
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

  usePlaybackClock();

  const [showTimeline, setShowTimeline] = useState(true);
  const [showEditor, setShowEditor] = useState(true);
  const [showReelPreview, setShowReelPreview] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState(DEFAULT_TIMELINE_HEIGHT);
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);

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
      const workspace = workspaceRef.current?.clientHeight ?? 800;

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        const maxHeight = workspace * 0.7;
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

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== event.pointerId) {
          return;
        }
        const maxWidth = workspace * 0.5;
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

  return (
    <AppShell
      showBack
      backTo="/"
      backLabel="Back to home"
      subtitle="reel animations"
    >
      <EditorKeyboardShortcuts />
      <div ref={workspaceRef} className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-visible p-4">
            <div className="flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
              <div className="relative">
                <Canvas showReelPreview={showReelPreview} />
                <div className="absolute top-0 left-full ml-2 flex flex-col gap-2">
                  <Button
                    type="button"
                    size="xs"
                    variant={showTimeline ? "default" : "outline"}
                    aria-pressed={showTimeline}
                    onClick={() => setShowTimeline((value) => !value)}
                  >
                    Timeline
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={showEditor ? "default" : "outline"}
                    aria-pressed={showEditor}
                    onClick={() => setShowEditor((value) => !value)}
                  >
                    Editor
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={showReelPreview ? "default" : "outline"}
                    aria-pressed={showReelPreview}
                    onClick={() => setShowReelPreview((value) => !value)}
                  >
                    Reel preview
                  </Button>
                </div>
              </div>
            </div>
            <PlaybackBar />
          </div>

          {showEditor ? (
            <div className="relative flex min-h-0 shrink-0">
              <PanelResizeHandle
                orientation="vertical"
                label="Resize editor"
                onPointerDown={onInspectorResizeStart}
              />
              <SchemaInspector width={inspectorWidth} />
            </div>
          ) : null}
        </div>

        {showTimeline ? (
          <div className="flex shrink-0 flex-col">
            <PanelResizeHandle
              orientation="horizontal"
              placement="bar"
              label="Resize timeline"
              onPointerDown={onTimelineResizeStart}
            />
            <div className="min-h-0" style={{ height: timelineHeight }}>
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
    </AppShell>
  );
}
