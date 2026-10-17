import type { CourseState, SegmentState, TopicState } from './course.js';
import type { ServerMessage } from './events.js';
import type { GeneratedLesson, GeneratedSegment } from './scene.js';

export type CourseFold = { course: CourseState; seq: number };

const patchTopic = (course: CourseState, topicId: string, update: (topic: TopicState) => TopicState): CourseState => ({
  ...course,
  topics: course.topics.map((topic) => (topic.id === topicId ? update(topic) : topic)),
});

const segmentsFromLesson = (lesson: GeneratedLesson, previous: SegmentState[]): SegmentState[] => {
  const ready = lesson.segments.map((segment): SegmentState => {
    const prior = previous.find((item) => item.id === segment.id);
    return {
      id: segment.id,
      title: segment.title,
      status: 'ready',
      statusDetail: null,
      rounds: prior?.rounds ?? [],
      segment,
      error: null,
      errorInfo: null,
    };
  });
  // Failed segments are not in the lesson; keep them in place so the UI can show them with Retry.
  const readyIds = new Set(ready.map((item) => item.id));
  const failed = previous.filter((item) => (item.status === 'failed' || item.status === 'unreviewed' || item.status === 'blocked') && !readyIds.has(item.id));
  if (failed.length === 0) return ready;
  const order = new Map(previous.map((item, index) => [item.id, index]));
  return [...ready, ...failed].sort(
    (a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
};

const mergeSegments = (existing: GeneratedSegment[], incoming: GeneratedSegment[]): GeneratedSegment[] => {
  const incomingById = new Map(incoming.map((segment) => [segment.id, segment]));
  return existing.map((segment) => incomingById.get(segment.id) ?? segment);
};

const mergeSegmentStates = (existing: SegmentState[], incoming: GeneratedSegment[]): SegmentState[] => {
  const incomingById = new Map(incoming.map((segment) => [segment.id, segment]));
  return existing.map((state) => {
    const next = incomingById.get(state.id);
    if (!next) return state;
    return { ...state, title: next.title, status: 'ready', statusDetail: null, segment: next, error: null, errorInfo: null };
  });
};

const replaceLesson = (topic: TopicState, lesson: GeneratedLesson): TopicState => ({
  ...topic,
  status: 'ready',
  statusDetail: null,
  error: null,
  errorInfo: null,
  lesson,
  segments: segmentsFromLesson(lesson, topic.segments),
});

const replaceSegment = (topic: TopicState, lesson: GeneratedLesson): TopicState => {
  const existing =
    topic.lesson?.segments ??
    topic.segments.flatMap((state) => (state.segment ? [state.segment] : []));
  const segments = existing.length > 0 ? mergeSegments(existing, lesson.segments) : lesson.segments;
  return {
    ...topic,
    lesson: {
      studyDoc: topic.lesson?.studyDoc || lesson.studyDoc,
      segments,
    },
    segments: topic.segments.length > 0 ? mergeSegmentStates(topic.segments, lesson.segments) : segmentsFromLesson(lesson, []),
  };
};

const stubTopic = (id: string): TopicState => ({
  id,
  title: id,
  summary: '',
  prerequisites: [],
  sourcePages: [],
  status: 'queued',
  statusDetail: null,
  error: null,
  errorInfo: null,
  lesson: null,
  segments: [],
});

const applyEvent = (course: CourseState, message: Extract<ServerMessage, { type: 'event' }>): CourseState => {
  const event = message.event;
  if (event.type === 'course.created' || event.type === 'roadmap.started') {
    return { ...course, status: 'roadmap' };
  }
  if (event.type === 'roadmap.ready' && event.roadmap) {
    const known = new Set(course.topics.map((topic) => topic.id));
    const added = event.roadmap.topics.filter((topic) => !known.has(topic.id)).map((topic) => stubTopic(topic.id));
    return { ...course, status: 'lessons', roadmap: event.roadmap, topics: [...course.topics, ...added] };
  }
  if (event.type === 'course.done') return { ...course, status: 'done' };
  if (event.type === 'course.failed') return { ...course, status: 'failed', error: event.error ?? course.error };
  const topicId = event.topicId;
  if (!topicId) return course;
  const base = course.topics.some((topic) => topic.id === topicId)
    ? course
    : { ...course, topics: [...course.topics, stubTopic(topicId)] };
  return patchTopic(base, topicId, (topic) => {
    switch (event.type) {
      case 'topic.queued':
        return { ...topic, status: 'queued' };
      case 'topic.started':
      case 'lesson.drafted':
        return { ...topic, status: 'generating' };
      case 'segment.review':
      case 'segment.fixed':
        return { ...topic, status: 'reviewing' };
      case 'segment.check':
      case 'segment.render':
        return { ...topic, status: 'checking' };
      case 'topic.ready':
        if (!event.lesson) return { ...topic, status: 'ready', statusDetail: null, error: null, errorInfo: null };
        return replaceLesson(topic, event.lesson);
      case 'topic.failed':
        return {
          ...topic,
          status: 'failed',
          statusDetail: null,
          error: event.error ?? topic.error,
          errorInfo: event.errorInfo ?? topic.errorInfo ?? null,
        };
      case 'segment.failed':
        return {
          ...topic,
          status: topic.statusDetail === 'Rewriting the segment' ? 'ready' : topic.status,
          statusDetail: null,
          segments: topic.segments.map((segment) =>
            segment.id === event.segmentId
              ? { ...segment, status: 'failed', statusDetail: null, error: event.error ?? null, errorInfo: event.errorInfo ?? null }
              : segment,
          ),
        };
      case 'segment.ready':
        return event.lesson ? replaceSegment(topic, event.lesson) : topic;
      default:
        return topic;
    }
  });
};

export const reduceCourse = (fold: CourseFold, message: ServerMessage): CourseFold => {
  if (message.type === 'snapshot') return { course: message.course, seq: fold.seq };
  if (message.event.seq <= fold.seq) return fold;
  return { course: applyEvent(fold.course, message), seq: message.event.seq };
};
