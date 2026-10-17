import type { DocStore, GeneratedSegment } from '@krayon/shared';
import { segmentPath } from './courses.js';
import { GeminiError } from './gemini.js';
import type { GeminiErrorKind } from './gemini.js';

const geminiKindOf = (error: unknown): GeminiErrorKind | null => {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current instanceof GeminiError) return current.kind;
    current = current.cause;
  }
  return null;
};

export const SAFETY_MESSAGE = 'The model safety filter blocked this segment.';

export const classifyStepFailure = (error: unknown): { status: 'blocked' | 'unreviewed'; message: string } => {
  const message = error instanceof Error ? error.message : String(error);
  if (geminiKindOf(error) === 'safety_blocked' || /safety filter|SAFETY/i.test(message)) {
    return { status: 'blocked', message: SAFETY_MESSAGE };
  }
  return { status: 'unreviewed', message: message.slice(0, 300) || 'Review did not finish.' };
};

/** Writes a playable segment that did not get a review, or a safety-blocked one. Never marks it ready. */
export const applyStepFailure = (
  docs: DocStore,
  uid: string,
  courseId: string,
  topicId: string,
  segmentId: string,
  segment: GeneratedSegment | null,
  error: unknown,
) => {
  const outcome = classifyStepFailure(error);
  docs.set(segmentPath(uid, courseId, topicId, segmentId), {
    status: outcome.status,
    statusDetail: null,
    error: outcome.message,
    reviewStatus: outcome.status === 'unreviewed' ? 'unreviewed' : null,
    segment,
  }, true);
  return outcome;
};

export const courseResult = (topics: Array<{ status: string; error?: string | null }>) => {
  const failed = topics.filter((topic) => topic.status === 'failed');
  if (topics.length > 0 && failed.length === topics.length) {
    const error = failed.map((topic) => topic.error).filter((item): item is string => Boolean(item)).join('; ') || 'Every topic failed';
    return { type: 'course.failed' as const, status: 'failed' as const, error, failedTopics: failed.length };
  }
  return { type: 'course.done' as const, status: 'done' as const, error: null, failedTopics: failed.length };
};
