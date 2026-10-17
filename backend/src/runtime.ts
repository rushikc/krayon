import path from 'node:path';
import { initializeApp } from 'firebase-admin/app';
import { pipelineEnvSchema } from '@krayon/api';
import { createPipeline } from '@krayon/pipeline';
import type { EventBus, JobQueue, PipelineEmit, PipelineEvent, TaskKind } from '@krayon/shared';
import { createCloudTasksDispatcher } from './adapters/cloudTasksDispatcher.js';
import { createFirestoreCoordination } from './adapters/firestoreCoordination.js';
import { createFirestoreDocStore } from './adapters/firestoreDocStore.js';
import { createGcsBlobStorage } from './adapters/gcsBlobStorage.js';
import { createHttpRenderer } from './adapters/httpRenderer.js';
import { logger } from './adapters/cloudLogging.js';
import { notifier } from './adapters/notifier.js';

const jobKind: Record<string, TaskKind> = {
  course: 'course.structure',
  resumeCourse: 'course.structure',
  retryCourse: 'course.structure',
  retryChapter: 'chapter.write',
  renderLesson: 'lesson.plan',
  rerenderLesson: 'lesson.plan',
  regenerate: 'segment.narrate',
};

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
  const jobs: JobQueue = {
    register() {
      return undefined;
    },
    submit(_owner, kind, payload) {
      const taskKind = jobKind[kind] ?? 'course.structure';
      const courseId = String(payload.courseId ?? payload.lessonId ?? '');
      const id = `${kind}-${courseId}-${Date.now()}`;
      void dispatcher.dispatch({
        kind: taskKind,
        queue: taskKind === 'segment.voice' ? 'tts' : 'ai-user',
        dedupeKey: id,
        payload: {
          uid: String(payload.uid ?? _owner),
          courseId: String(payload.courseId ?? ''),
          chapterId: typeof payload.chapterId === 'string' ? payload.chapterId : undefined,
          lessonId: typeof payload.lessonId === 'string' ? payload.lessonId : undefined,
          segmentId: typeof payload.segmentId === 'string' ? payload.segmentId : undefined,
          prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
          gen: kind === 'rerenderLesson' ? Date.now() : undefined,
          priority: { userClicked: kind !== 'course', enqueuedAt: Date.now() },
        },
      });
      return id;
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
  return { docs, blobs, jobs, events, coordination, pipeline, dispatcher };
};
