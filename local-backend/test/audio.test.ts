import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { afterEach, expect, it } from 'vitest';
import { sendBytes } from '../src/routes/bytes.js';
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
  const blob = storage.put('local-user', 'narration.wav', 'audio/wav', payload);
  const app = Fastify();
  app.get('/api/audio/:blobId', async (request, reply) => {
    const user = auth.currentUser(request.headers['x-user-id']);
    const { blobId } = request.params as { blobId: string };
    const found = storage.get(user.uid, blobId);
    if (!found) return reply.code(404).send({ detail: 'Not found' });
    const range = request.headers.range;
    return sendBytes(reply, Buffer.from(found.data), typeof range === 'string' ? range : undefined, 'audio/wav');
  });
  const partial = await app.inject({ method: 'GET', url: `/api/audio/${blob.id}`, headers: { range: 'bytes=0-3' } });
  expect(partial.statusCode).toBe(206);
  expect(partial.headers['accept-ranges']).toBe('bytes');
  expect(partial.headers['content-range']).toBe(`bytes 0-3/${payload.length}`);
  expect(partial.headers['content-type']).toContain('audio/wav');
  expect(partial.rawPayload).toEqual(payload.subarray(0, 4));
  const bad = await app.inject({ method: 'GET', url: `/api/audio/${blob.id}`, headers: { range: 'bytes=80-90' } });
  expect(bad.statusCode).toBe(416);
  expect(bad.headers['content-range']).toBe(`bytes */${payload.length}`);
  await app.close();
});

it('reset clears tts cache docs and audio blobs', () => {
  const dir = temp();
  const store = new LocalDocStore(path.join(dir, 'db.sqlite3'));
  const storage = new LocalStorage(path.join(dir, 'storage'));
  store.set('users/u/ttsCache/abc', { blobId: 'blob-1', seconds: 2 });
  store.set('users/u/courses/c', { status: 'ready' });
  const blob = storage.put('u', 'clip.wav', 'audio/wav', Buffer.from('wav'));
  expect(storage.get('u', blob.id)?.data.toString()).toBe('wav');
  store.clear();
  expect(storage.clear().files).toBe(1);
  expect(store.get('users/u/ttsCache/abc')).toBeNull();
  expect(store.list('users/u/ttsCache')).toEqual([]);
  expect(storage.get('u', blob.id)).toBeNull();
});

it('puts a voicing segment back to pending after a restart', () => {
  const dir = temp();
  const store = new LocalDocStore(path.join(dir, 'db.sqlite3'));
  const course = 'users/u/courses/c';
  store.set(`${course}/lessons/c-c1-l1/segments/s01`, { status: 'pending', voice: 'voicing' });
  store.set(`${course}/lessons/c-c1-l1/segments/s02`, { status: 'ready', voice: 'voiced' });
  store.recoverInterrupted();
  expect(store.get(`${course}/lessons/c-c1-l1/segments/s01`)?.data).toMatchObject({ status: 'pending', voice: 'pending' });
  expect(store.get(`${course}/lessons/c-c1-l1/segments/s02`)?.data).toMatchObject({ status: 'ready', voice: 'voiced' });
});
