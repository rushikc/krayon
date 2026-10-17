import path from 'node:path';
import { createPipeline } from '@krayon/pipeline';
import type { ModelClient, TtsClient } from '@krayon/shared';
import type { Pipeline } from '@krayon/pipeline';
import { LocalEventBus } from './bus.js';
import { LocalCoordination } from './coordination.js';
import { rootDir, settings } from './config.js';
import { setRendererHealth, startAdcCheck } from './health.js';
import { getLogger } from './logging.js';
import { LocalJobRunner } from './services/jobs.js';
import { LocalDocStore } from './services/docstore.js';
import { LocalStorage } from './services/storage.js';

const geminiLog = getLogger('krayon.gemini');

export type ContextOverrides = {
  dataDir?: string;
  model?: ModelClient;
  tts?: Parameters<typeof createPipeline>[0]['tts'];
  renderer?: Parameters<typeof createPipeline>[0]['renderer'];
  /** Skip the Remotion bundle and the ADC check. Tests set this. */
  quiet?: boolean;
};

export type KrayonContext = {
  store: LocalDocStore;
  storage: LocalStorage;
  jobs: LocalJobRunner;
  events: LocalEventBus;
  coordination: LocalCoordination;
  pipeline: Pipeline;
  startRecovery: () => Promise<void>;
  /** Tests stub this so course creation does not wait on Application Default Credentials. */
  adcFailure?: () => Promise<string | null>;
};

export const createContext = (overrides: ContextOverrides = {}): KrayonContext => {
  const dataDir = overrides.dataDir ?? settings.dataDir;
  const store = new LocalDocStore(path.join(dataDir, 'firestore.sqlite3'));
  const storage = new LocalStorage(path.join(dataDir, 'storage'));
  const jobs = new LocalJobRunner(store);
  const events = new LocalEventBus();
  const coordination = new LocalCoordination(events);
  const pipeline = createPipeline({
    docs: store,
    blobs: storage,
    events,
    log: {
      info: (message, fields) => geminiLog.info(message, fields),
      warn: (message, fields) => geminiLog.warning(message, fields),
      error: (message, fields, error) => geminiLog.error(message, fields, error),
      debug: (message, fields) => geminiLog.debug(message, fields),
    },
    tts: overrides.tts,
    model: overrides.model,
    renderer: overrides.renderer,
    config: {
      useVertex: settings.useVertex,
      project: settings.googleCloudProject,
      location: settings.googleCloudLocation,
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      reviewModel: settings.geminiReviewModel,
      maxRepairRounds: settings.maxRepairRounds,
      maxReviewRounds: settings.maxReviewRounds,
      reviewPassScore: settings.reviewPassScore,
      chapterConcurrency: settings.chapterConcurrency,
      renderConcurrency: settings.renderConcurrency,
      segmentRetries: settings.segmentRetries,
      renderKeyframesMax: settings.renderKeyframesMax,
      renderTimeoutMs: settings.renderTimeoutMs,
      remotionEntry: path.resolve(rootDir, '../packages/shared/dist/remotion/entry.js'),
      ttsEnabled: overrides.tts ? true : settings.ttsEnabled,
      ttsVoice: settings.ttsVoice,
      ttsRate: settings.ttsRate,
      ttsConcurrency: settings.ttsConcurrency,
      ttsQuotaProject: settings.ttsQuotaProject,
      geminiMaxConcurrency: settings.geminiMaxConcurrency,
    },
  });
  if (!overrides.quiet) {
    setRendererHealth(() => pipeline.rendererHealth());
    startAdcCheck();
    void pipeline.warmup().catch((error: unknown) => {
      geminiLog.error('Remotion bundle failed', { event: 'render.warmup' }, error);
    });
  }
  return {
    store,
    storage,
    jobs,
    events,
    coordination,
    pipeline,
    startRecovery: async () => {
      await store.recoverInterrupted((uid, courseId) => {
        jobs.submit(uid, 'resumeCourse', { uid, courseId });
      });
    },
  };
};

export type { ModelClient, TtsClient };
