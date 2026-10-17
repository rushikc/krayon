import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { mediaId } from '@krayon/shared';
import { afterEach, expect, it } from 'vitest';
import { sendBytes } from '@krayon/api';
import { LocalDocStore } from '../src/services/docstore.js';
import { LocalStorage } from '../src/services/storage.js';
import { auth } from '../src/services/auth.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'krayon-audio-'));
  dirs.push(dir);
  return dir;
};

it('GET /api/audio returns 206 for a Range request and 416 for a bad one', async () => {
  const dir = temp();
  const storage = new LocalStorage(path.join(dir, 'storage'));
  const payload = Buffer.from('RIFF-audio-bytes-0123456789');
  const key = 'users/local-user/audio/narration.wav';
  await storage.put(key, payload, { contentType: 'audio/wav' });
  const id = mediaId(key);
  const app = Fastify();
  app.get('/api/audio/:blobId', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { blobId } = request.params as { blobId: string };
    const decoded = blobId === id ? key : '';
    if (!decoded.startsWith(`users/${user.uid}/`)) return reply.code(404).send({ detail: 'Not found' });
    const found = await storage.get(decoded);
    if (!found) return reply.code(404).send({ detail: 'Not found' });
    const range = request.headers.range;
    return sendBytes(reply, Buffer.from(found.data), typeof range === 'string' ? range : undefined, 'audio/wav');
  });
  const partial = await app.inject({ method: 'GET', url: `/api/audio/${id}`, headers: { range: 'bytes=0-3' } });
  expect(partial.statusCode).toBe(206);
  expect(partial.headers['accept-ranges']).toBe('bytes');
  expect(partial.headers['content-range']).toBe(`bytes 0-3/${payload.length}`);
  expect(partial.headers['content-type']).toContain('audio/wav');
  expect(partial.rawPayload).toEqual(payload.subarray(0, 4));
  const bad = await app.inject({ method: 'GET', url: `/api/audio/${id}`, headers: { range: 'bytes=80-90' } });
  expect(bad.statusCode).toBe(416);
  expect(bad.headers['content-range']).toBe(`bytes */${payload.length}`);
  await app.close();
});

it('reset clears docs and audio blobs', async () => {
  const dir = temp();
  const store = new LocalDocStore(path.join(dir, 'db.sqlite3'));
  const storage = new LocalStorage(path.join(dir, 'storage'));
  await store.set('users/u/courses/c', { status: 'ready' });
  const key = 'users/u/audio/clip.wav';
  await storage.put(key, Buffer.from('wav'), { contentType: 'audio/wav' });
  expect((await storage.get(key))?.data.toString()).toBe('wav');
  await store.clear();
  expect((await storage.clear()).files).toBe(1);
  expect(await store.get('users/u/courses/c')).toBeNull();
  expect(await store.list('users/u/courses')).toEqual([]);
  expect(await storage.get(key)).toBeNull();
});

it('puts a voicing segment back to pending after a restart', async () => {
  const dir = temp();
  const store = new LocalDocStore(path.join(dir, 'db.sqlite3'));
  const course = 'users/u/courses/c';
  await store.set(`${course}/lessons/c-c1-l1/segments/s01`, { status: 'pending', voice: 'voicing' });
  await store.set(`${course}/lessons/c-c1-l1/segments/s02`, { status: 'ready', voice: 'voiced' });
  await store.recoverInterrupted();
  expect((await store.get(`${course}/lessons/c-c1-l1/segments/s01`))?.data).toMatchObject({ status: 'pending', voice: 'pending' });
  expect((await store.get(`${course}/lessons/c-c1-l1/segments/s02`))?.data).toMatchObject({ status: 'ready', voice: 'voiced' });
});
