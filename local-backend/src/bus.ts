import { randomUUID } from 'node:crypto';
import type { EventBus, PipelineEmit, PipelineEvent } from '@krayon/shared';
import { getLogger } from './logging.js';

const log = getLogger('krayon.pipeline');

type Listener = (event: PipelineEvent) => void;

const cancelKey = (runId: string, topicId?: string, segmentId?: string) =>
  [runId, topicId ?? '*', segmentId ?? '*'].join(':');

export class LocalEventBus implements EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly sequences = new Map<string, number>();
  private readonly runs = new Map<string, string[]>();
  private readonly cancelled = new Set<string>();

  emit(event: PipelineEmit): PipelineEvent {
    const seq = (this.sequences.get(event.courseId) ?? 0) + 1;
    this.sequences.set(event.courseId, seq);
    const full: PipelineEvent = { ...event, seq, ts: new Date().toISOString() };
    log.info(full.type, {
      event: full.type,
      courseId: full.courseId,
      topicId: full.topicId,
      segmentId: full.segmentId,
      round: full.round,
      flow: event.flow,
      step: event.step ?? full.type,
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

  requestCancel(courseId: string, topicId?: string, segmentId?: string) {
    const runId = this.activeRun(courseId);
    if (!runId) return;
    this.cancelled.add(cancelKey(runId, topicId, segmentId));
  }

  isCancelled(courseId: string, topicId?: string, segmentId?: string) {
    const runId = this.activeRun(courseId);
    if (!runId) return false;
    if (this.cancelled.has(cancelKey(runId))) return true;
    if (topicId && this.cancelled.has(cancelKey(runId, topicId))) return true;
    if (topicId && segmentId && this.cancelled.has(cancelKey(runId, topicId, segmentId))) return true;
    return false;
  }
}
