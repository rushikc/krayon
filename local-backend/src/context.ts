import path from 'node:path';
import { createPipeline } from '@krayon/pipeline';
import { LocalEventBus } from './bus.js';
import { rootDir, settings } from './config.js';
import { setRendererHealth, startAdcCheck } from './health.js';
import { getLogger } from './logging.js';
import { LocalJobRunner } from './services/jobs.js';
import { LocalDocStore } from './services/docstore.js';
import { LocalStorage } from './services/storage.js';

export const store = new LocalDocStore(path.join(settings.dataDir, 'firestore.sqlite3'));
export const storage = new LocalStorage(path.join(settings.dataDir, 'storage'));
export const jobs = new LocalJobRunner(store);
export const events = new LocalEventBus();

const geminiLog = getLogger('krayon.gemini');

export const pipeline = createPipeline({
  docs: store,
  blobs: storage,
  events,
  log: {
    info: (message, fields) => geminiLog.info(message, fields),
    warn: (message, fields) => geminiLog.warning(message, fields),
    error: (message, fields, error) => geminiLog.error(message, fields, error),
    debug: (message, fields) => geminiLog.debug(message, fields),
  },
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
  },
});

setRendererHealth(() => pipeline.rendererHealth());
startAdcCheck();
void pipeline.warmup().catch((error: unknown) => {
  geminiLog.error('Remotion bundle failed', { event: 'render.warmup' }, error);
});

export const startRecovery = () => {
  store.recoverInterrupted((uid, courseId) => {
    jobs.submit(uid, 'resumeCourse', { uid, courseId });
  });
};
