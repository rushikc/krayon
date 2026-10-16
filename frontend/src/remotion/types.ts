import type { FC } from 'react';

/**
 * One splice of a lesson.
 * The model writes `component` and may change `durationInFrames`
 * without rewriting the neighboring segments.
 */
export type LessonSegment = {
  id: string;
  title: string;
  durationInFrames: number;
  component: FC;
};
