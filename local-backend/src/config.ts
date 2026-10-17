import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const flag = (value: string | undefined, fallback: boolean) => {
  const raw = (value ?? (fallback ? 'true' : 'false')).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
};

const envSchema = z.object({
  GOOGLE_GENAI_USE_VERTEXAI: z.string().optional(),
  GOOGLE_CLOUD_PROJECT: z.string().default('krayon-ai'),
  GOOGLE_CLOUD_LOCATION: z.string().default('global'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_REVIEW_MODEL: z.string().default('gemini-2.5-flash'),
  DATA_DIR: z.string().default('./data'),
  LOG_DIR: z.string().default('./logs'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PORT: z.coerce.number().default(8787),
  LOG_LEVEL: z.string().default('INFO'),
  LOG_BODY_MAX: z.coerce.number().default(2000),
  MAX_REPAIR_ROUNDS: z.coerce.number().default(2),
  MAX_REVIEW_ROUNDS: z.coerce.number().default(2),
  REVIEW_PASS_SCORE: z.coerce.number().default(8),
  TOPIC_CONCURRENCY: z.coerce.number().default(1),
  RENDER_KEYFRAMES_MAX: z.coerce.number().default(6),
  RENDER_TIMEOUT_MS: z.coerce.number().default(90_000),
});

const parsed = envSchema.parse(process.env);

export const rootDir = ROOT;

export const settings = {
  googleCloudProject: parsed.GOOGLE_CLOUD_PROJECT.trim(),
  googleCloudLocation: parsed.GOOGLE_CLOUD_LOCATION.trim(),
  useVertex: flag(parsed.GOOGLE_GENAI_USE_VERTEXAI, true),
  geminiApiKey: parsed.GEMINI_API_KEY.trim(),
  geminiModel: parsed.GEMINI_MODEL,
  geminiReviewModel: parsed.GEMINI_REVIEW_MODEL,
  dataDir: path.resolve(ROOT, parsed.DATA_DIR),
  logDir: path.resolve(ROOT, parsed.LOG_DIR),
  corsOrigins: parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean),
  port: parsed.PORT,
  logLevel: parsed.LOG_LEVEL.toUpperCase(),
  logBodyMax: parsed.LOG_BODY_MAX,
  maxRepairRounds: parsed.MAX_REPAIR_ROUNDS,
  maxReviewRounds: parsed.MAX_REVIEW_ROUNDS,
  reviewPassScore: parsed.REVIEW_PASS_SCORE,
  topicConcurrency: parsed.TOPIC_CONCURRENCY,
  renderKeyframesMax: parsed.RENDER_KEYFRAMES_MAX,
  renderTimeoutMs: parsed.RENDER_TIMEOUT_MS,
  maxUploadBytes: 20 * 1024 * 1024,
};

export type AiBackend = 'vertex' | 'gemini-api-key' | 'none';

export const aiBackend = (): AiBackend => {
  if (settings.useVertex && settings.googleCloudProject) return 'vertex';
  if (settings.geminiApiKey) return 'gemini-api-key';
  return 'none';
};
