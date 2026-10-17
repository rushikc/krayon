/** Lesson and segment limits. Prompts, zod schemas, the scene validator, and the pipeline all read these. */

export const WPM = 140;
export const FPS = 30;

/** Spoken script per lesson: about 3 to 5 minutes at WPM. Prompts still ask for this range. */
export const LESSON_WORDS = { min: 420, max: 660 } as const;
/** A script inside this band is kept; only scripts outside it are retried. 399 to 693 words. */
export const LESSON_WORDS_TOLERANCE = 0.05;
export const LESSON_WORDS_ACCEPTED = {
  min: Math.floor(LESSON_WORDS.min * (1 - LESSON_WORDS_TOLERANCE)),
  max: Math.ceil(LESSON_WORDS.max * (1 + LESSON_WORDS_TOLERANCE)),
} as const;
export const LESSON_SECONDS = { min: 180, max: 300 } as const;

export const SEGMENT_SECONDS = { min: 6, max: 15 } as const;
export const SEGMENT_WORDS = { min: 15, max: 35 } as const;
export const SEGMENTS_PER_LESSON = { min: 15, max: 30 } as const;

/** Silence after each segment's narration. */
export const SEGMENT_PAUSE_SECONDS = 0.6;

export const SEGMENT_FRAMES = { min: SEGMENT_SECONDS.min * FPS, max: SEGMENT_SECONDS.max * FPS } as const;

export const RENDER_KEYFRAMES_MAX = 8;

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Frames for a narration of `words` words: speech at WPM plus the pause, clamped to SEGMENT_SECONDS. */
export const framesFor = (words: number) => {
  const frames = Math.ceil(((words / WPM) * 60 + SEGMENT_PAUSE_SECONDS) * FPS);
  return Math.min(SEGMENT_FRAMES.max, Math.max(SEGMENT_FRAMES.min, frames));
};

/** Seconds of speech (no pauses) for a script. */
export const speechSeconds = (words: number) => (words / WPM) * 60;

/** Path-qualified issue when a lesson script is outside the accepted band, or null. The message still asks for LESSON_WORDS. */
export const scriptWordIssue = (text: string, path = 'explanationSummary') => {
  const words = wordCount(text);
  if (words < LESSON_WORDS_ACCEPTED.min) {
    return { path, message: `Has ${words} words; write ${LESSON_WORDS.min} to ${LESSON_WORDS.max} words.` };
  }
  if (words > LESSON_WORDS_ACCEPTED.max) {
    return { path, message: `Has ${words} words; shorten it to ${LESSON_WORDS.min} to ${LESSON_WORDS.max} words.` };
  }
  return null;
};
