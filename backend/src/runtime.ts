import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { pipelineEnvSchema } from '@krayon/api';
import { createPipeline } from '@krayon/pipeline';
import type { EventBus, JobQueue, PipelineEmit, PipelineEvent } from '@krayon/shared';
import { createCloudTasksDispatcher } from './adapters/cloudTasksDispatcher.js';
import { createFirestoreCoordination } from './adapters/firestoreCoordination.js';
import { createFirestoreDocStore } from './adapters/firestoreDocStore.js';
import { createGcsBlobStorage } from './adapters/gcsBlobStorage.js';
import { createHttpRenderer } from './adapters/httpRenderer.js';
import { logger } from './adapters/cloudLogging.js';
import { notifier } from './adapters/notifier.js';

/** One process-wide Firebase app, Firestore, and the shared pipeline. */
export const createGcpRuntime = () => {
  initializeApp();
  const env = pipelineEnvSchema.parse(process.env);
  const docs = createFirestoreDocStore();
  const blobs = createGcsBlobStorage();
  const dispatcher = createCloudTasksDispatcher();
  const coordination = createFirestoreCoordination();
  let seq = 0;
  const events: EventBus = {
    emit(event: PipelineEmit): PipelineEvent {
      seq += 1;
      const full = { ...event, seq, ts: new Date().toISOString() };
      void notifier.emit(event);
      return full;
    },
    subscribe() {
      return () => undefined;
    },
    beginRun() {
      return `run-${seq}`;
    },
    endRun() {
      return undefined;
    },
    requestCancel() {
      return undefined;
    },
    isCancelled() {
      return false;
    },
    viewedCourse() {
      return null;
    },
    setViewedCourse() {
      return undefined;
    },
  };
  const httpRenderer = createHttpRenderer(blobs);
  const pipeline = createPipeline({
    docs,
    blobs,
    events,
    dispatcher,
    log: {
      info: (message, fields) => logger.info(message, fields),
      warn: (message, fields) => logger.warning(message, fields),
      error: (message, fields) => logger.error(message, fields),
      debug: (message, fields) => logger.info(message, fields),
    },
    renderer: {
      renderKeyframes: async (owner, segment, priority, fields) => {
        const stills = await httpRenderer.renderStills({
          uid: owner,
          lessonId: String(fields?.lessonId ?? ''),
          segmentId: segment.id,
          attempt: Number(fields?.attempt ?? 1),
          round: Number(fields?.round ?? 1),
          segment,
          priority,
        });
        return { frames: stills.frames, keyframeIds: stills.keys };
      },
      warmup: async () => undefined,
      health: () => ({ ok: true }),
      close: async () => undefined,
      clear: () => undefined,
    },
    config: {
      useVertex: env.GOOGLE_GENAI_USE_VERTEXAI !== 'false',
      project: env.GOOGLE_CLOUD_PROJECT,
      location: env.GOOGLE_CLOUD_LOCATION,
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      reviewModel: env.GEMINI_REVIEW_MODEL,
      maxRepairRounds: env.MAX_REPAIR_ROUNDS,
      maxReviewRounds: env.MAX_REVIEW_ROUNDS,
      reviewPassScore: env.REVIEW_PASS_SCORE,
      chapterConcurrency: env.CHAPTER_CONCURRENCY,
      renderConcurrency: env.RENDER_CONCURRENCY,
      segmentRetries: env.SEGMENT_RETRIES,
      renderKeyframesMax: env.RENDER_KEYFRAMES_MAX,
      renderTimeoutMs: env.RENDER_TIMEOUT_MS,
      remotionEntry: path.resolve('packages/shared/dist/remotion/entry.js'),
      ttsEnabled: env.TTS_ENABLED !== 'false',
      ttsVoice: env.TTS_VOICE,
      ttsRate: env.TTS_RATE,
      ttsConcurrency: env.TTS_CONCURRENCY,
      ttsQuotaProject: env.TTS_QUOTA_PROJECT,
      geminiMaxConcurrency: env.GEMINI_MAX_CONCURRENCY,
    },
  });
  const unavailable = () => Object.assign(new Error('Could not queue the work. Try again in a moment.'), { statusCode: 503 });
  const jobs: JobQueue = {
    register() {
      return undefined;
    },
    async submit(owner, kind, payload) {
      const uid = String(payload.uid ?? owner);
      const courseId = String(payload.courseId ?? '');
      const lessonId = typeof payload.lessonId === 'string' ? payload.lessonId : '';
      const chapterId = typeof payload.chapterId === 'string' ? payload.chapterId : '';
      try {
        if (kind === 'retryCourse') {
          await pipeline.retryCourse(uid, courseId);
          return `retry-${courseId}`;
        }
        if (kind === 'retryChapter') {
          await pipeline.retryChapter(uid, chapterId);
          return `retry-${chapterId}`;
        }
        if (kind === 'renderLesson') return (await pipeline.renderLesson(uid, lessonId)).taskId;
        if (kind === 'rerenderLesson') {
          return (await pipeline.rerenderLesson(uid, lessonId, typeof payload.prompt === 'string' ? payload.prompt : undefined)).taskId;
        }
        if (kind === 'regenerate') {
          const segmentId = String(payload.segmentId ?? '');
          const queued = await dispatcher.dispatch({
            kind: 'segment.narrate',
            queue: 'ai-user',
            dedupeKey: `narrate-${uid}-${lessonId}-${segmentId}-${Date.now()}`,
            payload: { uid, courseId, lessonId, segmentId, prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined },
          });
          return queued.taskId;
        }
        const queued = await dispatcher.dispatch({
          kind: 'course.structure',
          queue: 'ai-user',
          dedupeKey: `course-${uid}-${courseId}`,
          payload: { uid, courseId, priority: { userClicked: true, enqueuedAt: Date.now() } },
        });
        return queued.taskId;
      } catch (error) {
        if (typeof (error as { statusCode?: number }).statusCode === 'number') throw error;
        throw unavailable();
      }
    },
  };
  return { docs, blobs, jobs, events, coordination, pipeline, dispatcher };
};
