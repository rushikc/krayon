import type { EventBus, PipelineEmit, PipelineEvent } from '@krayon/shared';
import { getLogger } from './logging.js';

const log = getLogger('krayon.pipeline');

type Listener = (event: PipelineEvent) => void;

const cancelKey = (courseId: string, topicId?: string, segmentId?: string) =>
  [courseId, topicId ?? '*', segmentId ?? '*'].join(':');

export class LocalEventBus implements EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly sequences = new Map<string, number>();
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

  requestCancel(courseId: string, topicId?: string, segmentId?: string) {
    this.cancelled.add(cancelKey(courseId, topicId, segmentId));
    this.cancelled.add(cancelKey(courseId));
  }

  isCancelled(courseId: string, topicId?: string, segmentId?: string) {
    return this.cancelled.has(cancelKey(courseId)) || this.cancelled.has(cancelKey(courseId, topicId, segmentId));
  }
}
