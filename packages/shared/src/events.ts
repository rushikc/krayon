import type { ChapterState, CourseState, LessonSummary, SegmentState } from './course.js';
import type { GenerationErrorInfo } from './generation.js';

export const pipelineEventTypes = [
  'course.created',
  'structure.started',
  'structure.ready',
  'structure.failed',
  'chapter.writing',
  'chapter.ready',
  'chapter.failed',
  'lesson.outlined',
  'lesson.queued',
  'lesson.rendering',
  'lesson.ready',
  'lesson.failed',
  'segment.check',
  'segment.render',
  'segment.review',
  'segment.fixed',
  'segment.ready',
  'segment.failed',
  'course.ready',
] as const;

export type PipelineEventType = (typeof pipelineEventTypes)[number];

export type PipelineEvent = {
  type: PipelineEventType;
  courseId: string;
  chapterId?: string;
  lessonId?: string;
  segmentId?: string;
  seq: number;
  ts: string;
  /** Course title and category on structure.ready. */
  title?: string;
  category?: string;
  /** Every chapter on structure.ready. */
  chapters?: ChapterState[];
  /** The changed chapter (with its lessons) on chapter.*. */
  chapter?: ChapterState;
  /** The changed lesson on lesson.* and segment.*. */
  lesson?: LessonSummary;
  /** The changed segment on segment.*. */
  segment?: SegmentState;
  /** Ready and total segments on lesson.rendering. */
  ready?: number;
  total?: number;
  error?: string;
  /** Structured failure on *.failed. */
  errorInfo?: GenerationErrorInfo;
  round?: number;
  score?: number;
  pass?: boolean;
  /** Whether this review round accepted a fix. */
  fixed?: boolean;
  detail?: string;
};

export type ClientMessage =
  | { type: 'subscribe'; courseId: string }
  | { type: 'cancel'; lessonId?: string; segmentId?: string };

export type ServerMessage = { type: 'snapshot'; course: CourseState } | { type: 'event'; event: PipelineEvent };
