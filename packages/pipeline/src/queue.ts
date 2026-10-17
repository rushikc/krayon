/**
 * Priority slots for Gemini calls and keyframe renders. The order is computed each time a slot frees,
 * so changing the viewed course reorders work that is still waiting.
 */

/** Work kinds inside one course, most urgent first. */
export type WorkKind = 'auto' | 'chapter' | 'background';

export type Priority = {
  /** A learner clicked render, retry, or asked a question: ahead of everything else. */
  userClicked?: boolean;
  courseId?: string;
  kind?: WorkKind;
  /** When the lesson was queued; older lessons first. */
  enqueuedAt?: number;
  /** Segment or chapter index; earlier first. */
  index?: number;
};

export const BACKGROUND: Priority = { kind: 'background' };

const KIND_RANK: Record<WorkKind, number> = { auto: 0, chapter: 1, background: 2 };

export class QueueCleared extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

type Waiter = { priority: Priority; seq: number; resolve: () => void; reject: (error: Error) => void };

/** Sort key: (userClicked, viewed course first, kind, enqueuedAt, index, seq). */
export const priorityKey = (priority: Priority, viewed: string | null, seq: number) => [
  priority.userClicked ? 0 : 1,
  viewed && priority.courseId === viewed ? 0 : 1,
  KIND_RANK[priority.kind ?? 'background'],
  priority.enqueuedAt ?? Number.MAX_SAFE_INTEGER,
  priority.index ?? Number.MAX_SAFE_INTEGER,
  seq,
];

const compare = (a: number[], b: number[]) => {
  for (let index = 0; index < a.length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export const createPriorityQueue = (options: { limit: () => number; viewedCourse?: () => string | null }) => {
  let active = 0;
  let seq = 0;
  const waiting: Waiter[] = [];
  let viewedCourse = options.viewedCourse ?? (() => null);

  const next = () => {
    if (waiting.length === 0) return null;
    const viewed = viewedCourse();
    let best = 0;
    let bestKey = priorityKey(waiting[0]!.priority, viewed, waiting[0]!.seq);
    for (let index = 1; index < waiting.length; index += 1) {
      const key = priorityKey(waiting[index]!.priority, viewed, waiting[index]!.seq);
      if (compare(key, bestKey) < 0) {
        best = index;
        bestKey = key;
      }
    }
    return waiting.splice(best, 1)[0] ?? null;
  };

  const pump = () => {
    while (active < options.limit()) {
      const waiter = next();
      if (!waiter) break;
      active += 1;
      waiter.resolve();
    }
  };

  const release = () => {
    active -= 1;
    pump();
  };

  /** Runs `work` when a slot is free. `onStart` gets the time spent waiting for the slot. */
  const run = async <T>(priority: Priority, work: () => Promise<T>, onStart?: (waitMs: number) => void): Promise<T> => {
    const queuedAt = performance.now();
    if (active >= options.limit() || waiting.length > 0) {
      await new Promise<void>((resolve, reject) => {
        seq += 1;
        waiting.push({ priority, seq, resolve, reject });
        pump();
      });
    } else {
      active += 1;
    }
    onStart?.(Math.round(performance.now() - queuedAt));
    try {
      return await work();
    } finally {
      release();
    }
  };

  /** Rejects everything still waiting (admin reset). Running work finishes on its own. */
  const clear = () => {
    for (const waiter of waiting.splice(0)) waiter.reject(new QueueCleared());
  };

  return {
    run,
    clear,
    inFlight: () => active,
    waiting: () => waiting.length,
    setViewedCourse: (provider: () => string | null) => {
      viewedCourse = provider;
    },
  };
};

export type PriorityQueue = ReturnType<typeof createPriorityQueue>;
