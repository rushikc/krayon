/** Lesson and segment targets. Prompts state these as aims. Code may clamp or trim, but never rejects or retries only because a value is outside the range. */

export const WPM = 140;
export const FPS = 30;

/** Spoken script per lesson: about 3 to 5 minutes at WPM. Prompts still ask for this range. */
export const LESSON_WORDS = { min: 420, max: 660 } as const;
export const LESSON_SECONDS = { min: 180, max: 300 } as const;

export const SEGMENT_SECONDS = { min: 6, max: 15 } as const;
export const SEGMENT_WORDS = { min: 15, max: 35 } as const;
export const SEGMENTS_PER_LESSON = { min: 15, max: 30 } as const;

/** Silence after each segment's narration. */
export const SEGMENT_PAUSE_SECONDS = 0.6;

/** `max` is the silent-video clamp. `sanityMax` is the longest a voiced segment may be. */
export const SEGMENT_FRAMES = {
  min: SEGMENT_SECONDS.min * FPS,
  max: SEGMENT_SECONDS.max * FPS,
  sanityMax: 60 * FPS,
} as const;

/** How many items a layout aims for. The model schema states the max; extra items are trimmed in code. */
export const LAYOUT_ITEMS = {
  bullets: { min: 1, max: 5 },
  flow: { min: 2, max: 6 },
  compare: { min: 1, max: 5 },
  spokes: { min: 3, max: 6 },
  curves: { min: 1, max: 4 },
  steps: { min: 2, max: 6 },
} as const;

export const RENDER_KEYFRAMES_MAX = 8;

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Frames for a narration of `words` words: speech at WPM plus the pause, clamped to 6–15 seconds.
 * Pre-TTS estimate, and the duration used when TTS is off (silent video).
 */
export const framesFor = (words: number) => {
  const frames = Math.ceil(((words / WPM) * 60 + SEGMENT_PAUSE_SECONDS) * FPS);
  return Math.min(SEGMENT_FRAMES.max, Math.max(SEGMENT_FRAMES.min, frames));
};

/**
 * Frames from a measured audio length plus the pause.
 * Clamped to [SEGMENT_FRAMES.min, sanityMax] so a bad clip cannot exceed the segment schema.
 */
export const framesForAudio = (seconds: number) => {
  const frames = Math.ceil((Math.max(0, seconds) + SEGMENT_PAUSE_SECONDS) * FPS);
  return Math.min(SEGMENT_FRAMES.sanityMax, Math.max(SEGMENT_FRAMES.min, frames));
};

/** True when `framesForAudio` had to cap a clip at sanityMax. */
export const audioClamped = (seconds: number) =>
  Math.ceil((Math.max(0, seconds) + SEGMENT_PAUSE_SECONDS) * FPS) > SEGMENT_FRAMES.sanityMax;

/** Seconds of speech (no pauses) for a script. */
export const speechSeconds = (words: number) => (words / WPM) * 60;
