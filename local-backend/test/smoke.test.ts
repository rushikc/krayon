import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chapterPath, lessonPath, noteChapter, noteCourse, noteLesson } from '@krayon/pipeline';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { LocalDocStore } from '../src/services/docstore.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.join(process.env.HOME ?? '', 'Desktop');
const SAMPLE_PDF = path.join(DESKTOP, 'Software-Client-Server-and-REST-APIs', 'Client-Server-and-REST-APIs-Lecture-Handout-CS230.pdf');

let proc: ChildProcess | undefined;
let base = '';
let tmp = '';

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });

const req = async (method: string, urlPath: string, body?: unknown, headers?: Record<string, string>, raw?: BodyInit) => {
  const init: RequestInit = { method, headers: { ...(headers ?? {}) } };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  } else if (raw !== undefined) {
    init.body = raw;
  }
  const response = await fetch(base + urlPath, init);
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: response.status, body: parsed as Record<string, unknown> };
};

const multipart = async (urlPath: string, name: string, content: Buffer, ctype: string) => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type: ctype }), name);
  const response = await fetch(base + urlPath, { method: 'POST', body: form });
  const parsed = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body: parsed };
};

beforeAll(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'krayon-smoke-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(path.resolve(ROOT, '../node_modules/.bin/tsx'), ['src/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, DATA_DIR: tmp, LOG_DIR: tmp, PORT: String(port), LOG_LEVEL: 'WARNING', TTS_ENABLED: 'false' },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const health = await fetch(`${base}/api/health`);
      if (health.ok) return;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`backend did not start: ${last}`);
});

afterAll(async () => {
  proc?.kill('SIGTERM');
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

const asRecord = (value: unknown) => value as Record<string, unknown>;

it('health', async () => {
  const result = await req('GET', '/api/health');
  expect(result.status).toBe(200);
  expect(result.body.adc).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
  expect(result.body.renderer).toEqual(expect.objectContaining({ ok: expect.any(Boolean) }));
  expect(typeof result.body.model).toBe('string');
});

it('me (stub user)', async () => {
  const result = await req('GET', '/api/me');
  expect(result.status).toBe(200);
  expect(result.body.uid).toBe('local-user');
});

it('me with X-User-Id', async () => {
  const result = await req('GET', '/api/me', undefined, { 'X-User-Id': 'alice' });
  expect(result.body.uid).toBe('alice');
});

let upload: Record<string, unknown> = {};

it('upload valid PDF', async () => {
  let pdf = Buffer.from('%PDF-1.1\n%%EOF\n');
  try {
    pdf = Buffer.from(await readFile(SAMPLE_PDF));
  } catch {
    /* fixture fallback */
  }
  const result = await multipart('/api/uploads', 'lecture.pdf', pdf, 'application/pdf');
  upload = result.body;
  expect(result.status).toBe(200);
  expect(result.body.size).toBe(pdf.length);
  expect(result.body.content_type).toBe('application/pdf');
});

it('upload is not readable through the docs API', async () => {
  const result = await req('GET', `/api/docs/users/local-user/uploads/${upload.id}`);
  expect(result.status).toBe(403);
});

it('upload oversize -> 413', async () => {
  const result = await multipart('/api/uploads', 'big.pdf', Buffer.alloc(20 * 1024 * 1024 + 1), 'application/pdf');
  expect(result.status).toBe(413);
});

it('upload missing file -> 422', async () => {
  const result = await req('POST', '/api/uploads', undefined, { 'Content-Type': 'multipart/form-data; boundary=x' }, '');
  expect([400, 422]).toContain(result.status);
});

it('upload empty file -> 400', async () => {
  const result = await multipart('/api/uploads', 'empty.pdf', Buffer.alloc(0), 'application/pdf');
  expect(result.status).toBe(400);
});

it('doc put, get, merge, replace, list, delete', async () => {
  const d = '/api/docs/users/local-user/state';
  expect((await req('PUT', `${d}/a`, { x: 1, y: 2 })).status).toBe(200);
  const got = await req('GET', `${d}/a`);
  expect(got.status).toBe(200);
  expect(asRecord(got.body.data)).toEqual({ x: 1, y: 2 });
  await req('PUT', `${d}/a?merge=true`, { y: 3, z: 4 });
  expect(asRecord((await req('GET', `${d}/a`)).body.data)).toEqual({ x: 1, y: 3, z: 4 });
  await req('PUT', `${d}/a`, { only: true });
  expect(asRecord((await req('GET', `${d}/a`)).body.data)).toEqual({ only: true });
  await req('PUT', `${d}/b`, { n: 2 });
  const list = await req('GET', d);
  expect(list.status).toBe(200);
  const ids = (list.body.docs as Array<{ id: string }>).map((item) => item.id);
  expect(new Set(ids)).toEqual(new Set(['a', 'b']));
  const deleted = await req('DELETE', `${d}/a`);
  expect(deleted.body.deleted).toBe(true);
  expect((await req('GET', `${d}/a`)).status).toBe(404);
  expect((await req('GET', `${d}/nope`)).status).toBe(404);
  expect((await req('PUT', d, { x: 1 })).status).toBe(400);
  expect((await req('GET', '/api/docs/jobs/x')).status).toBe(403);
  expect((await req('PUT', '/api/docs/users/bob/smoke/a', { x: 1 })).status).toBe(403);
  expect([400, 403, 404]).toContain((await req('GET', '/api/docs/users/local-user/../bob/smoke/a')).status);
  await req('DELETE', `${d}/b`);
});

const seedLesson = async (status: string) => {
  const docs = new LocalDocStore(path.join(tmp, 'firestore.sqlite3'));
  await noteCourse(docs, 'local-user', 'smokec', { status: 'ready', stage: 'done', fileNames: ['n.pdf'], sources: [] });
  await docs.set(chapterPath('local-user', 'smokec', 'smokec-c1'), {
    index: 0,
    title: 'Chapter one',
    status: 'writing',
    pdfPageStart: 0,
    pdfPageEnd: 3,
  });
  await noteChapter(docs, 'local-user', 'smokec', 'smokec-c1');
  await docs.set(lessonPath('local-user', 'smokec', 'smokec-c1-l1'), {
    courseId: 'smokec',
    chapterId: 'smokec-c1',
    index: 0,
    title: 'Lesson one',
    status,
    explanationSummary: 'Script.',
    studyDoc: 'Notes.',
  });
  await noteLesson(docs, 'local-user', 'smokec', 'smokec-c1', 'smokec-c1-l1');
};

it('course, chapter, and lesson routes', async () => {
  await seedLesson('ready');
  const course = await req('GET', '/api/courses/smokec');
  expect(course.status).toBe(200);
  const chapters = course.body.chapters as Array<{ id: string; lessons: Array<{ id: string; status: string }> }>;
  expect(chapters.map((chapter) => chapter.id)).toEqual(['smokec-c1']);
  expect(chapters[0]?.lessons.map((lesson) => lesson.id)).toEqual(['smokec-c1-l1']);
  expect(((await req('GET', '/api/courses')).body.courses as Array<{ id: string }>).some((item) => item.id === 'smokec')).toBe(true);
  expect((await req('GET', '/api/courses/nope')).status).toBe(404);

  const lesson = await req('GET', '/api/lessons/smokec-c1-l1');
  expect(lesson.status).toBe(200);
  expect(lesson.body).toMatchObject({ chapterTitle: 'Chapter one', studyDoc: 'Notes.', segments: [], progress: null });
  expect((await req('GET', '/api/lessons/nope')).status).toBe(404);

  const ready = await req('POST', '/api/lessons/smokec-c1-l1/render', {});
  expect(ready.status).toBe(200);
  expect(ready.body.jobId).toBeNull();
  expect(asRecord(ready.body.lesson).status).toBe('ready');

  expect((await req('POST', '/api/chapters/smokec-c1/retry', {})).status).toBe(409);
  expect((await req('POST', '/api/chapters/nope/retry', {})).status).toBe(404);
});

it('lesson progress is saved and never unwatched', async () => {
  await seedLesson('ready');
  const first = await req('PUT', '/api/lessons/smokec-c1-l1/progress', { watched: true, positionFrame: 600 });
  expect(first.status).toBe(200);
  expect(first.body).toMatchObject({ watched: true, completed: false, positionFrame: 600 });
  const second = await req('PUT', '/api/lessons/smokec-c1-l1/progress', { watched: false, positionFrame: 30 });
  expect(second.body).toMatchObject({ watched: true, positionFrame: 30 });
  expect(asRecord((await req('GET', '/api/lessons/smokec-c1-l1')).body.progress)).toMatchObject({ watched: true, positionFrame: 30 });
  expect((await req('PUT', '/api/lessons/smokec-c1-l1/progress', { positionFrame: -5 })).status).toBe(422);
  expect((await req('PUT', '/api/lessons/nope/progress', { watched: true })).status).toBe(404);
});

it('ask validates the question and the lesson', async () => {
  await seedLesson('ready');
  expect((await req('POST', '/api/lessons/smokec-c1-l1/ask', { question: '', frame: 0 })).status).toBe(422);
  expect((await req('POST', '/api/lessons/nope/ask', { question: 'Why?', frame: 0 })).status).toBe(404);
});

it('admin reset wipes docs + files', async () => {
  await multipart('/api/uploads', 'r.txt', Buffer.from('hello'), 'text/plain');
  await req('PUT', '/api/docs/users/local-user/state/r', { x: 1 });
  const reset = await req('POST', '/api/admin/reset');
  expect(reset.status).toBe(200);
  const smoke = await req('GET', '/api/docs/users/local-user/state');
  const uploads = await req('GET', '/api/docs/users/local-user/uploads');
  expect(smoke.body.docs).toEqual([]);
  expect(uploads.status).toBe(403);
  expect((await req('GET', '/api/docs/users/local-user/state/r')).status).toBe(404);
  expect((await multipart('/api/uploads', 'r2.txt', Buffer.from('hi'), 'text/plain')).status).toBe(200);
  const removed = reset.body.removed as { files: number; documents: number };
  expect(removed.files).toBeGreaterThanOrEqual(1);
  expect(removed.documents).toBeGreaterThanOrEqual(2);
  await req('POST', '/api/admin/reset');
});
