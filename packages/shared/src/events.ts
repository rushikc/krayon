import type { CourseState } from './course.js';
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
  round?: number;
  score?: number;
  pass?: boolean;
  roadmap?: Roadmap;
  detail?: string;
};

export type ClientMessage =
  | { type: 'subscribe'; courseId: string }
  | { type: 'regenerate'; topicId: string; segmentId: string; prompt?: string }
  | { type: 'cancel'; topicId?: string; segmentId?: string };

export type ServerMessage = { type: 'snapshot'; course: CourseState } | { type: 'event'; event: PipelineEvent };
