import type { CourseState, SegmentState, TopicState } from './course.js';
import type { ServerMessage } from './events.js';
import type { GeneratedLesson, GeneratedSegment } from './scene.js';

export type CourseFold = { course: CourseState; seq: number };

const patchTopic = (course: CourseState, topicId: string, update: (topic: TopicState) => TopicState): CourseState => ({
  ...course,
  topics: course.topics.map((topic) => (topic.id === topicId ? update(topic) : topic)),
});

const segmentsFromLesson = (lesson: GeneratedLesson, previous: SegmentState[]): SegmentState[] =>
  lesson.segments.map((segment) => {
    const prior = previous.find((item) => item.id === segment.id);
    return {
      id: segment.id,
      title: segment.title,
      status: 'ready',
      statusDetail: null,
      rounds: prior?.rounds ?? [],
      segment,
    };
  });

const mergeSegments = (existing: GeneratedSegment[], incoming: GeneratedSegment[]): GeneratedSegment[] => {
  const incomingById = new Map(incoming.map((segment) => [segment.id, segment]));
  return existing.map((segment) => incomingById.get(segment.id) ?? segment);
};

const mergeSegmentStates = (existing: SegmentState[], incoming: GeneratedSegment[]): SegmentState[] => {
  const incomingById = new Map(incoming.map((segment) => [segment.id, segment]));
  return existing.map((state) => {
    const next = incomingById.get(state.id);
    if (!next) return state;
    return { ...state, title: next.title, status: 'ready', statusDetail: null, segment: next };
  });
};

const replaceLesson = (topic: TopicState, lesson: GeneratedLesson): TopicState => ({
  ...topic,
  status: 'ready',
  statusDetail: null,
  error: null,
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

const applyEvent = (course: CourseState, message: Extract<ServerMessage, { type: 'event' }>): CourseState => {
  const event = message.event;
  const topicId = event.topicId;
  if (!topicId) return course;
  return patchTopic(course, topicId, (topic) => {
    switch (event.type) {
      case 'topic.queued':
        return { ...topic, status: 'queued' };
      case 'topic.started':
      case 'lesson.drafted':
        return { ...topic, status: 'generating' };
      case 'segment.review':
        return { ...topic, status: 'reviewing' };
      case 'topic.ready':
        if (!event.lesson) return { ...topic, status: 'ready', statusDetail: null, error: null };
        return replaceLesson(topic, event.lesson);
      case 'topic.failed':
        return { ...topic, status: 'failed', statusDetail: null, error: event.error ?? topic.error };
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
