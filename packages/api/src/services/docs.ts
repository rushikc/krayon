import type { FastifyRequest } from 'fastify';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { httpError } from '../errors.js';

/** Study and progress only. Course and lesson docs are not writable through this API. */
const scoped = (uid: string, rawPath: string) => {
  if (rawPath.includes('..') || rawPath.includes('\\')) throw httpError(400, 'Invalid path');
  const cleaned = rawPath.replace(/^\/+|\/+$/g, '');
  const state = `users/${uid}/state`;
  const progress = `users/${uid}/progress`;
  const allowed = cleaned === state || cleaned.startsWith(`${state}/`) || cleaned === progress || cleaned.startsWith(`${progress}/`);
  if (!allowed) {
    throw httpError(403, 'Only your study state and progress can be read or written here');
  }
  return cleaned;
};

const pathOf = (deps: ApiDeps, request: FastifyRequest) => {
  const user = deps.auth.currentUser(authHeader(request));
  return { user, docPath: scoped(user.uid, (request.params as { '*': string })['*'] ?? '') };
};

export const getDoc = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const { docPath } = pathOf(deps, request);
  const parts = docPath.split('/').filter(Boolean);
  if (parts.length % 2) return { docs: await deps.docs.list(docPath) };
  const doc = await deps.docs.get(docPath);
  if (!doc) throw httpError(404, 'Not found');
  return doc;
};

export const putDoc = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const { docPath } = pathOf(deps, request);
  const merge = (request.query as { merge?: string }).merge === 'true';
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) throw httpError(400, 'Body must be a JSON object');
  try {
    await deps.docs.set(docPath, request.body as Record<string, unknown>, { merge });
    return deps.docs.get(docPath);
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : 'Invalid path');
  }
};

export const deleteDoc = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const { docPath } = pathOf(deps, request);
  try {
    return { deleted: await deps.docs.delete(docPath) };
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : 'Invalid path');
  }
};
