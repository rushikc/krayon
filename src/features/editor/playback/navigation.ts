import { transport } from "@/features/editor/playback/transport";
import { snapToFrame } from "@/lib/timeline/geometry";
import { clipEdges } from "@/lib/timeline/ops";
import { useTimelineStore } from "@/stores/timeline-store";

/** Shared by the transport buttons and the keyboard shortcuts. */
export function stepFrames(count: number): void {
  const { fps } = useTimelineStore.getState();
  const frame = 1 / fps;
  transport.seek(snapToFrame(transport.getTime() + count * frame, fps));
}

export function seekToPreviousEdge(): void {
  const { clips } = useTimelineStore.getState();
  const time = transport.getTime();
  const previous = clipEdges(clips)
    .filter((edge) => edge < time - 1e-3)
    .pop();
  transport.seek(previous ?? 0);
}

export function seekToNextEdge(): void {
  const { clips } = useTimelineStore.getState();
  const time = transport.getTime();
  const next = clipEdges(clips).find((edge) => edge > time + 1e-3);
  transport.seek(next ?? transport.getDuration());
}
