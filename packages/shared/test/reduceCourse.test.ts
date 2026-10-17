import { describe, expect, it } from 'vitest';
import type { CourseFold } from '../src/reduceCourse.js';
import { reduceCourse, reduceLesson } from '../src/reduceCourse.js';
import { courseLessons } from '../src/course.js';
import type { PipelineEvent, PipelineEventType } from '../src/index.js';
import { chapterState, layoutSegments, lessonDetail, lessonSummary, snapshotCourse } from './fixtures/lesson.js';

const event = (seq: number, type: PipelineEventType, extra: Partial<PipelineEvent> = {}): PipelineEvent => ({
  ...extra,
  type,
  courseId: snapshotCourse.id,
  seq,
  ts: '2026-01-01T00:00:00.000Z',
});

const lessonStatus = (fold: CourseFold, lessonId: string) => courseLessons(fold.course).find((item) => item.id === lessonId)?.status;

describe('reduceCourse', () => {
  it('applies a snapshot and then events in seq order', () => {
    const replacement = { ...snapshotCourse, error: 'from snapshot' };
    let fold = reduceCourse({ course: snapshotCourse, seq: 4 }, { type: 'snapshot', course: replacement });
    expect(fold.course).toBe(replacement);
    expect(fold.seq).toBe(4);

    const queued = { ...lessonSummary('course-1-c1', 0), status: 'queued' as const };
    fold = reduceCourse(fold, { type: 'event', event: event(5, 'lesson.queued', { lessonId: queued.id, lesson: queued }) });
    expect(lessonStatus(fold, queued.id)).toBe('queued');
    expect(fold.seq).toBe(5);
    expect(lessonStatus(fold, 'course-1-c1-l2')).toBe('outlined');
  });

  it('ignores a duplicate or older seq', () => {
    const rendering = { ...lessonSummary('course-1-c1', 0), status: 'rendering' as const };
    const fold = reduceCourse({ course: snapshotCourse, seq: 0 }, { type: 'event', event: event(2, 'lesson.rendering', { lesson: rendering }) });
    const failed = { ...rendering, status: 'failed' as const };
    expect(reduceCourse(fold, { type: 'event', event: event(2, 'lesson.failed', { lesson: failed }) })).toBe(fold);
    expect(reduceCourse(fold, { type: 'event', event: event(1, 'lesson.failed', { lesson: failed }) })).toBe(fold);
    expect(lessonStatus(fold, rendering.id)).toBe('rendering');
  });

  it('takes the chapters and title from structure.ready', () => {
    const empty = { ...snapshotCourse, status: 'structure' as const, stage: 'structure' as const, title: null, chapters: [] };
    const chapters = [chapterState(0, [], 'pending'), chapterState(1, [], 'pending')];
    const fold = reduceCourse(
      { course: empty, seq: 0 },
      { type: 'event', event: event(1, 'structure.ready', { title: 'Algorithms', category: 'Software', chapters }) },
    );
    expect(fold.course).toMatchObject({ status: 'writing', stage: 'chapters', title: 'Algorithms', category: 'Software' });
    expect(fold.course.chapters).toBe(chapters);
  });

  it('records a structure failure on the course only', () => {
    const fold = reduceCourse(
      { course: snapshotCourse, seq: 0 },
      { type: 'event', event: event(1, 'structure.failed', { error: 'No chapters found' }) },
    );
    expect(fold.course.status).toBe('failed');
    expect(fold.course.error).toBe('No chapters found');
    expect(fold.course.chapters).toBe(snapshotCourse.chapters);
  });

  it('replaces a written chapter and keeps the others', () => {
    const written = chapterState(1, [lessonSummary('course-1-c2', 0)]);
    const fold = reduceCourse({ course: snapshotCourse, seq: 0 }, { type: 'event', event: event(1, 'chapter.ready', { chapter: written }) });
    expect(fold.course.chapters[1]).toBe(written);
    expect(fold.course.chapters[0]).toBe(snapshotCourse.chapters[0]);
    expect(courseLessons(fold.course).map((item) => item.id)).toEqual(['course-1-c1-l1', 'course-1-c1-l2', 'course-1-c2-l1']);
  });

  it('does not let a failed chapter or lesson change another', () => {
    let fold: CourseFold = { course: snapshotCourse, seq: 0 };
    const failedChapter = { ...chapterState(1, [], 'failed'), error: 'model failed' };
    fold = reduceCourse(fold, { type: 'event', event: event(1, 'chapter.failed', { chapter: failedChapter }) });
    const failedLesson = { ...lessonSummary('course-1-c1', 0), status: 'failed' as const, error: 'segment 3 failed' };
    fold = reduceCourse(fold, { type: 'event', event: event(2, 'lesson.failed', { lesson: failedLesson }) });
    const ready = { ...lessonSummary('course-1-c1', 1), status: 'ready' as const };
    fold = reduceCourse(fold, { type: 'event', event: event(3, 'lesson.ready', { lesson: ready }) });
    expect(fold.course.chapters[1]?.error).toBe('model failed');
    expect(lessonStatus(fold, failedLesson.id)).toBe('failed');
    expect(lessonStatus(fold, ready.id)).toBe('ready');
  });

  it('marks the course ready on course.ready', () => {
    const fold = reduceCourse({ course: snapshotCourse, seq: 0 }, { type: 'event', event: event(1, 'course.ready') });
    expect(fold.course).toMatchObject({ status: 'ready', stage: 'done' });
  });
});

describe('reduceLesson', () => {
  it('replaces only the changed segment and ignores other lessons', () => {
    const detail = lessonDetail(['ready', 'rendering', 'pending']);
    const updated = { ...detail.segments[1], status: 'ready' as const, segment: layoutSegments[1] };
    const next = reduceLesson(detail, event(1, 'segment.ready', { lessonId: detail.id, segment: updated }));
    expect(next.segments[1]).toBe(updated);
    expect(next.segments[0]).toBe(detail.segments[0]);
    expect(next.segments[2]).toBe(detail.segments[2]);

    const other = reduceLesson(detail, event(2, 'segment.ready', { lessonId: 'course-1-c1-l2', segment: updated }));
    expect(other).toBe(detail);
  });

  it('takes ready and total from the lesson summary', () => {
    const detail = lessonDetail(['ready', 'pending']);
    const summary = { ...lessonSummary('course-1-c1', 0, 'rendering'), segmentCount: 2, segmentsReady: 1 };
    const next = reduceLesson(detail, event(1, 'lesson.rendering', { lessonId: detail.id, lesson: summary, ready: 1, total: 2 }));
    expect(next).toMatchObject({ status: 'rendering', segmentCount: 2, segmentsReady: 1, studyDoc: 'Notes.' });
    expect(next.segments).toBe(detail.segments);
  });
});
