import type { CourseState } from './course.js';
import type { GenerationErrorInfo } from './generation.js';
import type { GeneratedLesson, Roadmap } from './scene.js';

export const pipelineEventTypes = [
  'course.created',
  'roadmap.started',
  'roadmap.ready',
  'topic.queued',
  'topic.started',
  'lesson.drafted',
  'segment.check',
  'segment.render',
  'segment.review',
  'segment.fixed',
  'segment.ready',
  'topic.ready',
  'topic.failed',
  'segment.failed',
  'course.failed',
  'course.done',
] as const;

export type PipelineEventType = (typeof pipelineEventTypes)[number];

export type PipelineEvent = {
  type: PipelineEventType;
  courseId: string;
  topicId?: string;
  segmentId?: string;
  seq: number;
  ts: string;
  lesson?: GeneratedLesson;
  error?: string;
  /** Structured failure on segment.failed / topic.failed / course.failed. */
  errorInfo?: GenerationErrorInfo;
  round?: number;
  score?: number;
  pass?: boolean;
  /** Whether this review round accepted a fix. */
  fixed?: boolean;
  /** Topics that failed when the course finishes with course.done. */
  failedTopics?: number;
  roadmap?: Roadmap;
  detail?: string;
};

export type ClientMessage =
  | { type: 'subscribe'; courseId: string }
  | { type: 'regenerate'; topicId: string; segmentId: string; prompt?: string }
  | { type: 'cancel'; topicId?: string; segmentId?: string };

export type ServerMessage = { type: 'snapshot'; course: CourseState } | { type: 'event'; event: PipelineEvent };
