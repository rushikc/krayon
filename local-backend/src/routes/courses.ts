import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  GeminiNotConfigured,
  assembleCourse,
  coursePath,
  lessonDetail,
  listCourses,
  loadSummary,
  locateChapter,
  locateLesson,
  saveProgress,
} from '@krayon/pipeline';
import { generationErrorStatus, toGenerationError } from '@krayon/shared';
import { z } from 'zod';
import { settings } from '../config.js';
import { events, jobs, pipeline, storage, store } from '../context.js';
import { adcFailure } from '../health.js';
import { acquireJob, jobConflict, lockKey, releaseJob } from '../locks.js';
import { currentRequestId, getLogger } from '../logging.js';
import { httpError } from '../requestLogging.js';
import { auth } from '../services/auth.js';

const log = getLogger('krayon.app');

const idPattern = /^[A-Za-z0-9_-]+$/;

const safeId = (value: string, label: string) => {
  if (!idPattern.test(value)) throw httpError(400, `Invalid ${label}`);
  return value;
};

const regenerateBody = z.object({ prompt: z.string().optional() });
const progressBody = z.object({
  positionFrame: z.number().min(0).optional(),
  watched: z.boolean().optional(),
  completed: z.boolean().optional(),
});
const askBody = z.object({ question: z.string().trim().min(1).max(2000), frame: z.number().min(0).default(0) });

export const registerCourseRoutes = (app: FastifyInstance) => {
  const str = (value: unknown) => String(value ?? '');

  jobs.register('course', async (payload) => {
    await pipeline.runCourse(str(payload.uid), str(payload.courseId));
    return { courseId: payload.courseId };
  });
  jobs.register('resumeCourse', async (payload) => {
    await pipeline.resumeCourse(str(payload.uid), str(payload.courseId));
  });
  jobs.register('retryCourse', async (payload) => {
    await pipeline.retryCourse(str(payload.uid), str(payload.courseId));
  });
  jobs.register('retryChapter', async (payload) => {
    await pipeline.retryChapter(str(payload.uid), str(payload.chapterId));
  });
  jobs.register('renderLesson', async (payload) => {
    await pipeline.renderLesson(str(payload.uid), str(payload.lessonId));
  });
  jobs.register('regenerate', async (payload) => {
    const key = str(payload.lockKey);
    try {
      return await pipeline.regenerateSegment(
        str(payload.uid),
        str(payload.lessonId),
        str(payload.segmentId),
        typeof payload.prompt === 'string' ? payload.prompt : undefined,
      );
    } finally {
      releaseJob(key);
    }
  });

  app.post('/api/courses', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const files: Array<{ name: string; type: string; data: Buffer }> = [];
    for await (const part of request.files()) {
      const data = await part.toBuffer();
      if (!data.length) throw httpError(400, 'The uploaded file is empty.');
      if (data.length > settings.maxUploadBytes) throw httpError(413, 'File is larger than 20 MB.');
      const name = part.filename || 'upload';
      const type = part.mimetype || (name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const allowed = type === 'application/pdf' || type.startsWith('image/');
      if (!allowed) throw httpError(400, 'Upload a PDF or a photo.');
      files.push({ name, type, data });
    }
    if (files.length === 0) throw httpError(422, 'file is required');
    const adcError = await adcFailure();
    if (adcError) {
      reply.code(503).send({ detail: adcError });
      return;
    }
    (request as { uploadLog?: unknown }).uploadLog = {
      files: files.map((file) => ({ field: 'file', filename: file.name, content_type: file.type, size: file.data.length })),
    };
    const courseId = randomUUID().replace(/-/g, '');
    const sources = files.map((file) => {
      const blob = storage.put(user.uid, file.name, file.type, file.data);
      store.set(`users/${user.uid}/uploads/${blob.id}`, blob);
      return blob;
    });
    store.set(coursePath(user.uid, courseId), {
      owner: user.uid,
      status: 'created',
      stage: 'structure',
      fileNames: sources.map((source) => source.name),
      sources,
      error: null,
    });
    events.emit({ type: 'course.created', courseId, flow: 'course', step: 'created' });
    const jobId = jobs.submit(user.uid, 'course', { uid: user.uid, courseId });
    return { courseId, jobId };
  });

  app.get('/api/courses', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    return { courses: listCourses(store, user.uid) };
  });

  const courseOf = (uid: string, id: string) => {
    const course = assembleCourse(store, uid, safeId(id, 'course'));
    if (!course) throw httpError(404, 'Not found');
    return course;
  };

  app.get('/api/courses/:id', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    return courseOf(user.uid, (request.params as { id: string }).id);
  });

  app.get('/api/courses/:id/chapters', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    return { chapters: courseOf(user.uid, (request.params as { id: string }).id).chapters };
  });

  // Structure failed: run it again. Otherwise failed chapters go back on the list.
  app.post('/api/courses/:id/retry', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const course = courseOf(user.uid, (request.params as { id: string }).id);
    return { jobId: jobs.submit(user.uid, 'retryCourse', { uid: user.uid, courseId: course.id }) };
  });

  app.post('/api/chapters/:id/retry', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const chapterId = safeId((request.params as { id: string }).id, 'chapter');
    const found = locateChapter(store, user.uid, chapterId);
    if (!found) throw httpError(404, 'Not found');
    if (found.doc.data.status === 'writing') return reply.code(409).send({ error: 'busy', reason: 'Still writing' });
    return { jobId: jobs.submit(user.uid, 'retryChapter', { uid: user.uid, chapterId }) };
  });

  const lessonOf = (uid: string, id: string) => {
    const lessonId = safeId(id, 'lesson');
    const found = locateLesson(store, uid, lessonId);
    if (!found) throw httpError(404, 'Not found');
    return { lessonId, ...found };
  };

  app.get('/api/lessons/:id', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { lessonId } = lessonOf(user.uid, (request.params as { id: string }).id);
    const detail = lessonDetail(store, user.uid, lessonId);
    if (!detail) throw httpError(404, 'Not found');
    return detail;
  });

  // Render and Retry are idempotent: a ready or in-flight lesson is returned as it is.
  const render = async (request: { headers: Record<string, unknown>; params: unknown }) => {
    const user = auth.currentUser(request.headers['x-user-id'] as string | undefined);
    const { lessonId, courseId } = lessonOf(user.uid, (request.params as { id: string }).id);
    const before = loadSummary(store, user.uid, courseId, lessonId);
    const jobId = before?.status === 'ready' ? null : jobs.submit(user.uid, 'renderLesson', { uid: user.uid, lessonId });
    return { jobId, lesson: loadSummary(store, user.uid, courseId, lessonId) };
  };
  app.post('/api/lessons/:id/render', render);
  app.post('/api/lessons/:id/retry', render);

  app.post('/api/lessons/:id/segments/:segmentId/regenerate', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const params = request.params as { id: string; segmentId: string };
    const { lessonId, doc } = lessonOf(user.uid, params.id);
    const segmentId = safeId(params.segmentId, 'segment');
    const detail = lessonDetail(store, user.uid, lessonId);
    if (!detail?.segments.some((segment) => segment.id === segmentId)) throw httpError(404, 'Not found');
    const body = regenerateBody.safeParse(request.body ?? {});
    if (!body.success) throw httpError(422, 'Invalid regenerate request');
    const key = lockKey(lessonId, segmentId);
    const conflict = jobConflict(String(doc.data.status ?? ''), key);
    if (conflict) return reply.code(409).send(conflict);
    acquireJob(key);
    try {
      return {
        jobId: jobs.submit(user.uid, 'regenerate', { uid: user.uid, lessonId, segmentId, prompt: body.data.prompt, lockKey: key }),
      };
    } catch (error) {
      releaseJob(key);
      throw error;
    }
  });

  app.put('/api/lessons/:id/progress', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { lessonId } = lessonOf(user.uid, (request.params as { id: string }).id);
    const body = progressBody.safeParse(request.body ?? {});
    if (!body.success) throw httpError(422, 'Invalid progress');
    return saveProgress(store, user.uid, lessonId, body.data);
  });

  app.post('/api/lessons/:id/ask', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { lessonId } = lessonOf(user.uid, (request.params as { id: string }).id);
    const body = askBody.safeParse(request.body ?? {});
    if (!body.success) throw httpError(422, 'Ask a question.');
    try {
      return await pipeline.ask(user.uid, lessonId, body.data.question, body.data.frame);
    } catch (error) {
      if (error instanceof GeminiNotConfigured) return reply.code(503).send({ detail: error.message, code: 'UPSTREAM' });
      const info = toGenerationError(error).toInfo();
      const status = generationErrorStatus(info.code);
      log.warning(`Lesson chat failed: ${status} ${info.code}`, { event: 'ai.chat', lessonId, status, code: info.code });
      return reply.code(status).send({ detail: info.message, ...info, requestId: currentRequestId() });
    }
  });

  app.get('/api/renders/:blobId', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { blobId } = request.params as { blobId: string };
    const found = storage.get(user.uid, safeId(blobId, 'render'));
    if (!found) throw httpError(404, 'Not found');
    return reply.type(found.blob.content_type).send(found.data);
  });
};
