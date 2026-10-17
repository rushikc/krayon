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

const transient = (error: unknown) => {
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message : String(error);
  return status === 429 || status === 503 || /UNAVAILABLE|RESOURCE_EXHAUSTED|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
};

export const isRetryableGenerateError = (error: unknown) => {
  if (transient(error)) return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || /aborted|MAX_TOKENS/i.test(`${error.name} ${error.message}`);
};

export const thinkingConfigFor = (model: string) =>
  model.toLowerCase().includes('flash') ? { thinkingConfig: { thinkingBudget: FLASH_THINKING_BUDGET } } : {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const info: Record<string, unknown> = {
      event: 'gemini',
      backend: backend(),
      model: model || config.model,
      prompt_chars: prompt.length,
      file_bytes: (files ?? []).reduce((total, file) => total + file.data.byteLength, 0),
      file_type: files?.[0]?.mimeType,
      has_schema: Boolean(responseSchema),
    };
    const start = performance.now();
    let result: Awaited<ReturnType<GoogleGenAI['models']['generateContent']>> | undefined;
    let lastError: unknown;
    const modelName = String(info.model);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
      try {
        const next = await genai.models.generateContent({
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
        const finish = String(next.candidates?.[0]?.finishReason ?? '');
        if (finish === 'MAX_TOKENS') throw new Error('MAX_TOKENS');
        result = next;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (!isRetryableGenerateError(error) || attempt === 2) break;
        await sleep(400 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    info.latency_ms = Math.round((performance.now() - start) * 10) / 10;
    if (!result) {
      const error = lastError instanceof Error ? lastError : new Error(String(lastError));
      log.error(`Gemini call failed: ${error.name}`, { ...info, error: error.message.slice(0, 1000) }, error);
      throw error;
    }
    const usage = result.usageMetadata;
    if (usage) {
      info.usage = {
        prompt: usage.promptTokenCount,
        output: usage.candidatesTokenCount,
        thoughts: usage.thoughtsTokenCount,
        total: usage.totalTokenCount,
      };
    }
    const text = result.text ?? '';
    info.response_chars = text.length;
    const finish = result.candidates?.[0]?.finishReason;
    if (finish) info.finish_reason = String(finish);
    log.info(`Gemini ${info.model} ${Math.round(Number(info.latency_ms))} ms`, info);
    log.debug('Gemini response text', { event: 'gemini.text', text: text.slice(0, 2000) });
    return text;
  };

  return { generateJson, backend };
};
