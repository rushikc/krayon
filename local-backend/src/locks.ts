const inflight = new Set<string>();

/** One lock per segment, or per whole lesson when `segmentId` is omitted. */
export const lockKey = (lessonId: string, segmentId?: string) => `${lessonId}:${segmentId ?? '*'}`;

export type BusyBody = { error: 'busy'; reason: string };

/**
 * 409 when the lesson is still rendering, or this segment (or the whole lesson) is already in flight.
 * A lesson-wide key also conflicts with any segment of that lesson.
 */
export const jobConflict = (lessonStatus: string, key: string): BusyBody | null => {
  if (lessonStatus === 'rendering' || lessonStatus === 'queued') return { error: 'busy', reason: 'Still rendering' };
  if (inflight.has(key)) return { error: 'busy', reason: 'Already regenerating' };
  const prefix = key.slice(0, key.lastIndexOf(':') + 1);
  if (inflight.has(`${prefix}*`)) return { error: 'busy', reason: 'Already regenerating' };
  if (key.endsWith(':*')) {
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
