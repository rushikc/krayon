import type { CourseState, LessonSummary } from '@krayon/shared';
import { courseLessons } from '@krayon/shared';
import { formatClock } from './time.ts';

/** Completed, Watched, or "Resume at m:ss" from saved progress; null when not started. */
export const progressLabel = (lesson: LessonSummary) => {
  const progress = lesson.progress;
  if (!progress) return null;
  if (progress.completed) return 'Completed';
  if (progress.watched) return 'Watched';
  if (progress.positionFrame > 0) return `Resume at ${formatClock(progress.positionFrame)}`;
  return null;
};

const finished = (lesson: LessonSummary) => lesson.progress?.completed || lesson.progress?.watched;

/** The lesson to watch next: the first in play order that is not watched yet. */
export const nextLesson = (course: CourseState) => courseLessons(course).find((lesson) => !finished(lesson)) ?? null;

/** Ready segments over total while a lesson renders, 0..100. */
export const renderPercent = (lesson: LessonSummary) =>
  lesson.segmentCount > 0 ? Math.round((lesson.segmentsReady / lesson.segmentCount) * 100) : 0;

/** About how long a lesson runs, from its rendered length or (before rendering) its script. */
export const lessonLength = (lesson: LessonSummary) =>
  lesson.durationFrames > 0 ? formatClock(lesson.durationFrames) : lesson.wordCount > 0 ? `~${Math.max(1, Math.round(lesson.wordCount / 140))} min` : '';
