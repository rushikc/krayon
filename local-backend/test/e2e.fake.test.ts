import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { audioKey, keyframeKey } from '@krayon/pipeline';
import { mediaId } from '@krayon/shared';
import { fakeModel } from '../../packages/pipeline/test/fixtures/fakeModel.ts';
import { PDFDocument } from 'pdf-lib';
import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../src/index.js';
import { createContext } from '../src/context.js';
import type { KrayonContext } from '../src/context.js';
import type { LocalStorage } from '../src/services/storage.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const pdfOf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) doc.addPage([200, 200]).drawText(`Page ${index + 1}`, { x: 20, y: 100 });
  return Buffer.from(await doc.save());
};

const wavBytes = () => {
  const samples = 2400;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + samples * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(24000, 24);
  data.writeUInt32LE(48000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples * 2, 40);
  return data;
};

const multipart = (pdf: Buffer) => {
  const boundary = '----krayonfake';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    pdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, boundary };
};

type CourseBody = {
  status?: string;
  error?: string | null;
  chapters?: Array<{ lessons: Array<{ id: string; status: string; title: string }> }>;
};

it('runs a course on fakes: structure, chapters, auto-render, click-to-render, and audio range', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-fake-'));
  dirs.push(dir);
  let storage: LocalStorage | undefined;
  const wav = wavBytes();
  const ctx: KrayonContext = createContext({
    dataDir: dir,
    quiet: true,
    model: fakeModel,
    tts: {
      voice: async (uid, narration) => {
        const key = audioKey(uid, createHash('sha256').update(narration).digest('hex'));
        await storage!.put(key, wav, { contentType: 'audio/wav' });
        return { blobId: mediaId(key), hash: 'fake', seconds: 0.1, voice: 'en-US-Chirp3-HD-Charon', rate: 1, format: 'wav' };
      },
      health: async () => ({ ok: true }),
      clear: () => undefined,
    },
    renderer: {
      renderKeyframes: async (owner, segment, _priority, fields) => {
        const lessonId = String(fields?.lessonId ?? segment.id);
        const key = keyframeKey(owner, lessonId, segment.id, 1, 1, 0);
        await storage!.put(key, Uint8Array.of(1, 2, 3), { contentType: 'image/png' });
        return { frames: [0], keyframeIds: [mediaId(key)] };
      },
      warmup: async () => undefined,
      health: () => ({ ok: true }),
      close: async () => undefined,
      clear: () => undefined,
    },
  });
  storage = ctx.storage;
  ctx.adcFailure = async () => null;
  const app = await buildApp(ctx);

  const pdf = await pdfOf(2);
  const form = multipart(pdf);
  const created = await app.inject({
    method: 'POST',
    url: '/api/courses',
    headers: { 'content-type': `multipart/form-data; boundary=${form.boundary}` },
    payload: form.payload,
  });
  expect(created.statusCode).toBe(200);
  const courseId = created.json().courseId as string;

  const course = async () => (await app.inject({ method: 'GET', url: `/api/courses/${courseId}` })).json() as CourseBody;
  const deadline = Date.now() + 20_000;
  let body = await course();
  while (Date.now() < deadline) {
    body = await course();
    const lessons = body.chapters?.[0]?.lessons ?? [];
    if (body.status === 'failed') throw new Error(body.error ?? 'course failed');
    if (lessons[0]?.status === 'ready' && lessons[1]?.status === 'outlined') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const lessons = body.chapters?.[0]?.lessons ?? [];
  expect(lessons.map((lesson) => lesson.status), JSON.stringify(body)).toEqual(['ready', 'outlined']);

  const clicked = await app.inject({ method: 'POST', url: `/api/lessons/${lessons[1]!.id}/render` });
  expect(clicked.statusCode).toBe(200);
  while (Date.now() < deadline) {
    body = await course();
    if (body.chapters?.[0]?.lessons[1]?.status === 'ready') break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(body.chapters?.[0]?.lessons[1]?.status).toBe('ready');

  const detail = (await app.inject({ method: 'GET', url: `/api/lessons/${lessons[0]!.id}` })).json() as {
    segments: Array<{ audioUrl?: string }>;
  };
  const audioUrl = detail.segments.find((segment) => segment.audioUrl)?.audioUrl;
  expect(audioUrl).toMatch(/^\/api\/audio\//);
  const partial = await app.inject({ method: 'GET', url: audioUrl!, headers: { range: 'bytes=0-3' } });
  expect(partial.statusCode).toBe(206);
  expect(partial.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
  await app.close();
});
