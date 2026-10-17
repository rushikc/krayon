import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';

const AI = process.env.AI !== '0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE = path.join(
  process.env.HOME ?? '',
  'Desktop',
  'Economics-Supply-and-Demand',
  'Handwritten-Notes-Supply-Demand-Basics.jpg',
);

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

beforeAll(async () => {
  if (!AI) return;
  tmp = await mkdtemp(path.join(tmpdir(), 'krayon-pipeline-'));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(path.resolve(ROOT, '../node_modules/.bin/tsx'), ['src/index.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATA_DIR: tmp,
      PORT: String(port),
      LOG_LEVEL: 'INFO',
      MAX_REVIEW_ROUNDS: '1',
      RENDER_KEYFRAMES_MAX: '2',
      TOPIC_CONCURRENCY: '1',
    },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('pipeline server did not start');
});

afterAll(async () => {
  proc?.kill('SIGTERM');
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

it.skipIf(!AI)('upload, roadmap, one topic.ready, and a persisted keyframe round', async () => {
  const bytes = await readFile(SAMPLE);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), path.basename(SAMPLE));
  const created = await fetch(`${base}/api/courses`, { method: 'POST', body: form });
  expect(created.status).toBe(200);
  const { courseId } = (await created.json()) as { courseId: string };
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?courseId=${courseId}&uid=local-user`);
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for topic.ready')), 12 * 60 * 1000);
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { type: string; event?: { type: string } };
      if (message.type === 'event' && message.event?.type === 'topic.ready') {
        clearTimeout(timer);
        resolve();
      }
      if (message.type === 'event' && message.event?.type === 'course.done') {
        clearTimeout(timer);
        resolve();
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('websocket failed'));
    });
  });
  await ready;
  ws.close();
  const course = (await (await fetch(`${base}/api/courses/${courseId}`)).json()) as {
    roadmap: { topics: unknown[] } | null;
    topics: Array<{ status: string; segments: Array<{ rounds: Array<{ keyframeIds: string[] }> }> }>;
  };
  expect(course.roadmap?.topics.length).toBeGreaterThan(0);
  const finished = course.topics.find((topic) => topic.status === 'ready');
  expect(finished).toBeTruthy();
  const round = finished?.segments.flatMap((segment) => segment.rounds).find((item) => item.keyframeIds.length > 0);
  expect(round?.keyframeIds.length).toBeGreaterThan(0);
  const image = await fetch(`${base}/api/renders/${round?.keyframeIds[0]}`);
  expect(image.status).toBe(200);
  expect(image.headers.get('content-type')).toContain('image/png');
}, 15 * 60 * 1000);
