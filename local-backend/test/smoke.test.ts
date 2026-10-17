import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = path.join(process.env.HOME ?? '', 'Desktop');
const SAMPLE_PDF = path.join(DESKTOP, 'Software-Client-Server-and-REST-APIs', 'Client-Server-and-REST-APIs-Lecture-Handout-CS230.pdf');
const SAMPLE_JPG = path.join(DESKTOP, 'Economics-Supply-and-Demand', 'Handwritten-Notes-Supply-Demand-Basics.jpg');
const AI = process.env.AI !== '0';

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
    env: { ...process.env, DATA_DIR: tmp, PORT: String(port), LOG_LEVEL: 'WARNING' },
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
  expect(result.body.ok).toBe(true);
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

it('upload stored as doc', async () => {
  const result = await req('GET', `/api/docs/users/local-user/uploads/${upload.id}`);
  expect(result.status).toBe(200);
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
  const d = '/api/docs/users/local-user/smoke';
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

it('job ingest -> done', async () => {
  const created = await req('POST', '/api/jobs', { kind: 'ingest', payload: { uploadId: upload.id } });
  expect(created.status).toBe(200);
  let status = '';
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = await req('GET', `/api/jobs/${created.body.id}`);
    status = String(asRecord(job.body.data).status);
    if (status === 'done' || status === 'error') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  expect(status).toBe('done');
});

it('job unknown kind -> 400', async () => {
  expect((await req('POST', '/api/jobs', { kind: 'nope' })).status).toBe(400);
});

it('job other user -> 404', async () => {
  expect((await req('GET', '/api/jobs/doesnotexist', undefined, { 'X-User-Id': 'bob' })).status).toBe(404);
});

it.skipIf(!AI)('AI plain prompt (no schema)', async () => {
  const result = await req('POST', '/api/ai/generate', {
    prompt: 'Reply with a JSON object {"answer": <the capital of France>}',
  });
  expect(result.status).toBe(200);
  expect(String(result.body.text).toLowerCase()).toContain('paris');
});

it.skipIf(!AI)('AI structured (real roadmap schema)', async () => {
  const schemas = JSON.parse(await readFile(path.join(ROOT, 'test/fixtures/ai_schemas.json'), 'utf8')) as {
    roadmap: Record<string, unknown>;
    lesson: Record<string, unknown>;
  };
  const result = await req('POST', '/api/ai/generate', {
    prompt: 'Give 3 study topics about photosynthesis with ids in kebab-case.',
    responseSchema: schemas.roadmap,
  });
  expect(result.status).toBe(200);
  const topics = (JSON.parse(String(result.body.text)) as { topics: Array<{ id: string }> }).topics;
  expect(topics.length).toBeGreaterThanOrEqual(1);
  expect(topics.every((topic) => topic.id)).toBe(true);
});

it.skipIf(!AI)('AI roadmap from real PDF', async () => {
  const schemas = JSON.parse(await readFile(path.join(ROOT, 'test/fixtures/ai_schemas.json'), 'utf8')) as {
    roadmap: Record<string, unknown>;
  };
  let exists = true;
  try {
    await readFile(SAMPLE_PDF);
  } catch {
    exists = false;
  }
  expect(exists).toBe(true);
  const result = await req('POST', '/api/ai/generate', {
    uploadId: upload.id,
    responseSchema: schemas.roadmap,
    model: 'gemini-2.5-flash',
    prompt: 'Read the attached document and split it into a study roadmap of 3 to 7 topics. Each id is unique kebab-case.',
  });
  expect(result.status).toBe(200);
  const topics = (JSON.parse(String(result.body.text)) as { topics: Array<{ title: string }> }).topics;
  expect(topics.length).toBeGreaterThanOrEqual(3);
  expect(topics.length).toBeLessThanOrEqual(7);
});

it.skipIf(!AI)('AI lesson from real JPG photo (real lesson schema)', async () => {
  const schemas = JSON.parse(await readFile(path.join(ROOT, 'test/fixtures/ai_schemas.json'), 'utf8')) as {
    lesson: Record<string, unknown>;
  };
  const bytes = await readFile(SAMPLE_JPG);
  const uploaded = await multipart('/api/uploads', path.basename(SAMPLE_JPG), bytes, 'image/jpeg');
  const result = await req('POST', '/api/ai/generate', {
    uploadId: uploaded.body.id,
    responseSchema: schemas.lesson,
    prompt:
      'Create a short lesson (3 to 5 segments, durationInFrames 90-240) grounded only in the attached photo of notes. studyDoc is markdown notes.',
  });
  expect(result.status).toBe(200);
  const lesson = JSON.parse(String(result.body.text)) as { segments: Array<{ scene: unknown }> };
  expect(lesson.segments.length).toBeGreaterThanOrEqual(1);
  expect(lesson.segments.every((segment) => segment.scene)).toBe(true);
});

it.skipIf(!AI)('AI missing upload -> 404', async () => {
  expect((await req('POST', '/api/ai/generate', { prompt: 'x', uploadId: 'nope' })).status).toBe(404);
});

it.skipIf(!AI)('AI bad model -> 502', async () => {
  expect((await req('POST', '/api/ai/generate', { prompt: 'hi', model: 'no-such-model-xyz' })).status).toBe(502);
});

it.skipIf(!AI)('AI missing prompt -> 422', async () => {
  expect((await req('POST', '/api/ai/generate', {})).status).toBe(422);
});

it('admin reset wipes docs + files', async () => {
  await multipart('/api/uploads', 'r.txt', Buffer.from('hello'), 'text/plain');
  await req('PUT', '/api/docs/users/local-user/smoke/r', { x: 1 });
  const reset = await req('POST', '/api/admin/reset');
  expect(reset.status).toBe(200);
  const smoke = await req('GET', '/api/docs/users/local-user/smoke');
  const uploads = await req('GET', '/api/docs/users/local-user/uploads');
  expect(smoke.body.docs).toEqual([]);
  expect(uploads.body.docs).toEqual([]);
  expect((await req('GET', '/api/docs/users/local-user/smoke/r')).status).toBe(404);
  expect((await multipart('/api/uploads', 'r2.txt', Buffer.from('hi'), 'text/plain')).status).toBe(200);
  const removed = reset.body.removed as { files: number; documents: number };
  expect(removed.files).toBeGreaterThanOrEqual(1);
  expect(removed.documents).toBeGreaterThanOrEqual(2);
  await req('POST', '/api/admin/reset');
});
