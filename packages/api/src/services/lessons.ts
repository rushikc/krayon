import type { FastifyReply, FastifyRequest } from 'fastify';
import { GeminiNotConfigured, lessonDetail, loadSummary, locateLesson, saveProgress } from '@krayon/pipeline';
import { z } from 'zod';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { generationErrorResponse, httpError } from '../errors.js';
import { safeId } from './courses.js';

const regenerateBody = z.object({ prompt: z.string().optional() });
const progressBody = z.object({
  positionFrame: z.number().min(0).optional(),
  watched: z.boolean().optional(),
  completed: z.boolean().optional(),
});
const askBody = z.object({ question: z.string().trim().min(1).max(2000), frame: z.number().min(0).default(0) });

const LEASE_MS = 15 * 60 * 1000;

const userOf = (deps: ApiDeps, request: FastifyRequest) => deps.auth.currentUser(authHeader(request));

const lessonOf = async (deps: ApiDeps, uid: string, id: string) => {
  const lessonId = safeId(id, 'lesson');
  const found = await locateLesson(deps.docs, uid, lessonId);
  if (!found) throw httpError(404, 'Not found');
  return { lessonId, ...found };
};

const leasePath = (lessonId: string, segmentId: string) => `regen/${lessonId}/${segmentId}`;

export const registerLessonJobs = (deps: ApiDeps) => {
  const str = (value: unknown) => String(value ?? '');
  deps.jobs.register('renderLesson', async (payload) => {
    await deps.pipeline.renderLesson(str(payload.uid), str(payload.lessonId));
  });
  deps.jobs.register('rerenderLesson', async (payload) => {
    await deps.pipeline.rerenderLesson(str(payload.uid), str(payload.lessonId), typeof payload.prompt === 'string' ? payload.prompt : undefined);
  });
  deps.jobs.register('regenerate', async (payload) => {
    const path = str(payload.leasePath);
    try {
      return await deps.pipeline.regenerateSegment(
        str(payload.uid),
        str(payload.lessonId),
        str(payload.segmentId),
        typeof payload.prompt === 'string' ? payload.prompt : undefined,
      );
    } finally {
      await deps.coordination.releaseLease(path, str(payload.uid));
    }
  });
};

export const getLesson = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  const { lessonId } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const detail = await lessonDetail(deps.docs, user.uid, lessonId);
  if (!detail) throw httpError(404, 'Not found');
  return detail;
};

/** Render and Retry are idempotent: a ready lesson is returned with jobId null. */
export const renderLesson = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  const { lessonId, courseId } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const before = await loadSummary(deps.docs, user.uid, courseId, lessonId);
  const jobId = before?.status === 'ready' ? null : deps.jobs.submit(user.uid, 'renderLesson', { uid: user.uid, lessonId });
  return { jobId, lesson: await loadSummary(deps.docs, user.uid, courseId, lessonId) };
};

export const rerenderLesson = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const { lessonId, courseId } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const body = regenerateBody.safeParse(request.body ?? {});
  if (!body.success) throw httpError(422, 'Invalid regenerate request');
  const before = await loadSummary(deps.docs, user.uid, courseId, lessonId);
  if (before?.status === 'rendering' || before?.status === 'queued' || before?.status === 'writing') {
    return reply.code(409).send({ error: 'This lesson is already being made.' });
  }
  return { jobId: deps.jobs.submit(user.uid, 'rerenderLesson', { uid: user.uid, lessonId, prompt: body.data.prompt }) };
};

export const regenerateSegment = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const params = request.params as { id: string; segmentId: string };
  const { lessonId, doc } = await lessonOf(deps, user.uid, params.id);
  const segmentId = safeId(params.segmentId, 'segment');
  const detail = await lessonDetail(deps.docs, user.uid, lessonId);
  if (!detail?.segments.some((segment) => segment.id === segmentId)) throw httpError(404, 'Not found');
  const body = regenerateBody.safeParse(request.body ?? {});
  if (!body.success) throw httpError(422, 'Invalid regenerate request');
  const status = String(doc.data.status ?? '');
  if (status === 'rendering' || status === 'queued') return reply.code(409).send({ error: 'busy', reason: 'Still rendering' });
  const path = leasePath(lessonId, segmentId);
  if (!(await deps.coordination.acquireLease(path, user.uid, LEASE_MS))) {
    return reply.code(409).send({ error: 'busy', reason: 'Already regenerating' });
  }
  try {
    return {
      jobId: deps.jobs.submit(user.uid, 'regenerate', {
        uid: user.uid,
        lessonId,
        segmentId,
        prompt: body.data.prompt,
        leasePath: path,
      }),
    };
  } catch (error) {
    await deps.coordination.releaseLease(path, user.uid);
    throw error;
  }
};

export const putProgress = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  const { lessonId } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const body = progressBody.safeParse(request.body ?? {});
  if (!body.success) throw httpError(422, 'Invalid progress');
  return saveProgress(deps.docs, user.uid, lessonId, body.data);
};

export const askLesson = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const { lessonId } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const body = askBody.safeParse(request.body ?? {});
  if (!body.success) throw httpError(422, 'Ask a question.');
  try {
    return await deps.pipeline.ask(user.uid, lessonId, body.data.question, body.data.frame);
  } catch (error) {
    if (error instanceof GeminiNotConfigured) return reply.code(503).send({ detail: error.message, code: 'UPSTREAM' });
    const mapped = generationErrorResponse(error, deps.requestId());
    deps.log.warning(`Lesson chat failed: ${mapped.status} ${mapped.body.code}`, { event: 'ai.chat', lessonId, status: mapped.status, code: mapped.body.code });
    return reply.code(mapped.status).send({ ...mapped.body, detail: mapped.body.message });
  }
};
