import { genkit } from 'genkit';
import { googleAI, vertexAI } from '@genkit-ai/google-genai';
import { GenerationError, toGenerationError } from '@krayon/shared';
import type { BlobStorage, Clock, DocStore, EventBus, GenerationErrorInfo, ModelClient, PipelineEmit, PipelineEventType, TaskDispatcher } from '@krayon/shared';
import {
  GENERATE_TIMEOUT_MS,
  LONG_OUTPUT_TOKENS,
  LONG_TIMEOUT_MS,
  MAX_OUTPUT_TOKENS,
  callTypeForAttempt,
  geminiQueue,
  runGeminiCall,
  setGeminiConcurrency,
  thinkingConfigFor,
} from './gemini.js';
import type { GeminiConfig, PipelineLogger } from './gemini.js';
import { generateValidated } from './generate.js';
import type { ValidatedRequest } from './generate.js';
import { createSourceCache } from './pdf.js';
import type { SourceFile } from './pdf.js';
import type { Priority } from './queue.js';
import { createRenderer } from './render.js';
import { loadChapter, loadSegment, loadSummary } from './store.js';
import { createTts } from './tts.js';
import type { TtsClient } from './tts.js';

export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

export const isCancelled = (error: unknown) => error instanceof Error && error.name === 'Cancelled';

export type PipelineConfig = GeminiConfig & {
  reviewModel: string;
  maxRepairRounds: number;
  maxReviewRounds: number;
  reviewPassScore: number;
  chapterConcurrency: number;
  renderConcurrency: number;
  segmentRetries: number;
  renderKeyframesMax: number;
  renderTimeoutMs: number;
  remotionEntry: string;
  ttsEnabled: boolean;
  ttsVoice: string;
  ttsRate: number;
  ttsConcurrency: number;
  ttsQuotaProject: string;
  geminiMaxConcurrency: number;
};

export type PipelineDeps = {
  docs: DocStore;
  blobs: BlobStorage;
  events: EventBus;
  config: PipelineConfig;
  log: PipelineLogger;
  /** Test double. Production builds one from config. */
  tts?: TtsClient;
  /** Test double. Production uses Genkit. */
  model?: ModelClient;
  clock?: Clock;
  /** Cloud Tasks on GCP. Local runs each task in this process. */
  dispatcher?: TaskDispatcher;
  /** Test double. Production builds one from config. */
  renderer?: {
    renderKeyframes: (
      owner: string,
      segment: import('@krayon/shared').GeneratedSegment,
      priority?: import('./queue.js').Priority,
      fields?: Record<string, unknown>,
    ) => Promise<{ frames: number[]; keyframeIds: string[] }>;
    warmup: () => Promise<unknown>;
    health: () => { ok: boolean; error?: string };
    close: () => Promise<void>;
    clear: () => void;
  };
};

/** Only the structure pass may attach the whole document; every other call gets page slices. */
export const assertSliced = (name: string, files: SourceFile[]) => {
  if (name !== 'structure' && files.some((file) => file.full)) {
    throw new Error(`The ${name} call may not attach the full document; send a page slice.`);
  }
};

export type ModelRequest<T> = Omit<ValidatedRequest<T>, 'generate' | 'log' | 'attempts'> & {
  responseSchema: Record<string, unknown>;
  files?: SourceFile[];
  model?: string;
  attempts?: number;
  /** 16k output tokens and a 120 s timeout (lesson split, scripts, beats, chapter text). */
  long?: boolean;
  priority: Priority;
};

export const createRuntime = (deps: PipelineDeps) => {
  const { docs, blobs, events, config, log } = deps;
  const clock = deps.clock ?? { now: () => Date.now() };
  setGeminiConcurrency(config.geminiMaxConcurrency);
  const plugin = config.useVertex && config.project ? 'vertexai' : 'googleai';
  const ai = deps.model
    ? null
    : genkit({
    plugins: [
      config.useVertex && config.project
        ? vertexAI({ projectId: config.project, location: config.location })
        : googleAI({ apiKey: config.apiKey || 'missing' }),
    ],
  });
  const sources = createSourceCache(blobs, docs);
  const renderer =
    deps.renderer ??
    createRenderer(config.remotionEntry, blobs, config.renderKeyframesMax, {
      timeoutMs: config.renderTimeoutMs,
      concurrency: config.renderConcurrency,
      log,
    });
  geminiQueue.setViewedCourse(() => events.viewedCourse());
  const tts =
    deps.tts ??
    createTts(
      {
        enabled: config.ttsEnabled,
        voice: config.ttsVoice,
        rate: config.ttsRate,
        concurrency: config.ttsConcurrency,
        quotaProject: config.ttsQuotaProject,
      },
      log,
      { blobs },
    );

  /** Bumped by reset; work started under an older epoch stops at its next check. */
  let epoch = 0;
  const currentEpoch = () => epoch;
  const assertLive = (captured: number) => {
    if (captured !== epoch) throw new Cancelled();
  };

  const toParts = (prompt: string, files: SourceFile[]) => {
    const parts: Array<{ text: string } | { media: { url: string; contentType: string } }> = [];
    for (const file of files) {
      const mime = file.mimeType || 'application/octet-stream';
      parts.push({ media: { contentType: mime, url: `data:${mime};base64,${Buffer.from(file.data).toString('base64')}` } });
    }
    parts.push({ text: prompt });
    return parts;
  };

  const generateText = async (
    prompt: string,
    files: SourceFile[],
    model: string,
    responseSchema: Record<string, unknown>,
    options: { long?: boolean; priority: Priority; callType: string; fields?: Record<string, unknown> },
  ) => {
    const captured = epoch;
    const timeoutMs = options.long ? LONG_TIMEOUT_MS : GENERATE_TIMEOUT_MS;
    const attached = files.filter((file) => file.pages).map((file) => `${file.pages!.start + 1}-${file.pages!.end + 1}`);
    const response = await runGeminiCall({
      model,
      log,
      priority: options.priority,
      callType: options.callType,
      fields: {
        ...options.fields,
        attached_pages: attached.length ? attached : undefined,
        full_document: files.some((file) => file.full) || undefined,
        files: files.length,
      },
      call: async () => {
        assertLive(captured);
        if (deps.model) {
          return deps.model.generateJson({
            prompt,
            files,
            model,
            responseSchema,
            long: options.long,
            callType: options.callType,
            priority: options.priority,
          });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const value = await ai!.generate({
            model: `${plugin}/${model}`,
            prompt: toParts(prompt, files),
            config: {
              maxOutputTokens: options.long ? LONG_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS,
              ...thinkingConfigFor(model, options.callType),
            },
            output: { jsonSchema: responseSchema },
            abortSignal: controller.signal,
          });
          return {
            text: value.text,
            finishReason: value.finishReason === 'length' ? 'MAX_TOKENS' : value.finishReason,
            usage: value.usage
              ? {
                  prompt: value.usage.inputTokens,
                  output: value.usage.outputTokens,
                  total: value.usage.totalTokens,
                  thinking_tokens: value.usage.thoughtsTokens,
                }
              : undefined,
          };
        } finally {
          clearTimeout(timer);
        }
      },
      outcome: (value) => ({ finishReason: value.finishReason, usage: value.usage }),
    });
    assertLive(captured);
    return response.text;
  };

  /** One validated model call (see generateValidated): JSON + zod + optional check, with retries and logs. */
  const modelJson = <T>(request: ModelRequest<T>) => {
    const files = request.files ?? [];
    assertSliced(request.name, files);
    const model = request.model ?? config.model;
    return generateValidated({
      ...request,
      attempts: request.attempts ?? 2,
      generate: (prompt, attempt) =>
        generateText(prompt, files, model, request.responseSchema, {
          long: request.long,
          priority: request.priority,
          callType: callTypeForAttempt(request.name, attempt),
          fields: request.fields,
        }),
      log,
    });
  };

  /** Turns any thrown error into stored failure info; logs errors that generateValidated did not log. */
  const failureOf = (error: unknown, fields: Record<string, unknown>): GenerationErrorInfo => {
    const failure = toGenerationError(error).toInfo();
    if (!(error instanceof GenerationError)) {
      log.error(`Generation step failed: ${failure.message}`, { ...fields, event: 'ai.failed', code: failure.code }, error);
    }
    return failure;
  };

  const emit = (event: PipelineEmit) => events.emit(event);

  const emitChapter = async (uid: string, courseId: string, chapterId: string, type: PipelineEventType, extra: Partial<PipelineEmit> = {}) => {
    const chapter = await loadChapter(docs, uid, courseId, chapterId);
    if (chapter) await emit({ type, courseId, chapterId, chapter, flow: 'chapter', ...extra });
  };

  const emitLesson = async (uid: string, courseId: string, lessonId: string, type: PipelineEventType, extra: Partial<PipelineEmit> = {}) => {
    const lesson = await loadSummary(docs, uid, courseId, lessonId);
    if (lesson) await emit({ type, courseId, chapterId: lesson.chapterId, lessonId, lesson, flow: 'lesson', ...extra });
  };

  const emitSegment = async (
    uid: string,
    courseId: string,
    lessonId: string,
    segmentId: string,
    type: PipelineEventType,
    extra: Partial<PipelineEmit> = {},
  ) => {
    const segment = await loadSegment(docs, uid, courseId, lessonId, segmentId);
    const lesson = await loadSummary(docs, uid, courseId, lessonId);
    if (segment) await emit({ type, courseId, lessonId, segmentId, segment, lesson: lesson ?? undefined, flow: 'segment', ...extra });
  };

  const clear = () => {
    epoch += 1;
    geminiQueue.clear();
    tts.clear();
    renderer.clear();
    sources.clear();
  };

  return {
    ai,
    docs,
    blobs,
    events,
    config,
    log,
    sources,
    renderer,
    tts,
    modelJson,
    failureOf,
    emit,
    emitChapter,
    emitLesson,
    emitSegment,
    currentEpoch,
    assertLive,
    clear,
    clock,
  };
};

export type Runtime = ReturnType<typeof createRuntime>;
