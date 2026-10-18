import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, expect, it } from 'vitest';
import { chapterPath, lessonPath, noteChapter, noteCourse, noteLesson, progressPath } from '@krayon/pipeline';
import { buildApp } from '../src/index.js';
import { createContext } from '../src/context.js';
import { settings } from '../src/config.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  settings.caps.uploadsPerVisitorDay = 0;
  settings.caps.coursesGlobalDay = 0;
  settings.caps.lessonRendersGlobalDay = 0;
  settings.caps.regeneratesGlobalDay = 0;
  settings.caps.askGlobalDay = 0;
});

const pdfOf = async () => {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]).drawText('Page', { x: 20, y: 100 });
  return Buffer.from(await doc.save());
};

const form = (pdf: Buffer) => {
  const boundary = '----krayonshared';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, boundary };
};

const appFor = async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-shared-'));
  dirs.push(dir);
  const ctx = createContext({ dataDir: dir, quiet: true });
  ctx.adcFailure = async () => null;
  const app = await buildApp(ctx);
  return { app, ctx };
};

it('visitor B lists, opens, and keeps progress apart from A', async () => {
  const { app, ctx } = await appFor();
  await noteCourse(ctx.store, 'A', 'course-a', { status: 'ready', stage: 'done', title: 'From A', createdAt: 1 });
  await ctx.store.set(chapterPath('A', 'course-a', 'ch'), { index: 0, title: 'Ch', status: 'ready' });
  await noteChapter(ctx.store, 'A', 'course-a', 'ch');
  await ctx.store.set(lessonPath('A', 'course-a', 'les'), {
    courseId: 'course-a',
    chapterId: 'ch',
    index: 0,
    title: 'Les',
    status: 'ready',
    explanationSummary: 'Script',
    studyDoc: 'Notes',
  });
  await noteLesson(ctx.store, 'A', 'course-a', 'ch', 'les');

  const listed = await app.inject({ method: 'GET', url: '/api/courses', headers: { 'x-user-id': 'B' } });
  expect(listed.statusCode).toBe(200);
  expect(listed.json().courses.some((course: { id: string; ownerUid?: string }) => course.id === 'course-a')).toBe(true);

  const opened = await app.inject({ method: 'GET', url: '/api/courses/course-a', headers: { 'x-user-id': 'B' } });
  expect(opened.statusCode).toBe(200);
  expect(opened.json().ownerUid).toBe('A');

  const saved = await app.inject({
    method: 'PUT',
    url: '/api/lessons/les/progress',
    headers: { 'x-user-id': 'B', 'content-type': 'application/json' },
    payload: { watched: true, positionFrame: 10 },
  });
  expect(saved.statusCode).toBe(200);
  expect((await ctx.store.get(progressPath('B', 'les')))?.data.watched).toBe(true);
  expect(await ctx.store.get(progressPath('A', 'les'))).toBeNull();

  const study = await app.inject({
    method: 'PUT',
    url: '/api/docs/users/B/state/study',
    headers: { 'x-user-id': 'B', 'content-type': 'application/json' },
    payload: { marks: {} },
  });
  expect(study.statusCode).toBe(200);
  expect((await ctx.store.get('users/B/state/study'))?.data.marks).toEqual({});
  await app.close();
});

it('docs rejects a course path and another visitor state', async () => {
  const { app } = await appFor();
  const course = await app.inject({
    method: 'PUT',
    url: '/api/docs/users/B/courses/c',
    headers: { 'content-type': 'application/json' },
    payload: { status: 'ready' },
  });
  expect(course.statusCode).toBe(403);
  const other = await app.inject({
    method: 'GET',
    url: '/api/docs/users/A/state/study',
    headers: { 'x-user-id': 'B' },
  });
  expect(other.statusCode).toBe(403);
  await app.close();
});

it('a second course hits the daily cap', async () => {
  settings.caps.uploadsPerVisitorDay = 5;
  settings.caps.coursesGlobalDay = 1;
  const { app, ctx } = await appFor();
  ctx.pipeline.runCourse = async () => undefined;
  const pdf = await pdfOf();
  const body = form(pdf);
  const first = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: { 'content-type': `multipart/form-data; boundary=${body.boundary}` },
    payload: body.payload,
  });
  expect(first.statusCode).toBe(200);
  const second = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: { 'content-type': `multipart/form-data; boundary=${body.boundary}` },
    payload: body.payload,
  });
  expect(second.statusCode).toBe(429);
  expect(second.json()).toMatchObject({ code: 'demo_limit' });
  await app.close();
});

it('a rejected dispatch is 503', async () => {
  const { app, ctx } = await appFor();
  await noteCourse(ctx.store, 'local-user', 'c', { status: 'writing', stage: 'chapters' });
  ctx.jobs.submit = () => {
    throw Object.assign(new Error('queue down'), { statusCode: 503 });
  };
  const result = await app.inject({ method: 'POST', url: '/api/courses/c/retry' });
  expect(result.statusCode).toBe(503);
  await app.close();
});

it('a ready lesson render does not count against the cap', async () => {
  settings.caps.lessonRendersGlobalDay = 1;
  const { app, ctx } = await appFor();
  await noteCourse(ctx.store, 'local-user', 'c', { status: 'ready', stage: 'done' });
  await ctx.store.set(chapterPath('local-user', 'c', 'ch'), { index: 0, title: 'Ch', status: 'ready' });
  await noteChapter(ctx.store, 'local-user', 'c', 'ch');
  await ctx.store.set(lessonPath('local-user', 'c', 'les'), { chapterId: 'ch', index: 0, title: 'Les', status: 'ready', explanationSummary: 'S' });
  await noteLesson(ctx.store, 'local-user', 'c', 'ch', 'les');
  const first = await app.inject({ method: 'POST', url: '/api/lessons/les/render' });
  const second = await app.inject({ method: 'POST', url: '/api/lessons/les/render' });
  expect(first.statusCode).toBe(200);
  expect(second.statusCode).toBe(200);
  expect(first.json().jobId).toBeNull();
  const usage = await ctx.store.list('usage');
  expect(usage).toEqual([]);
  await app.close();
});
