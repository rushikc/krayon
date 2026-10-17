import { randomUUID } from 'node:crypto';
import type { EventBus, PipelineEmit, PipelineEvent } from '@krayon/shared';
import { getLogger } from './logging.js';

const log = getLogger('krayon.pipeline');

type Listener = (event: PipelineEvent) => void;

const cancelKey = (runId: string, lessonId?: string, segmentId?: string) =>
  [runId, lessonId ?? '*', segmentId ?? '*'].join(':');

export class LocalEventBus implements EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly sequences = new Map<string, number>();
  private readonly runs = new Map<string, string[]>();
  private readonly cancelled = new Set<string>();
  private viewed: string | null = null;

  emit(event: PipelineEmit): PipelineEvent {
    const seq = (this.sequences.get(event.courseId) ?? 0) + 1;
    this.sequences.set(event.courseId, seq);
    const full: PipelineEvent = { ...event, seq, ts: new Date().toISOString() };
    log.info(full.type, {
      event: full.type,
      courseId: full.courseId,
      chapterId: full.chapterId,
      lessonId: full.lessonId,
      segmentId: full.segmentId,
      round: full.round,
      flow: event.flow,
      step: event.step ?? full.type,
      ready: full.ready,
      total: full.total,
      score: full.score,
      pass: full.pass,
      code: full.errorInfo?.code,
      error: full.error,
    });
    for (const listener of this.listeners.get(event.courseId) ?? []) listener(full);
    return full;
  }

  subscribe(courseId: string, listener: Listener) {
    const set = this.listeners.get(courseId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(courseId, set);
    return () => set.delete(listener);
  }

  viewedCourse() {
    return this.viewed;
  }

  setViewedCourse(courseId: string | null) {
    if (courseId === this.viewed) return;
    this.viewed = courseId;
    log.debug('Viewed course changed', { event: 'queue.viewed', courseId });
  }

  beginRun(courseId: string) {
    const runId = randomUUID();
    const stack = this.runs.get(courseId) ?? [];
    stack.push(runId);
    this.runs.set(courseId, stack);
    return runId;
  }

  endRun(courseId: string, runId: string) {
    const stack = (this.runs.get(courseId) ?? []).filter((id) => id !== runId);
    if (stack.length > 0) this.runs.set(courseId, stack);
    else this.runs.delete(courseId);
    const prefix = `${runId}:`;
    for (const key of this.cancelled) {
      if (key.startsWith(prefix)) this.cancelled.delete(key);
    }
  }

  private activeRun(courseId: string) {
    const stack = this.runs.get(courseId);
    return stack?.[stack.length - 1];
  }

  requestCancel(courseId: string, lessonId?: string, segmentId?: string) {
    const runId = this.activeRun(courseId);
    if (!runId) return;
    this.cancelled.add(cancelKey(runId, lessonId, segmentId));
  }

  isCancelled(courseId: string, lessonId?: string, segmentId?: string) {
    const runId = this.activeRun(courseId);
    if (!runId) return false;
    if (this.cancelled.has(cancelKey(runId))) return true;
    if (lessonId && this.cancelled.has(cancelKey(runId, lessonId))) return true;
    if (lessonId && segmentId && this.cancelled.has(cancelKey(runId, lessonId, segmentId))) return true;
    return false;
  }
}
