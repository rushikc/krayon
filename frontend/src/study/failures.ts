import type { StudySessionValue } from './studyState.ts';

export type Failure = {
  id: string;
  title: string;
  message: string;
  code?: string | null;
  /** Retry is disabled (work is still running for this topic). */
  busy?: boolean;
  /** A retry of this item is running. */
  retrying?: boolean;
  onRetry?: () => void;
};

/** Failures of one topic: the topic itself and its failed segments, each with a Retry action. */
export const topicFailures = (session: StudySessionValue, topic: { id: string; title: string }): Failure[] => {
  const runtime = session.topics[topic.id];
  if (!runtime) return [];
  const items: Failure[] = [];
  const topicBusy = runtime.status === 'queued' || runtime.status === 'generating';
  if (runtime.status === 'failed') {
    items.push({
      id: `topic:${topic.id}`,
      title: 'This lesson could not be generated',
      message: runtime.error ?? 'The lesson could not be generated.',
      code: runtime.errorCode,
      busy: topicBusy,
      retrying: topicBusy && runtime.statusDetail === 'Retrying',
      onRetry: session.canRetry ? () => void session.retryTopic(topic.id) : undefined,
    });
  }
  for (const segment of Object.values(runtime.segments)) {
    const retrying = segment.statusDetail === 'Retrying';
    if (!retrying && !segment.error && segment.status !== 'failed' && segment.status !== 'blocked') continue;
    items.push({
      id: segment.id,
      title:
        segment.status === 'blocked'
          ? `“${segment.title}” was blocked`
          : segment.status === 'failed' || retrying
            ? `“${segment.title}” could not be generated`
            : `Rewriting “${segment.title}” failed`,
      message: retrying ? 'Retrying…' : (segment.error ?? 'This part could not be generated.'),
      code: segment.errorCode,
      busy: retrying || topicBusy,
      retrying,
      onRetry: session.canRetry ? () => void session.retrySegment(topic.id, segment.id) : undefined,
    });
  }
  return items;
};
