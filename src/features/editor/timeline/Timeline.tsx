import { useEffect, useRef } from "react";

import {
  transport,
  useTransportDuration,
} from "@/features/editor/playback/transport";
import {
  HEADER_WIDTH,
  RULER_HEIGHT,
} from "@/features/editor/timeline/constants";
import { Playhead } from "@/features/editor/timeline/Playhead";
import { TimelineRuler } from "@/features/editor/timeline/TimelineRuler";
import { TimelineToolbar } from "@/features/editor/timeline/TimelineToolbar";
import { TrackHeader } from "@/features/editor/timeline/TrackHeader";
import { TrackLane } from "@/features/editor/timeline/TrackLane";
import {
  clampZoom,
  pxToTime,
  TIMELINE_TAIL_SECONDS,
  timeToPx,
} from "@/lib/timeline/geometry";
import { clipsOnTrack } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";

export function Timeline() {
  const tracks = useTimelineStore((state) => state.tracks);
  const clips = useTimelineStore((state) => state.clips);
  const selectedIds = useTimelineStore((state) => state.selectedIds);
  const pixelsPerSecond = useTimelineStore((state) => state.pixelsPerSecond);
  const fps = useTimelineStore((state) => state.fps);
  const duration = useTransportDuration();

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const contentWidth = timeToPx(duration + TIMELINE_TAIL_SECONDS, pixelsPerSecond);

  // Cmd/Ctrl + wheel zooms around the cursor; a plain wheel keeps scrolling.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();

      const store = useTimelineStore.getState();
      const rect = scroller.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const anchorTime = pxToTime(
        scroller.scrollLeft + cursorX,
        store.pixelsPerSecond,
      );
      const next = clampZoom(store.pixelsPerSecond * Math.exp(-event.deltaY * 0.002));
      store.setZoom(next);

      requestAnimationFrame(() => {
        scroller.scrollLeft = Math.max(0, timeToPx(anchorTime, next) - cursorX);
      });
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the playhead on screen during playback.
  useEffect(() => {
    return transport.subscribeTime((time) => {
      const scroller = scrollRef.current;
      if (!scroller || !transport.isPlaying()) return;
      const x = timeToPx(time, pixelsPerSecond);
      const left = scroller.scrollLeft;
      const right = left + scroller.clientWidth;
      if (x < left || x > right - 40) {
        scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.4);
      }
    });
  }, [pixelsPerSecond]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-border bg-card">
      <TimelineToolbar />

      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <div
          className="shrink-0 border-r border-border bg-card"
          style={{ width: HEADER_WIDTH }}
        >
          <div
            className="border-b border-border bg-card"
            style={{ height: RULER_HEIGHT }}
          />
          {tracks.map((track) => (
            <TrackHeader key={track.id} track={track} />
          ))}
        </div>

        <div
          ref={scrollRef}
          className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        >
          <div
            ref={contentRef}
            className="relative"
            style={{ width: contentWidth, minWidth: "100%" }}
          >
            <TimelineRuler
              duration={duration + TIMELINE_TAIL_SECONDS}
              pixelsPerSecond={pixelsPerSecond}
              fps={fps}
              contentRef={contentRef}
            />

            {tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                clips={clipsOnTrack(clips, track.id)}
                selectedIds={selectedIds}
                pixelsPerSecond={pixelsPerSecond}
              />
            ))}

            <Playhead
              pixelsPerSecond={pixelsPerSecond}
              fps={fps}
              contentRef={contentRef}
            />
          </div>

          {clips.length === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-xs text-muted-foreground">
              Timeline is empty — click a clip in the library to add it
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
