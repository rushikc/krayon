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

/**
 * A render or review step failure: `blocked` (safety filter) fails the segment; `unreviewed` keeps the
 * last valid segment and marks it ready without a review.
 */
export const classifyStepFailure = (error: unknown): { status: 'blocked' | 'unreviewed'; message: string } => {
  const message = error instanceof Error ? error.message : String(error);
  if (geminiKindOf(error) === 'safety_blocked' || /safety filter|SAFETY/i.test(message)) {
    return { status: 'blocked', message: SAFETY_MESSAGE };
  }
  return { status: 'unreviewed', message: message.slice(0, 300) || 'Review did not finish.' };
};
