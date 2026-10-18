import type { TaskRequest } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { recoverStale } from '../src/recovery.js';
import { chapterPath, coursePath, lessonPath, noteChapter, noteCourse, noteLesson, segmentPath } from '../src/store.js';
import { memoryDocs } from './helpers.js';
import { createPipeline } from '../src/pipeline.js';
import { quietLog } from './helpers.js';
import { memoryBlobs } from '../src/memory.js';

describe('recovery and last attempt', () => {
  it('backfills indexes and redispatches an expired rendering lease with a new gen', async () => {
    const { docs } = memoryDocs();
    await docs.set(coursePath('a', 'c'), { status: 'ready', stage: 'done', title: 'Shared' });
    await docs.set(chapterPath('a', 'c', 'ch'), { status: 'ready', index: 0 });
    await docs.set(lessonPath('a', 'c', 'les'), {
      status: 'rendering',
      chapterId: 'ch',
      renderGen: 1,
      leaseUntil: Date.now() - 1000,
      updatedAt: Date.now() - 60 * 60 * 1000,
    });
    const sent: TaskRequest[] = [];
    const counts = await recoverStale(docs, { now: () => Date.now() }, {
      dispatch: async (task) => {
        sent.push(task);
        return { taskId: task.dedupeKey ?? task.kind, deduped: false };
      },
    }, { leaseExpiredOnly: true });
    expect(counts.lessons).toBe(1);
    expect((await docs.get('courseIndex/c'))?.data.ownerUid).toBe('a');
    expect((await docs.get('lessonIndex/les'))?.data).toMatchObject({ ownerUid: 'a', courseId: 'c', chapterId: 'ch' });
    expect(sent.some((task) => task.kind === 'lesson.plan' && task.payload.gen === 2)).toBe(true);
    expect(sent[0]?.dedupeKey).not.toBe('recover-lesson-les');
  });

  it('the last attempt marks the segment failed and the lesson settles', async () => {
    const { docs } = memoryDocs();
    const blobs = memoryBlobs();
    await noteCourse(docs, 'a', 'c', { status: 'writing', stage: 'chapters' });
    await noteChapter(docs, 'a', 'c', 'ch');
    await noteLesson(docs, 'a', 'c', 'ch', 'les');
    await docs.set(lessonPath('a', 'c', 'les'), { status: 'rendering', chapterId: 'ch' });
    await docs.set(segmentPath('a', 'c', 'les', 's1'), { status: 'ready' });
    await docs.set(segmentPath('a', 'c', 'les', 's2'), { status: 'pending' });
    const pipeline = createPipeline({
      docs,
      blobs,
      events: {
        emit: (event) => ({ ...event, seq: 1, ts: '' }),
        subscribe: () => () => undefined,
        beginRun: () => 'r',
        endRun: () => undefined,
        requestCancel: () => undefined,
        isCancelled: () => false,
        viewedCourse: () => null,
        setViewedCourse: () => undefined,
      },
      log: quietLog,
      config: {
        useVertex: false,
        project: 'p',
        location: 'global',
        apiKey: '',
        model: 'm',
        reviewModel: 'm',
        maxRepairRounds: 0,
        maxReviewRounds: 0,
        reviewPassScore: 8,
        chapterConcurrency: 1,
        renderConcurrency: 1,
        segmentRetries: 0,
        renderKeyframesMax: 4,
        renderTimeoutMs: 1000,
        remotionEntry: 'entry.js',
        ttsEnabled: false,
        ttsVoice: 'v',
        ttsRate: 1,
        ttsConcurrency: 1,
        ttsQuotaProject: 'p',
        geminiMaxConcurrency: 1,
      },
    });
    await pipeline.failTask({
      kind: 'segment.build',
      queue: 'ai-background',
      payload: { uid: 'a', courseId: 'c', lessonId: 'les', segmentId: 's2' },
    });
    expect((await docs.get(segmentPath('a', 'c', 'les', 's2')))?.data.status).toBe('failed');
    expect((await docs.get(lessonPath('a', 'c', 'les')))?.data.status).toBe('failed');
  });

  it('a retry replans nothing and only resets failed segments', async () => {
    const { docs } = memoryDocs();
    const blobs = memoryBlobs();
    await docs.set('lessonIndex/les', { ownerUid: 'a', courseId: 'c', chapterId: 'ch' });
    await docs.set(lessonPath('a', 'c', 'les'), { status: 'failed', chapterId: 'ch', explanationSummary: 'Script' });
    await docs.set(segmentPath('a', 'c', 'les', 's1'), { status: 'ready', narration: 'kept' });
    await docs.set(segmentPath('a', 'c', 'les', 's2'), { status: 'failed', voice: 'failed', narration: 'again' });
    const sent: string[] = [];
    const pipeline = createPipeline({
      docs,
      blobs,
      dispatcher: {
        dispatch: async (task) => {
          sent.push(`${task.kind}:${task.payload.segmentId ?? task.payload.lessonId}`);
          return { taskId: task.dedupeKey ?? task.kind, deduped: false };
        },
      },
      events: {
        emit: (event) => ({ ...event, seq: 1, ts: '' }),
        subscribe: () => () => undefined,
        beginRun: () => 'r',
        endRun: () => undefined,
        requestCancel: () => undefined,
        isCancelled: () => false,
        viewedCourse: () => null,
        setViewedCourse: () => undefined,
      },
      log: quietLog,
      config: {
        useVertex: false,
        project: 'p',
        location: 'global',
        apiKey: '',
        model: 'm',
        reviewModel: 'm',
        maxRepairRounds: 0,
        maxReviewRounds: 0,
        reviewPassScore: 8,
        chapterConcurrency: 1,
        renderConcurrency: 1,
        segmentRetries: 0,
        renderKeyframesMax: 4,
        renderTimeoutMs: 1000,
        remotionEntry: 'entry.js',
        ttsEnabled: true,
        ttsVoice: 'v',
        ttsRate: 1,
        ttsConcurrency: 1,
        ttsQuotaProject: 'p',
        geminiMaxConcurrency: 1,
      },
    });
    await pipeline.handle({
      kind: 'lesson.plan',
      queue: 'ai-user',
      payload: { uid: 'a', courseId: 'c', lessonId: 'les', gen: 2 },
    });
    expect((await docs.get(segmentPath('a', 'c', 'les', 's1')))?.data.status).toBe('ready');
    expect((await docs.get(segmentPath('a', 'c', 'les', 's2')))?.data.status).toBe('pending');
    expect(sent.every((name) => name.startsWith('segment.voice'))).toBe(true);
  });
});
