import { GoogleGenAI } from '@google/genai';

const ALLOWED = new Set([
  'type',
  'properties',
  'items',
  'required',
  'description',
  'enum',
  'nullable',
  'format',
  'propertyOrdering',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'anyOf',
]);

export class GeminiNotConfigured extends Error {}

export type GeminiFile = { data: Uint8Array; mimeType: string };

export type GeminiConfig = {
  useVertex: boolean;
  project: string;
  location: string;
  apiKey: string;
  model: string;
};

export type PipelineLogger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>, error?: unknown) => void;
  debug: (message: string, fields?: Record<string, unknown>) => void;
};

export const normalizeSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) return schema.map((item) => normalizeSchema(item));
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!ALLOWED.has(key)) continue;
    if (key === 'type' && typeof value === 'string') out[key] = value.toUpperCase();
    else if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(value as Record<string, unknown>)) props[name] = normalizeSchema(child);
      out[key] = props;
    } else if (key === 'items') out[key] = normalizeSchema(value);
    else if (key === 'anyOf' && Array.isArray(value)) out[key] = value.map((item) => normalizeSchema(item));
    else out[key] = value;
  }
  return out;
};

export const MAX_OUTPUT_TOKENS = 8192;
export const FLASH_THINKING_BUDGET = 1024;
export const GENERATE_TIMEOUT_MS = 90_000;

export type GeminiErrorKind = 'rate_limited' | 'safety_blocked' | 'token_limit' | 'invalid_request' | 'timeout' | 'unknown';

export class GeminiError extends Error {
  readonly kind: GeminiErrorKind;

  constructor(kind: GeminiErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GeminiError';
    this.kind = kind;
  }
}

const errorStatus = (error: unknown) => {
  const record = error as { status?: number; code?: number; response?: { status?: number } };
  return record.status ?? record.code ?? record.response?.status;
};

const errorText = (error: unknown) => (error instanceof Error ? `${error.name} ${error.message}` : String(error));

export const classifyGeminiFailure = (error: unknown): GeminiErrorKind => {
  if (error instanceof GeminiError) return error.kind;
  const status = errorStatus(error);
  const text = errorText(error);
  if (/MAX_TOKENS/i.test(text)) return 'token_limit';
  if (/SAFETY|PROHIBITED_CONTENT|BLOCKLIST|blocked due to safety/i.test(text)) return 'safety_blocked';
  if (status === 400 || /INVALID_ARGUMENT|invalid argument/i.test(text)) return 'invalid_request';
  if (status === 429 || status === 503 || /RESOURCE_EXHAUSTED|UNAVAILABLE/i.test(text)) return 'rate_limited';
  if (error instanceof Error && (error.name === 'AbortError' || /aborted|timed? ?out|DEADLINE_EXCEEDED/i.test(text))) return 'timeout';
  return 'unknown';
};

/** 429, RESOURCE_EXHAUSTED, and 503 only. Safety blocks and invalid requests are not retried. */
export const isRetryableGenerateError = (error: unknown) => classifyGeminiFailure(error) === 'rate_limited';

const headerValue = (error: unknown, name: string) => {
  const headers = (error as { headers?: { get?: (key: string) => string | undefined } }).headers
    ?? (error as { response?: { headers?: { get?: (key: string) => string | undefined } | Record<string, string> } }).response?.headers;
  if (!headers) return undefined;
  if (typeof (headers as { get?: unknown }).get === 'function') return (headers as { get: (key: string) => string | undefined }).get(name);
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
};

export const retryAfterMs = (error: unknown) => {
  const raw = headerValue(error, 'retry-after');
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, when - Date.now());
};

const BACKOFF_MS = [2_000, 4_000, 8_000];

/** About 2s, 4s, 8s with ±25% jitter. A Retry-After header wins when it is present. */
export const backoffMs = (attempt: number, random: () => number = Math.random, retryAfter?: number) => {
  if (retryAfter != null) return retryAfter;
  const base = BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)] ?? 8_000;
  return Math.round(base * (1 + (random() * 0.5 - 0.25)));
};

const geminiLimit = () => {
  const raw = Number(process.env.GEMINI_MAX_CONCURRENCY);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 4;
};

let geminiActive = 0;
const geminiWaiters: Array<() => void> = [];

export const geminiInFlight = () => geminiActive;

/** Process-wide cap on Gemini calls. The slot is held only while the request is in flight. */
export const withGeminiSlot = async <T>(run: () => Promise<T>): Promise<T> => {
  if (geminiActive >= geminiLimit()) await new Promise<void>((resolve) => geminiWaiters.push(resolve));
  geminiActive += 1;
  try {
    return await run();
  } finally {
    geminiActive -= 1;
    geminiWaiters.shift()?.();
  }
};

export type GeminiOutcome = {
  finishReason?: string;
  usage?: { prompt?: number; output?: number; total?: number };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One Gemini call with the shared limiter. Retries 429 / RESOURCE_EXHAUSTED / 503 up to 3 times.
 * MAX_TOKENS fails immediately so the same prompt is not sent again.
 */
export const runGeminiCall = async <T>(options: {
  model: string;
  log: PipelineLogger;
  call: () => Promise<T>;
  outcome: (value: T) => GeminiOutcome;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}): Promise<T> => {
  const wait = options.sleep ?? sleep;
  const random = options.random ?? Math.random;
  let last = new GeminiError('unknown', 'Gemini call failed');
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    const started = performance.now();
    try {
      const value = await withGeminiSlot(options.call);
      const outcome = options.outcome(value);
      const duration_ms = Math.round(performance.now() - started);
      const finish = outcome.finishReason ?? '';
      if (finish === 'MAX_TOKENS' || finish === 'length') {
        const error = new GeminiError('token_limit', 'MAX_TOKENS');
        options.log.error(`Gemini ${options.model} hit the token limit`, {
          event: 'gemini',
          model: options.model,
          attempt: attempt + 1,
          duration_ms,
          error_kind: 'token_limit',
          usage: outcome.usage,
        }, error);
        throw error;
      }
      options.log.info(`Gemini ${options.model} ${duration_ms} ms`, {
        event: 'gemini',
        model: options.model,
        attempt: attempt + 1,
        duration_ms,
        usage: outcome.usage,
        finish_reason: finish || undefined,
      });
      return value;
    } catch (error) {
      if (error instanceof GeminiError && error.kind === 'token_limit') throw error;
      const kind = classifyGeminiFailure(error);
      const message = error instanceof Error ? error.message : String(error);
      last = error instanceof GeminiError ? error : new GeminiError(kind, message, { cause: error });
      const duration_ms = Math.round(performance.now() - started);
      options.log.error(`Gemini ${options.model} failed`, {
        event: 'gemini',
        model: options.model,
        attempt: attempt + 1,
        duration_ms,
        error_kind: kind,
      }, last);
      if (kind !== 'rate_limited' || attempt === 3) throw last;
      await wait(backoffMs(attempt, random, retryAfterMs(error)));
    }
  }
  throw last;
};

export const thinkingConfigFor = (model: string) =>
  model.toLowerCase().includes('flash') ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {};

export const aiBackendName = (config: GeminiConfig) => {
  if (config.useVertex && config.project) return 'vertex';
  if (config.apiKey) return 'gemini-api-key';
  return 'none';
};

export const createGemini = (config: GeminiConfig, log: PipelineLogger) => {
  let client: GoogleGenAI | null = null;
  const backend = () => aiBackendName(config);
  const getClient = () => {
    const name = backend();
    if (name === 'none') {
      throw new GeminiNotConfigured(
        'No AI backend configured: set GOOGLE_CLOUD_PROJECT (Vertex via gcloud ADC) or GEMINI_API_KEY in local-backend/.env',
      );
    }
    if (!client) {
      client = name === 'vertex'
        ? new GoogleGenAI({ vertexai: true, project: config.project, location: config.location })
        : new GoogleGenAI({ apiKey: config.apiKey });
    }
    return client;
  };

  const generateJson = async (
    prompt: string,
    responseSchema?: Record<string, unknown> | null,
    files?: GeminiFile[] | null,
    model?: string | null,
  ): Promise<string> => {
    const genai = getClient();
    const parts: Array<Record<string, unknown>> = [];
    for (const file of files ?? []) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType || 'application/octet-stream',
          data: Buffer.from(file.data).toString('base64'),
        },
      });
    }
    parts.push({ text: prompt });
    const modelName = model || config.model;
    const result = await runGeminiCall({
      model: modelName,
      log,
      call: async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
        try {
          return await genai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: responseSchema ? (normalizeSchema(responseSchema) as never) : undefined,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              abortSignal: controller.signal,
              ...thinkingConfigFor(modelName),
            },
          });
        } finally {
          clearTimeout(timer);
        }
      },
      outcome: (next) => {
        const usage = next.usageMetadata;
        return {
          finishReason: String(next.candidates?.[0]?.finishReason ?? ''),
          usage: usage
            ? {
                prompt: usage.promptTokenCount,
                output: usage.candidatesTokenCount,
                total: usage.totalTokenCount,
              }
            : undefined,
        };
      },
    });
    const text = result.text ?? '';
    log.debug('Gemini response text', { event: 'gemini.text', text: text.slice(0, 2000) });
    return text;
  };

  return { generateJson, backend };
};
