import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { GeminiNotConfigured } from '@krayon/pipeline';
import { generationErrorStatus, modelResponseSchemas, segmentModelSchema, toGenerationError } from '@krayon/shared';
import { z } from 'zod';
import { aiBackend, settings } from './config.js';
import { jobs, pipeline, startRecovery, storage, store } from './context.js';
import { healthSnapshot } from './health.js';
import { currentRequestId, getLogger } from './logging.js';
import { httpError, installErrorHandler, registerRequestLogging } from './requestLogging.js';
import { registerCourseRoutes } from './routes/courses.js';
import { registerWebsocket } from './routes/ws.js';
import { auth } from './services/auth.js';

const log = getLogger('krayon.app');

jobs.register('ingest', (payload) => ({ received: payload }));

const generateBody = z.object({
  prompt: z.string(),
  uploadId: z.string().nullish(),
  responseSchema: z.record(z.string(), z.unknown()).nullish(),
  /** Named schema: the server supplies the response schema and validates the result (zod + retries). */
  schema: z.enum(['segment']).nullish(),
  model: z.string().nullish(),
});

const namedSchemas = { segment: segmentModelSchema } as const;

const jobBody = z.object({
  kind: z.string(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

const scoped = (uid: string, rawPath: string) => {
  if (rawPath.includes('..') || rawPath.includes('\\')) {
    throw httpError(400, 'Invalid path');
  }
  const cleaned = rawPath.replace(/^\/+|\/+$/g, '');
  if (!cleaned.startsWith(`users/${uid}/`)) {
    throw httpError(403, `Paths must start with users/${uid}/`);
  }
  return cleaned;
};

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw httpError(422, result.error.issues.map((issue) => issue.message).join('; '));
  return result.data;
};

export const buildApp = async () => {
  const app = Fastify({ logger: false, bodyLimit: 25 * 1024 * 1024 });
  await app.register(cors, {
    origin: settings.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['*'],
    exposedHeaders: ['X-Request-ID'],
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 12 } });
  registerRequestLogging(app);
  installErrorHandler(app);
  registerCourseRoutes(app);
  await registerWebsocket(app);
  startRecovery();

  app.get('/api/health', async () => ({
    ...healthSnapshot(),
    ai: aiBackend(),
    services: { firestore: 'local-sqlite', storage: 'local-files', auth: 'stub', jobs: 'in-process' },
  }));

  app.get('/api/me', async (request) => auth.currentUser(request.headers['x-user-id']));

  app.post('/api/uploads', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const file = await request.file();
    if (!file) throw httpError(422, 'file is required');
    const data = await file.toBuffer();
    (request as { uploadLog?: unknown }).uploadLog = {
      files: [{ field: 'file', filename: file.filename, content_type: file.mimetype, size: data.length }],
    };
    if (!data.length) throw httpError(400, 'The uploaded file is empty.');
    if (data.length > settings.maxUploadBytes) throw httpError(413, 'File is larger than 20 MB.');
    const name = file.filename || 'upload';
    const ctype = file.mimetype || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
    const blob = storage.put(user.uid, name, ctype, data);
    store.set(`users/${user.uid}/uploads/${blob.id}`, blob);
    return blob;
  });

  app.post('/api/ai/generate', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const body = parse(generateBody, request.body);
    let files: { data: Buffer; mimeType: string }[] | undefined;
    if (body.uploadId) {
      const found = storage.get(user.uid, body.uploadId);
      if (!found) throw httpError(404, 'Upload not found. Upload the file again.');
      files = [{ data: found.data, mimeType: found.blob.content_type }];
    }
    // Errors are sent here, not thrown: the global handler turns every 5xx into a bare 500.
    const fail = (error: unknown) => {
      if (error instanceof GeminiNotConfigured) return reply.code(503).send({ detail: error.message, code: 'UPSTREAM' });
      const info = toGenerationError(error).toInfo();
      const status = generationErrorStatus(info.code);
      log.warning(`AI generate failed: ${status} ${info.code}`, { event: 'ai.generate', schema_name: body.schema ?? null, status, code: info.code });
      const detail = body.schema ? info.message : `Gemini request failed: ${info.message}`;
      return reply.code(status).send({ detail, ...info, requestId: currentRequestId() });
    };
    if (body.schema) {
      try {
        const result = await pipeline.generateNamed(
          body.schema,
          namedSchemas[body.schema] as z.ZodType<unknown>,
          modelResponseSchemas[body.schema],
          body.prompt,
          files ?? [],
          body.model,
        );
        return { text: JSON.stringify(result.value), data: result.value, attempts: result.attempts };
      } catch (error) {
        return fail(error);
      }
    }
    try {
      const text = await pipeline.gemini.generateJson(body.prompt, body.responseSchema ?? undefined, files, body.model);
      return { text };
    } catch (error) {
      return fail(error);
    }
  });

  app.get('/api/docs/*', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const docPath = scoped(user.uid, (request.params as { '*': string })['*'] ?? '');
    const parts = docPath.split('/').filter(Boolean);
    if (parts.length % 2) return { docs: store.list(docPath) };
    const doc = store.get(docPath);
    if (!doc) throw httpError(404, 'Not found');
    return doc;
  });

  app.put('/api/docs/*', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const docPath = scoped(user.uid, (request.params as { '*': string })['*'] ?? '');
    const merge = (request.query as { merge?: string }).merge === 'true';
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
      throw httpError(400, 'Body must be a JSON object');
    }
    try {
      return store.set(docPath, request.body as Record<string, unknown>, merge);
    } catch (error) {
      throw httpError(400, error instanceof Error ? error.message : 'Invalid path');
    }
  });

  app.delete('/api/docs/*', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const docPath = scoped(user.uid, (request.params as { '*': string })['*'] ?? '');
    try {
      return { deleted: store.delete(docPath) };
    } catch (error) {
      throw httpError(400, error instanceof Error ? error.message : 'Invalid path');
    }
  });

  app.post('/api/admin/reset', async () => {
    pipeline.clearCaches();
    const docs = store.clear();
    const files = storage.clear();
    const documents = Object.values(docs).reduce((total, count) => total + count, 0);
    log.warning('Admin reset: wiped local data', { event: 'reset', documents, byCollection: docs, ...files });
    return { ok: true, removed: { documents, byCollection: docs, ...files } };
  });

  app.post('/api/jobs', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const body = parse(jobBody, request.body);
    try {
      return { id: jobs.submit(user.uid, body.kind, body.payload) };
    } catch (error) {
      throw httpError(400, error instanceof Error ? error.message : 'Unknown job kind');
    }
  });

  app.get('/api/jobs/:id', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { id } = request.params as { id: string };
    const doc = store.get(`jobs/${id}`);
    if (!doc || doc.data.owner !== user.uid) throw httpError(404, 'Not found');
    return doc;
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
  const app = await buildApp();
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void pipeline.closeRenderer().finally(() => {
      void app.close().finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await app.listen({ port: settings.port, host: '127.0.0.1' });
}
