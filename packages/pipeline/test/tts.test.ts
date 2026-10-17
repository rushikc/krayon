import { SEGMENT_FRAMES, framesForAudio } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { classifyTtsFailure, createTts, ttsHash, wavSeconds } from '../src/tts.js';
import type { Priority } from '../src/queue.js';
import { memoryBlobs, quietLog } from './helpers.js';

const wavBytes = (seconds: number, sampleRate = 24000) => {
  const samples = Math.round(seconds * sampleRate);
  const dataBytes = samples * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
};

const priority: Priority = { userClicked: true, courseId: 'c' };

describe('wavSeconds', () => {
  it('reads duration from the data chunk', () => {
    expect(wavSeconds(wavBytes(2.5))).toBeCloseTo(2.5, 5);
    expect(framesForAudio(2.5)).toBe(SEGMENT_FRAMES.min);
    expect(framesForAudio(8)).toBe(Math.ceil((8 + 0.6) * 30));
  });
});

describe('classifyTtsFailure', () => {
  it('maps status codes', () => {
    expect(classifyTtsFailure(429, '')).toBe('QUOTA');
    expect(classifyTtsFailure(403, 'PERMISSION_DENIED')).toBe('AUTH');
    expect(classifyTtsFailure(400, 'INVALID_ARGUMENT')).toBe('INVALID');
    expect(classifyTtsFailure(500, 'nope')).toBe('UPSTREAM');
    expect(classifyTtsFailure(408, 'timeout')).toBe('TIMEOUT');
  });
});

describe('tts cache', () => {
  const config = { enabled: true, voice: 'en-US-Chirp3-HD-Charon', rate: 1, concurrency: 2, quotaProject: 'krayon-ai' };

  it('does not call the API on a hit, and synthesizes again when the file is gone', async () => {
    const storage = memoryBlobs();
    const logs: unknown[] = [];
    let calls = 0;
    const audio = wavBytes(1.25);
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ audioContent: audio.toString('base64') }), { status: 200 });
    }) as typeof fetch;
    const tts = createTts(config, { ...quietLog, info: (_message, fields) => logs.push(fields) }, {
      blobs: storage,
      fetch: fetchImpl,
      token: async () => 'token',
      sleep: async () => undefined,
    });
    const first = await tts.voice('u', 'Hello there.', priority);
    const second = await tts.voice('u', 'Hello there.', priority);
    expect(calls).toBe(1);
    expect(second).toMatchObject({ blobId: first.blobId, hash: ttsHash(config.voice, config.rate, 'Hello there.'), seconds: 1.25 });
    storage.files.clear();
    const third = await tts.voice('u', 'Hello there.', priority);
    expect(calls).toBe(2);
    expect(third.blobId).toBe(first.blobId);
    expect(JSON.stringify(logs)).not.toContain('audioContent');
    expect(logs.some((fields) => JSON.stringify(fields).includes(audio.toString('base64').slice(0, 40)))).toBe(false);
  });

  it('does not retry an auth failure', async () => {
    const storage = memoryBlobs();
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('PERMISSION_DENIED', { status: 403 });
    }) as typeof fetch;
    const tts = createTts(config, quietLog, { blobs: storage, fetch: fetchImpl, token: async () => 'token', sleep: async () => undefined });
    await expect(tts.voice('u', 'Hello.', priority)).rejects.toMatchObject({ code: 'AUTH' });
    expect(calls).toBe(1);
  });
});
