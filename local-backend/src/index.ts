import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { registerKrayonApi } from '@krayon/api';
import { aiBackend, settings } from './config.js';
import { createContext } from './context.js';
import type { KrayonContext } from './context.js';
import { adcFailure, healthSnapshot, noteTts, startTtsCheck } from './health.js';
import { currentRequestId, getLogger } from './logging.js';
import { installErrorHandler, registerRequestLogging } from './requestLogging.js';
import { registerWebsocket } from './routes/ws.js';
import { auth } from './services/auth.js';

const log = getLogger('krayon.app');

export const buildApp = async (ctx: KrayonContext) => {
  const { coordination, events, jobs, pipeline, startRecovery, storage, store } = ctx;
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024, maxParamLength: 512 });
  registerRequestLogging(app);
  installErrorHandler(app);
  await registerKrayonApi(app, {
    docs: store,
    blobs: storage,
    jobs,
    events,
    pipeline,
    auth,
    coordination,
    log,
    requestId: currentRequestId,
    maxUploadBytes: settings.maxUploadBytes,
    corsOrigins: settings.corsOrigins,
    caps: settings.caps,
    adcFailure: ctx.adcFailure ?? (async () => null),
    health: () => ({
      ...healthSnapshot(),
      ai: aiBackend(),
      services: { firestore: 'local-sqlite', storage: 'local-files', auth: 'stub', jobs: 'in-process' },
    }),
  });
  await registerWebsocket(app, ctx);
  await startRecovery();

  app.post('/api/admin/reset', async () => {
    pipeline.clearCaches();
    coordination.bumpEpoch();
    const docs = await store.clear();
    const files = await storage.clear();
    const documents = Object.values(docs).reduce((total, count) => total + count, 0);
    log.warning('Admin reset: wiped local data', { event: 'reset', documents, byCollection: docs, ...files });
    return { ok: true, removed: { documents, byCollection: docs, ...files } };
  });

  log.info('local-backend ready', {
    event: 'startup',
    ai: aiBackend(),
    project: settings.googleCloudProject,
    location: settings.googleCloudLocation,
    data_dir: settings.dataDir,
  });

  return app;
};

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const live = createContext();
  live.adcFailure = adcFailure;
  if (settings.ttsEnabled) startTtsCheck(() => live.pipeline.ttsHealth());
  else noteTts({ ok: true, enabled: false });
  const app = await buildApp(live);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void live.pipeline.closeRenderer().finally(() => {
      void app.close().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ port: settings.port, host: '127.0.0.1' });
}
