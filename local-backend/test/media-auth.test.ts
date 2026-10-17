import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mediaId } from '@krayon/shared';
import { afterEach, expect, it } from 'vitest';
import { buildApp } from '../src/index.js';
import { createContext } from '../src/context.js';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const appFor = async () => {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'krayon-media-'));
  dirs.push(dataDir);
  const ctx = createContext({ dataDir, quiet: true });
  ctx.adcFailure = async () => null;
  const key = 'users/local-user/audio/clip.wav';
  await ctx.storage.put(key, Buffer.from('RIFF'), { contentType: 'audio/wav' });
  const render = 'users/local-user/keyframes/l/s/a1-r1-0.png';
  await ctx.storage.put(render, Buffer.from('png'), { contentType: 'image/png' });
  const app = await buildApp(ctx);
  return { app, audioId: mediaId(key), renderId: mediaId(render) };
};

it('rejects audio ?token= when no Authorization header is sent', async () => {
  const { app, audioId } = await appFor();
  const response = await app.inject({ method: 'GET', url: `/api/audio/${audioId}?token=abc` });
  expect(response.statusCode).toBe(401);
  await app.close();
});

it('serves a render with ?token= and no Authorization header', async () => {
  const { app, renderId } = await appFor();
  const response = await app.inject({ method: 'GET', url: `/api/renders/${renderId}?token=abc` });
  expect(response.statusCode).toBe(200);
  await app.close();
});
