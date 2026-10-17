import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { httpError } from '../errors.js';

const jobBody = z.object({
  kind: z.string(),
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const postJob = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = deps.auth.currentUser(authHeader(request));
  const parsed = jobBody.safeParse(request.body);
  if (!parsed.success) throw httpError(422, parsed.error.issues.map((issue) => issue.message).join('; '));
  try {
    return { id: deps.jobs.submit(user.uid, parsed.data.kind, parsed.data.payload) };
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : 'Unknown job kind');
  }
};

export const getJob = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = deps.auth.currentUser(authHeader(request));
  const { id } = request.params as { id: string };
  const doc = await deps.docs.get(`jobs/${id}`);
  if (!doc || doc.data.owner !== user.uid) throw httpError(404, 'Not found');
  return doc;
};
