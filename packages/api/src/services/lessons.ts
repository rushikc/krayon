import type { FastifyReply, FastifyRequest } from 'fastify';
import { GeminiNotConfigured, lessonDetail, loadSummary, locateLesson, reserveUsage, saveProgress } from '@krayon/pipeline';
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

const guard = async (deps: ApiDeps, kind: 'render' | 'regenerate' | 'ask', uid: string) => {
  await reserveUsage(deps.docs, kind, deps.caps, uid);
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
  const { lessonId, courseId, ownerUid, doc } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const status = String(doc.data.status ?? '');
  const lesson = () => loadSummary(deps.docs, ownerUid, courseId, lessonId, user.uid);
  if (status === 'ready') return { jobId: null, lesson: await lesson() };
  if (status === 'queued' || status === 'rendering') return { jobId: String(doc.data.jobId ?? 'inflight'), lesson: await lesson() };
  await guard(deps, 'render', user.uid);
  const jobId = await deps.jobs.submit(ownerUid, 'renderLesson', { uid: ownerUid, courseId, lessonId });
  await deps.docs.set(`users/${ownerUid}/courses/${courseId}/lessons/${lessonId}`, { jobId }, { merge: true });
  return { jobId, lesson: await lesson() };
};

export const rerenderLesson = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const { lessonId, courseId, ownerUid, doc } = await lessonOf(deps, user.uid, (request.params as { id: string }).id);
  const body = regenerateBody.safeParse(request.body ?? {});
  if (!body.success) throw httpError(422, 'Invalid regenerate request');
  const status = String(doc.data.status ?? '');
  if (status === 'rendering' || status === 'queued' || status === 'writing') {
    return reply.code(409).send({ error: 'This lesson is already being made.' });
  }
  await guard(deps, 'render', user.uid);
  return { jobId: await deps.jobs.submit(ownerUid, 'rerenderLesson', { uid: ownerUid, courseId, lessonId, prompt: body.data.prompt, force: true }) };
};

export const regenerateSegment = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const params = request.params as { id: string; segmentId: string };
  const { lessonId, ownerUid, doc } = await lessonOf(deps, user.uid, params.id);
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
  await guard(deps, 'regenerate', user.uid);
  try {
    return {
      jobId: await deps.jobs.submit(ownerUid, 'regenerate', {
        uid: ownerUid,
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
  await guard(deps, 'ask', user.uid);
  try {
    return await deps.pipeline.ask(user.uid, lessonId, body.data.question, body.data.frame);
  } catch (error) {
    if (error instanceof GeminiNotConfigured) return reply.code(503).send({ detail: error.message, code: 'UPSTREAM' });
    const mapped = generationErrorResponse(error, deps.requestId());
    deps.log.warning(`Lesson chat failed: ${mapped.status} ${mapped.body.code}`, { event: 'ai.chat', lessonId, status: mapped.status, code: mapped.body.code });
    return reply.code(mapped.status).send({ ...mapped.body, detail: mapped.body.message });
  }
};
