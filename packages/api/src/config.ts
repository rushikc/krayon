import { z } from 'zod';

/** Gemini, TTS, thinking is read elsewhere, and the concurrency limits. Both backends parse this. */
export const pipelineEnvSchema = z.object({
  GOOGLE_GENAI_USE_VERTEXAI: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().default('krayon-ai'),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_REVIEW_MODEL: z.string().default('gemini-2.5-flash'),
  MAX_REPAIR_ROUNDS: z.coerce.number().default(2),
  MAX_REVIEW_ROUNDS: z.coerce.number().default(2),
  REVIEW_PASS_SCORE: z.coerce.number().default(8),
  CHAPTER_CONCURRENCY: z.coerce.number().default(3),
  GEMINI_MAX_CONCURRENCY: z.coerce.number().default(5),
  RENDER_CONCURRENCY: z.coerce.number().default(2),
  SEGMENT_RETRIES: z.coerce.number().default(2),
  RENDER_KEYFRAMES_MAX: z.coerce.number().default(8),
  RENDER_TIMEOUT_MS: z.coerce.number().default(90_000),
  TTS_ENABLED: z.string().optional(),
  TTS_VOICE: z.string().default('en-US-Chirp3-HD-Charon'),
  TTS_RATE: z.coerce.number().default(1),
  TTS_CONCURRENCY: z.coerce.number().default(4),
  TTS_QUOTA_PROJECT: z.string().default('krayon-ai'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  CAP_UPLOADS_PER_VISITOR_DAY: z.coerce.number().default(0),
  CAP_COURSES_GLOBAL_DAY: z.coerce.number().default(0),
  CAP_LESSON_RENDERS_GLOBAL_DAY: z.coerce.number().default(0),
  CAP_REGENERATES_GLOBAL_DAY: z.coerce.number().default(0),
  CAP_ASK_GLOBAL_DAY: z.coerce.number().default(0),
  TASK_MAX_ATTEMPTS: z.coerce.number().default(3),
  STALE_MINUTES: z.coerce.number().default(15),
});

export type PipelineEnv = z.infer<typeof pipelineEnvSchema>;
