import { describe, expect, it } from 'vitest';
import type { CourseFold } from '../src/reduceCourse.js';
import { reduceCourse } from '../src/reduceCourse.js';
import type { GeneratedLesson, PipelineEvent, PipelineEventType } from '../src/index.js';
import { lesson, snapshotCourse } from './fixtures/lesson.js';

const event = (seq: number, type: PipelineEventType, extra: Partial<PipelineEvent> = {}): PipelineEvent => ({
  ...extra,
  type,
  courseId: snapshotCourse.id,
  seq,
  ts: '2026-01-01T00:00:00.000Z',
});

const topicStatus = (fold: CourseFold, topicId: string) => fold.course.topics.find((topic) => topic.id === topicId)?.status;

const supplyLesson = (): GeneratedLesson => {
  const topic = snapshotCourse.topics.find((item) => item.id === 'supply');
  if (!topic?.lesson) throw new Error('Supply lesson is missing.');
  return topic.lesson;
};

describe('reduceCourse', () => {
  it('applies a snapshot and then events in seq order', () => {
    const replacement = { ...snapshotCourse, error: 'from snapshot' };
    let fold = reduceCourse({ course: snapshotCourse, seq: 4 }, { type: 'snapshot', course: replacement });
    expect(fold.course).toBe(replacement);
    expect(fold.seq).toBe(4);

    fold = reduceCourse(fold, { type: 'event', event: event(5, 'topic.started', { topicId: 'supply' }) });
    expect(topicStatus(fold, 'supply')).toBe('generating');
    fold = reduceCourse(fold, { type: 'event', event: event(6, 'segment.review', { topicId: 'supply', segmentId: 'title-card' }) });
    expect(topicStatus(fold, 'supply')).toBe('reviewing');
    expect(fold.seq).toBe(6);
    expect(topicStatus(fold, 'demand')).toBe('queued');
  });

  it('ignores a duplicate or older seq', () => {
    const fold = reduceCourse(
      { course: snapshotCourse, seq: 0 },
      { type: 'event', event: event(2, 'topic.started', { topicId: 'supply' }) },
    );
    const duplicate = reduceCourse(fold, { type: 'event', event: event(2, 'topic.failed', { topicId: 'supply', error: 'nope' }) });
    const stale = reduceCourse(fold, { type: 'event', event: event(1, 'topic.queued', { topicId: 'supply' }) });
    expect(duplicate).toBe(fold);
    expect(stale).toBe(fold);
    expect(topicStatus(fold, 'supply')).toBe('generating');
  });

  it('moves a topic through queued, generating, reviewing, and ready', () => {
    let fold: CourseFold = { course: snapshotCourse, seq: 0 };
    fold = reduceCourse(fold, { type: 'event', event: event(1, 'topic.queued', { topicId: 'supply' }) });
    expect(topicStatus(fold, 'supply')).toBe('queued');
    fold = reduceCourse(fold, { type: 'event', event: event(2, 'lesson.drafted', { topicId: 'supply' }) });
    expect(topicStatus(fold, 'supply')).toBe('generating');
    fold = reduceCourse(fold, { type: 'event', event: event(3, 'segment.review', { topicId: 'supply', segmentId: 'title-card' }) });
    expect(topicStatus(fold, 'supply')).toBe('reviewing');
    fold = reduceCourse(fold, { type: 'event', event: event(4, 'topic.ready', { topicId: 'supply', lesson }) });
    expect(topicStatus(fold, 'supply')).toBe('ready');
    expect(fold.course.topics.find((topic) => topic.id === 'supply')?.lesson).toBe(lesson);
    expect(topicStatus(fold, 'demand')).toBe('queued');
  });

  it('does not let a failed topic block a later topic', () => {
    let fold: CourseFold = { course: snapshotCourse, seq: 0 };
    fold = reduceCourse(fold, { type: 'event', event: event(1, 'topic.failed', { topicId: 'supply', error: 'model failed' }) });
    fold = reduceCourse(fold, { type: 'event', event: event(2, 'topic.queued', { topicId: 'demand' }) });
    fold = reduceCourse(fold, { type: 'event', event: event(3, 'topic.started', { topicId: 'demand' }) });
    fold = reduceCourse(fold, { type: 'event', event: event(4, 'topic.ready', { topicId: 'demand', lesson }) });
    const supply = fold.course.topics.find((topic) => topic.id === 'supply');
    const demand = fold.course.topics.find((topic) => topic.id === 'demand');
    expect(supply?.status).toBe('failed');
    expect(supply?.error).toBe('model failed');
    expect(demand?.status).toBe('ready');
    expect(demand?.lesson).toBe(lesson);
  });

  it('replaces only the regenerated segment', () => {
    const current = supplyLesson();
    const kept = current.segments[1];
    const first = current.segments[0];
    if (!kept || !first) throw new Error('Supply lesson needs two segments.');
    const rewritten = { ...first, title: 'Rewritten supply', narration: 'A new caption.' };
    const fold = reduceCourse(
      { course: snapshotCourse, seq: 0 },
      {
        type: 'event',
        event: event(1, 'segment.ready', {
          topicId: 'supply',
          segmentId: first.id,
          lesson: { studyDoc: 'Replaced notes.', segments: [rewritten] },
        }),
      },
    );
    const topic = fold.course.topics.find((item) => item.id === 'supply');
    expect(topic?.status).toBe('queued');
    expect(topic?.lesson?.studyDoc).toBe('Notes for supply.');
    expect(topic?.lesson?.segments[0]).toEqual(rewritten);
    expect(topic?.lesson?.segments[1]).toBe(kept);
    expect(topic?.segments[1]?.segment).toBe(kept);
    expect(fold.course.topics.find((item) => item.id === 'demand')).toBe(snapshotCourse.topics[1]);
  });
});
