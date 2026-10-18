import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { assembleCourse, courseViewPath, listCourses as loadCourses, locateChapter, locateCourse, noteCourse, reserveUsage, sourceKey, DemoLimitError } from '@krayon/pipeline';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { httpError } from '../errors.js';
import { assertCourseFile, readUpload } from './uploads.js';

const idPattern = /^[A-Za-z0-9_-]+$/;

export const safeId = (value: string, label: string) => {
  if (!idPattern.test(value)) throw httpError(400, `Invalid ${label}`);
  return value;
};

const userOf = (deps: ApiDeps, request: FastifyRequest) => deps.auth.currentUser(authHeader(request));

const guard = async (deps: ApiDeps, kind: 'upload' | 'course' | 'render' | 'regenerate' | 'ask', uid: string) => {
  try {
    await reserveUsage(deps.docs, kind, deps.caps, uid);
  } catch (error) {
    if (error instanceof DemoLimitError) throw error;
    throw error;
  }
};

export const registerCourseJobs = (deps: ApiDeps) => {
  const str = (value: unknown) => String(value ?? '');
  deps.jobs.register('course', async (payload) => {
    await deps.pipeline.runCourse(str(payload.uid), str(payload.courseId));
    return { courseId: payload.courseId };
  });
  deps.jobs.register('resumeCourse', async (payload) => {
    await deps.pipeline.resumeCourse(str(payload.uid), str(payload.courseId));
  });
  deps.jobs.register('retryCourse', async (payload) => {
    await deps.pipeline.retryCourse(str(payload.uid), str(payload.courseId));
  });
  deps.jobs.register('retryChapter', async (payload) => {
    await deps.pipeline.retryChapter(str(payload.uid), str(payload.chapterId));
  });
};

export const createCourse = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const files: Array<{ name: string; type: string; data: Buffer }> = [];
  for await (const part of request.files()) {
    const file = await readUpload(part, deps.maxUploadBytes);
    assertCourseFile(file.type);
    files.push(file);
  }
  if (files.length === 0) throw httpError(422, 'file is required');
  await guard(deps, 'upload', user.uid);
  await guard(deps, 'course', user.uid);
  const adcError = await deps.adcFailure();
  if (adcError) {
    reply.code(503).send({ detail: adcError });
    return;
  }
  (request as { uploadLog?: unknown }).uploadLog = {
    files: files.map((file) => ({ field: 'file', filename: file.name, content_type: file.type, size: file.data.length })),
  };
  const courseId = randomUUID().replace(/-/g, '');
  const sources = [];
  for (const [index, file] of files.entries()) {
    const key = sourceKey(user.uid, courseId, index, file.name, file.type);
    const stat = await deps.blobs.put(key, file.data, { contentType: file.type });
    const source = { id: key, name: file.name, content_type: file.type, size: stat.size, path: key };
    await deps.docs.set(`users/${user.uid}/uploads/${key.split('/').pop()}`, source);
    sources.push(source);
  }
  await noteCourse(deps.docs, user.uid, courseId, {
    owner: user.uid,
    status: 'created',
    stage: 'structure',
    fileNames: sources.map((source) => source.name),
    sources,
    error: null,
    createdAt: Date.now(),
  });
  deps.events.emit({ type: 'course.created', courseId, flow: 'course', step: 'created' });
  const jobId = await deps.jobs.submit(user.uid, 'course', { uid: user.uid, courseId });
  return { courseId, jobId };
};

export const listCourses = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  return { courses: await loadCourses(deps.docs, user.uid) };
};

const courseOf = async (deps: ApiDeps, viewerUid: string, id: string) => {
  const courseId = safeId(id, 'course');
  const located = await locateCourse(deps.docs, courseId);
  if (!located) throw httpError(404, 'Not found');
  const course = await assembleCourse(deps.docs, located.ownerUid, courseId, viewerUid);
  if (!course) throw httpError(404, 'Not found');
  return { ...course, ownerUid: located.ownerUid };
};

export const getCourse = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  const course = await courseOf(deps, user.uid, (request.params as { id: string }).id);
  await deps.docs.set(courseViewPath(course.id), { lastViewedAt: Date.now() }, { merge: true });
  return course;
};

export const getChapters = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  return { chapters: (await courseOf(deps, user.uid, (request.params as { id: string }).id)).chapters };
};

export const retryCourse = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = userOf(deps, request);
  const course = await courseOf(deps, user.uid, (request.params as { id: string }).id);
  return { jobId: await deps.jobs.submit(user.uid, 'retryCourse', { uid: course.ownerUid, courseId: course.id }) };
};

export const retryChapter = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = userOf(deps, request);
  const chapterId = safeId((request.params as { id: string }).id, 'chapter');
  const found = await locateChapter(deps.docs, user.uid, chapterId);
  if (!found) throw httpError(404, 'Not found');
  if (found.doc.data.status === 'writing') return reply.code(409).send({ error: 'busy', reason: 'Still writing' });
  return { jobId: await deps.jobs.submit(user.uid, 'retryChapter', { uid: found.ownerUid, courseId: found.courseId, chapterId }) };
};
