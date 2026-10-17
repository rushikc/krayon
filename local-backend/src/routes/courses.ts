import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { assembleCourse, coursePath, listCourses } from '@krayon/pipeline';
import { z } from 'zod';
import { settings } from '../config.js';
import { events, jobs, pipeline, storage, store } from '../context.js';
import { adcFailure } from '../health.js';
import { acquireJob, jobConflict, lockKey, releaseJob } from '../locks.js';
import { httpError } from '../requestLogging.js';
import { auth } from '../services/auth.js';

const idPattern = /^[A-Za-z0-9_-]+$/;

const safeId = (value: string, label: string) => {
  if (!idPattern.test(value)) throw httpError(400, `Invalid ${label}`);
  return value;
};

const regenerateBody = z.object({ prompt: z.string().optional() });

export const registerCourseRoutes = (app: FastifyInstance) => {
  jobs.register('course', async (payload) => {
    await pipeline.runCourse(String(payload.uid), String(payload.courseId));
    return { courseId: payload.courseId };
  });

  const locked = (key: string, run: () => Promise<unknown>) => async () => {
    try {
      return await run();
    } finally {
      releaseJob(key);
    }
  };

  jobs.register('regenerate', async (payload) => {
    const key = String(payload.lockKey ?? '');
    return locked(key, () =>
      pipeline.runRegenerate(
        String(payload.uid),
        String(payload.courseId),
        String(payload.topicId),
        String(payload.segmentId),
        typeof payload.prompt === 'string' ? payload.prompt : undefined,
      ),
    )();
  });

  jobs.register('retrySegment', async (payload) => {
    const key = String(payload.lockKey ?? '');
    return locked(key, () => pipeline.runRetry(String(payload.uid), String(payload.courseId), String(payload.topicId), String(payload.segmentId)))();
  });

  jobs.register('retryTopic', async (payload) => {
    const key = String(payload.lockKey ?? '');
    return locked(key, () => pipeline.runTopicRetry(String(payload.uid), String(payload.courseId), String(payload.topicId)))();
  });

  jobs.register('resumeCourse', async (payload) => {
    await pipeline.resumeCourse(String(payload.uid), String(payload.courseId));
  });

  jobs.register('renderTopic', async (payload) => {
    const key = String(payload.lockKey ?? '');
    return locked(key, () => pipeline.runTopic(String(payload.uid), String(payload.courseId), String(payload.topicId)))();
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
      fileNames: sources.map((source) => source.name),
      sources,
      roadmap: null,
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

  app.get('/api/courses/:id', async (request) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { id } = request.params as { id: string };
    const course = assembleCourse(store, user.uid, safeId(id, 'course'));
    if (!course) throw httpError(404, 'Not found');
    return course;
  });

  const beginJob = (
    reply: { code: (status: number) => { send: (body: unknown) => unknown } },
    topicStatus: string,
    key: string,
    topicWide: boolean,
    submit: () => string,
  ) => {
    const conflict = jobConflict(topicStatus, key, topicWide);
    if (conflict) return reply.code(409).send(conflict);
    acquireJob(key);
    try {
      return { jobId: submit() };
    } catch (error) {
      releaseJob(key);
      throw error;
    }
  };

  app.post('/api/courses/:id/topics/:topicId/segments/:segmentId/regenerate', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const params = request.params as { id: string; topicId: string; segmentId: string };
    const courseId = safeId(params.id, 'course');
    const topicId = safeId(params.topicId, 'topic');
    const segmentId = safeId(params.segmentId, 'segment');
    const course = assembleCourse(store, user.uid, courseId);
    const topic = course?.topics.find((item) => item.id === topicId);
    const index = topic?.segments.findIndex((item) => item.id === segmentId) ?? -1;
    if (!topic || index < 0) throw httpError(404, 'Not found');
    const body = regenerateBody.safeParse(request.body ?? {});
    if (!body.success) throw httpError(422, 'Invalid regenerate request');
    const key = lockKey(courseId, topicId, index);
    return beginJob(reply, topic.status, key, false, () =>
      jobs.submit(user.uid, 'regenerate', { uid: user.uid, courseId, topicId, segmentId, prompt: body.data.prompt, lockKey: key }),
    );
  });

  // Retry a failed segment (no usable segment yet) from its stored draft and errors.
  app.post('/api/courses/:id/topics/:topicId/segments/:segmentId/retry', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const params = request.params as { id: string; topicId: string; segmentId: string };
    const courseId = safeId(params.id, 'course');
    const topicId = safeId(params.topicId, 'topic');
    const segmentId = safeId(params.segmentId, 'segment');
    const course = assembleCourse(store, user.uid, courseId);
    const topic = course?.topics.find((item) => item.id === topicId);
    const index = topic?.segments.findIndex((item) => item.id === segmentId) ?? -1;
    if (!topic || index < 0) throw httpError(404, 'Not found');
    const key = lockKey(courseId, topicId, index);
    return beginJob(reply, topic.status, key, false, () =>
      jobs.submit(user.uid, 'retrySegment', { uid: user.uid, courseId, topicId, segmentId, lockKey: key }),
    );
  });

  // Queue an idle lesson. It renders after the one already running.
  app.post('/api/courses/:id/topics/:topicId/render', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const params = request.params as { id: string; topicId: string };
    const courseId = safeId(params.id, 'course');
    const topicId = safeId(params.topicId, 'topic');
    const course = assembleCourse(store, user.uid, courseId);
    const topic = course?.topics.find((item) => item.id === topicId);
    if (!topic) throw httpError(404, 'Not found');
    if (topic.status !== 'idle') throw httpError(409, 'This lesson is already in the pipeline.');
    const key = lockKey(courseId, topicId, -1);
    return beginJob(reply, topic.status, key, true, () =>
      jobs.submit(user.uid, 'renderTopic', { uid: user.uid, courseId, topicId, lockKey: key }),
    );
  });

  // Retry a whole topic (for example when its lesson draft failed).
  app.post('/api/courses/:id/topics/:topicId/retry', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const params = request.params as { id: string; topicId: string };
    const courseId = safeId(params.id, 'course');
    const topicId = safeId(params.topicId, 'topic');
    const course = assembleCourse(store, user.uid, courseId);
    const topic = course?.topics.find((item) => item.id === topicId);
    if (!topic) throw httpError(404, 'Not found');
    const key = lockKey(courseId, topicId, -1);
    return beginJob(reply, topic.status, key, true, () =>
      jobs.submit(user.uid, 'retryTopic', { uid: user.uid, courseId, topicId, lockKey: key }),
    );
  });

  app.get('/api/renders/:blobId', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { blobId } = request.params as { blobId: string };
    const found = storage.get(user.uid, safeId(blobId, 'render'));
    if (!found) throw httpError(404, 'Not found');
    return reply.type(found.blob.content_type).send(found.data);
  });
};
