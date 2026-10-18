import type { FastifyReply, FastifyRequest } from 'fastify';
import { mediaKey } from '@krayon/shared';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { httpError } from '../errors.js';
import { sendRange } from '../range.js';
import { safeId } from './courses.js';

const userOf = (deps: ApiDeps, request: FastifyRequest) => deps.auth.currentUser(authHeader(request));

/** Any signed-in visitor may read any course's media. Keys outside users/ are rejected. */
const sharedKey = (id: string, label: string) => {
  const key = mediaKey(safeId(id, label));
  if (!key?.startsWith('users/')) throw httpError(404, 'Not found');
  return key;
};

/** Audio is fetched with Authorization. A `?token=` and no header is rejected. */
export const serveAudio = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const token = (request.query as { token?: unknown }).token;
  const header = request.headers.authorization;
  if (token && (typeof header !== 'string' || !header.trim())) throw httpError(401, 'Sign in required');
  userOf(deps, request);
  const key = sharedKey((request.params as { blobId: string }).blobId, 'audio');
  const range = request.headers.range;
  return sendRange(deps.blobs, reply, key, typeof range === 'string' ? range : undefined, 'audio/wav');
};

/** Renders may use `?token=` because an img tag cannot send a header. */
export const serveRender = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  userOf(deps, request);
  const key = sharedKey((request.params as { blobId: string }).blobId, 'render');
  const stat = await deps.blobs.stat(key);
  if (!stat) throw httpError(404, 'Not found');
  const stream = await deps.blobs.stream(key);
  if (!stream) throw httpError(404, 'Not found');
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return reply.type(stat.contentType).send(Buffer.concat(chunks));
};
