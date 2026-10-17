import { registerKrayonApi } from '@krayon/api';
import type { AuthUser } from '@krayon/shared';
import Fastify from 'fastify';
import { createFirebaseAuthVerifier } from './adapters/firebaseAuthVerifier.js';
import { logger } from './adapters/cloudLogging.js';
import { createGcpRuntime } from './runtime.js';

/**
 * krayon-api. No WebSocket and no /api/admin. The browser talks to Cloud Run directly;
 * Firebase Hosting does not rewrite /api.
 */
const runtime = createGcpRuntime();
const verifier = createFirebaseAuthVerifier();
const verified = new Map<string, AuthUser>();

const app = Fastify({
  logger: false,
  bodyLimit: 25 * 1024 * 1024,
  maxParamLength: 512,
});

app.addHook('onRequest', async (request) => {
  if (!request.url.startsWith('/api/')) return;
  const renders = request.method === 'GET' && request.url.startsWith('/api/renders/');
  const user = await verifier.verify(
    {
      headers: request.headers as Record<string, string | string[] | undefined>,
      query: request.query as Record<string, unknown>,
      url: request.url,
    },
    { renders },
  );
  const key = (typeof request.headers.authorization === 'string' && request.headers.authorization) || `uid:${user.uid}`;
  if (!request.headers.authorization) request.headers['x-user-id'] = key;
  verified.set(key, user);
});

registerKrayonApi(app, {
  docs: runtime.docs,
  blobs: runtime.blobs,
  jobs: runtime.jobs,
  events: runtime.events,
  pipeline: runtime.pipeline,
  auth: {
    currentUser(header) {
      const raw = Array.isArray(header) ? header[0] : header;
      return verified.get(raw ?? '') ?? { uid: '' };
    },
  },
  coordination: runtime.coordination,
  log: logger,
  requestId: () => undefined,
  maxUploadBytes: 20 * 1024 * 1024,
  adcFailure: async () => null,
  health: () => ({ ok: true }),
});

const port = Number(process.env.PORT || 8080);
await app.listen({ port, host: '0.0.0.0' });
logger.info('krayon-api listening', { port });
