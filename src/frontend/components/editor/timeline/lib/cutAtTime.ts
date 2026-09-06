import { MIN_SEGMENT_DURATION } from "@/components/editor/timeline/lib/timeMath";
import type { CanvasElement, ElementTime } from "@/types/canvas";

export function canCutElementAt(time: ElementTime, cutTime: number): boolean {
  return (
    cutTime > time.start &&
    cutTime < time.end &&
    cutTime - time.start >= MIN_SEGMENT_DURATION &&
    time.end - cutTime >= MIN_SEGMENT_DURATION
  );
}

export function cutElementsAtTime(
  elements: CanvasElement[],
  cutTime: number,
  createId: () => string = () => crypto.randomUUID(),
): { elements: CanvasElement[]; splitIds: string[] } {
  const next: CanvasElement[] = [];
  const splitIds: string[] = [];

  for (const element of elements) {
    if (!canCutElementAt(element.time, cutTime)) {
      next.push(element);
      continue;
    }

    next.push({
      ...element,
      time: { ...element.time, end: cutTime },
    });
    next.push({
      ...element,
      id: createId(),
      time: { ...element.time, start: cutTime },
    });
    splitIds.push(element.id);
  }

  return { elements: next, splitIds };
}
