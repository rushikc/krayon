import { createContext, useContext } from 'react';
import type { CourseState, LessonProgress, PipelineEvent } from '@krayon/shared';

export type StudySessionValue = {
  /** The open course, kept current from the course socket. */
  course: CourseState | null;
  courseId: string | null;
  /** Upload in progress (before the course exists). */
  starting: boolean;
  /** A request failed (not a pipeline failure; those live on the course, chapter, or lesson). */
  error: string | null;
  startFromFiles: (files: File[]) => Promise<void>;
  /** Opens a stored course and follows its live updates. No-op when that course is already open. */
  openCourse: (courseId: string) => Promise<void>;
  /** Drops the open course. No-op when `courseId` is set and a different course is open. */
  clearCourse: (courseId?: string) => void;
  /** Starts a lesson video ("Generate video"). */
  renderLesson: (lessonId: string) => Promise<void>;
  retryCourse: () => Promise<void>;
  retryChapter: (chapterId: string) => Promise<void>;
  retryLesson: (lessonId: string) => Promise<void>;
  /** Shows saved lesson progress on the roadmap (progress has no course event). */
  noteProgress: (lessonId: string, progress: LessonProgress) => void;
  /** Every course event, for pages that fold lesson detail. Returns an unsubscribe. */
  listen: (listener: (event: PipelineEvent) => void) => () => void;
};

export const StudySessionContext = createContext<StudySessionValue | null>(null);

export const useStudySession = () => {
  const session = useContext(StudySessionContext);
  if (!session) throw new Error('Study session is missing.');
  return session;
};
