import { GenerationError, toGenerationError } from '@krayon/shared';
import type { PipelineEmit } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { createLessonStages } from '../src/lessonRender.js';
import type { ModelRequest, Runtime } from '../src/runtime.js';
import { lessonDetail, lessonIndexPath, lessonPath } from '../src/store.js';
import { memoryDocs, quietLog, script } from './helpers.js';

const UID = 'u';
const COURSE = 'c';
const LESSON = 'c-c1-l1';

/** A runtime with scripted model answers. Scenes for `failing` segments throw SCHEMA_INVALID. */
const setup = () => {
  const { docs } = memoryDocs();
  const failing = new Set<string>();
  const sceneCalls = new Map<string, number>();
  const events: PipelineEmit[] = [];
  let renders = 0;

  docs.set(lessonIndexPath(UID, LESSON), { courseId: COURSE });
  docs.set(lessonPath(UID, COURSE, LESSON), {
    courseId: COURSE,
    chapterId: 'c-c1',
    sourceId: 'src',
    index: 0,
    title: 'Getting started',
    status: 'outlined',
    pdfPageStart: 20,
    pdfPageEnd: 30,
    explanationSummary: script(25, 20),
    studyDoc: 'Notes',
  });

  const modelJson = async (request: ModelRequest<unknown>) => {
    if (request.name === 'beats') throw new GenerationError('UPSTREAM', [{ path: 'beats', message: 'offline' }], 1);
    if (request.name === 'scene') {
      const segmentId = String(request.fields?.segmentId);
      sceneCalls.set(segmentId, (sceneCalls.get(segmentId) ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (failing.has(segmentId)) throw new GenerationError('SCHEMA_INVALID', [{ path: 'scene.layout.body', message: 'Required' }], 1);
      return { value: { title: `Title ${segmentId}`, scene: { layout: { type: 'titleCard', title: `Title ${segmentId}` } } }, attempts: 1 };
    }
    if (request.name === 'review') return { value: { pass: true, score: 9, issues: [] }, attempts: 1 };
    throw new Error(`unexpected call ${request.name}`);
  };

  const rt = {
    docs,
    blobs: { get: () => ({ data: new Uint8Array([1]) }) },
    config: { maxRepairRounds: 0, maxReviewRounds: 1, reviewPassScore: 7, segmentRetries: 2, reviewModel: 'review' },
    log: quietLog,
    events: { isCancelled: () => false, beginRun: () => 1, endRun: () => undefined },
    sources: {
      slice: async (_uid: string, _source: string, start: number, end: number) => ({ data: new Uint8Array(), mimeType: 'application/pdf', pages: { start, end, total: 60 } }),
      text: async () => '',
    },
    renderer: {
      renderKeyframes: async () => {
        renders += 1;
        return { frames: [0], keyframeIds: ['k'] };
      },
    },
    modelJson,
    failureOf: (error: unknown) => toGenerationError(error).toInfo(),
    emit: (event: PipelineEmit) => events.push(event),
    emitChapter: () => undefined,
    emitLesson: (_uid: string, _course: string, lessonId: string, type: PipelineEmit['type']) => events.push({ type, courseId: COURSE, lessonId }),
    emitSegment: (_uid: string, _course: string, lessonId: string, segmentId: string, type: PipelineEmit['type']) =>
      events.push({ type, courseId: COURSE, lessonId, segmentId }),
    currentEpoch: () => 0,
    assertLive: () => undefined,
  } as unknown as Runtime;

  return { docs, rt, failing, sceneCalls, events, renders: () => renders };
};

const types = (events: PipelineEmit[]) => events.map((event) => event.type);

describe('lesson render', () => {
  it('is ready only when every segment is ready', async () => {
    const { docs, rt, sceneCalls, events } = setup();
    await createLessonStages(rt).renderLesson(UID, LESSON, { userClicked: true });
    const detail = lessonDetail(docs, UID, LESSON)!;
    expect(detail.status).toBe('ready');
    expect(detail.segments.length).toBeGreaterThan(1);
    expect(detail.segments.every((item) => item.status === 'ready' && item.segment)).toBe(true);
    expect(detail.segmentsReady).toBe(detail.segmentCount);
    expect([...sceneCalls.values()].every((count) => count === 1)).toBe(true);
    expect(types(events).filter((type) => type === 'lesson.ready')).toHaveLength(1);
    expect(types(events).indexOf('lesson.ready')).toBe(types(events).length - 1);
  });

  it('retries a failing segment SEGMENT_RETRIES times, then fails the lesson without playing it', async () => {
    const { docs, rt, failing, sceneCalls, events } = setup();
    failing.add('s02');
    await createLessonStages(rt).renderLesson(UID, LESSON, { userClicked: true });
    const detail = lessonDetail(docs, UID, LESSON)!;
    expect(detail.status).toBe('failed');
    expect(detail.error).toBe(`1 of ${detail.segmentCount} segments could not be made.`);
    expect(detail.errorInfo?.issues).toEqual([{ path: 'segments.s02', message: expect.stringContaining('scene.layout.body') }]);
    expect(sceneCalls.get('s02')).toBe(3);
    expect(detail.segments.find((item) => item.id === 's02')?.status).toBe('failed');
    expect(detail.segments.filter((item) => item.id !== 's02').every((item) => item.status === 'ready')).toBe(true);
    expect(types(events)).not.toContain('lesson.ready');
    expect(types(events)).toContain('segment.failed');
  });

  it('Retry re-runs only the failed segments', async () => {
    const { docs, rt, failing, sceneCalls } = setup();
    const stages = createLessonStages(rt);
    failing.add('s02');
    await stages.renderLesson(UID, LESSON, { userClicked: true });
    failing.clear();
    sceneCalls.clear();
    await stages.renderLesson(UID, LESSON, { userClicked: true });
    expect(lessonDetail(docs, UID, LESSON)?.status).toBe('ready');
    expect([...sceneCalls.entries()]).toEqual([['s02', 1]]);
  });

  it('shares one run when render is clicked twice, and leaves a ready lesson alone', async () => {
    const { rt, sceneCalls, renders } = setup();
    const stages = createLessonStages(rt);
    const first = stages.renderLesson(UID, LESSON, { userClicked: true });
    const second = stages.renderLesson(UID, LESSON, { userClicked: true });
    expect(second).toBe(first);
    await Promise.all([first, second]);
    const count = renders();
    expect([...sceneCalls.values()].every((value) => value === 1)).toBe(true);
    await stages.renderLesson(UID, LESSON, { userClicked: true });
    expect(renders()).toBe(count);
  });
});
