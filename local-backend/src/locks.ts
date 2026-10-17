const inflight = new Set<string>();

const busyTopic = new Set(['generating', 'checking', 'reviewing']);

export const lockKey = (courseId: string, topicId: string, segmentIndex: number) => `${courseId}:${topicId}:${segmentIndex}`;

export type BusyBody = { error: 'busy'; reason: string };

/** 409 when the topic is still generating, or this segment (or the whole topic) is already in flight. */
export const jobConflict = (topicStatus: string, key: string, topicWide = false): BusyBody | null => {
  if (busyTopic.has(topicStatus)) return { error: 'busy', reason: 'Still generating' };
  if (inflight.has(key)) return { error: 'busy', reason: 'Already regenerating' };
  const prefix = key.slice(0, key.lastIndexOf(':') + 1);
  if (inflight.has(`${prefix}-1`)) return { error: 'busy', reason: 'Already regenerating' };
  if (topicWide) {
    for (const held of inflight) {
      if (held.startsWith(prefix)) return { error: 'busy', reason: 'Already regenerating' };
    }
  }
  return null;
};

export const acquireJob = (key: string) => {
  inflight.add(key);
};

export const releaseJob = (key: string) => {
  inflight.delete(key);
};
