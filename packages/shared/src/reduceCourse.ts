import type { ChapterState, CourseState, LessonDetail, LessonSummary } from './course.js';
import type { PipelineEvent, ServerMessage } from './events.js';

export type CourseFold = { course: CourseState; seq: number };

const replaceLesson = (chapters: ChapterState[], lesson: LessonSummary): ChapterState[] =>
  chapters.map((chapter) => {
    if (chapter.id !== lesson.chapterId) return chapter;
    const known = chapter.lessons.some((item) => item.id === lesson.id);
    const lessons = known
      ? chapter.lessons.map((item) => (item.id === lesson.id ? lesson : item))
      : [...chapter.lessons, lesson].sort((a, b) => a.index - b.index);
    return { ...chapter, lessons };
  });

const replaceChapter = (chapters: ChapterState[], chapter: ChapterState): ChapterState[] => {
  const known = chapters.some((item) => item.id === chapter.id);
  if (!known) return [...chapters, chapter].sort((a, b) => a.index - b.index);
  return chapters.map((item) => (item.id === chapter.id ? chapter : item));
};

const applyEvent = (course: CourseState, event: PipelineEvent): CourseState => {
  switch (event.type) {
    case 'course.created':
    case 'structure.started':
      return { ...course, status: 'structure', error: null, errorInfo: null };
    case 'structure.ready':
      return {
        ...course,
        status: 'writing',
        stage: 'chapters',
        title: event.title ?? course.title,
        category: event.category ?? course.category,
        chapters: event.chapters ?? course.chapters,
      };
    case 'structure.failed':
      return { ...course, status: 'failed', error: event.error ?? course.error, errorInfo: event.errorInfo ?? null };
    case 'course.ready':
      return { ...course, status: 'ready', stage: 'done' };
    default:
      break;
  }
  if (event.chapter) return { ...course, chapters: replaceChapter(course.chapters, event.chapter) };
  if (event.lesson) return { ...course, chapters: replaceLesson(course.chapters, event.lesson) };
  return course;
};

export const reduceCourse = (fold: CourseFold, message: ServerMessage): CourseFold => {
  if (message.type === 'snapshot') return { course: message.course, seq: fold.seq };
  if (message.event.seq <= fold.seq) return fold;
  return { course: applyEvent(fold.course, message.event), seq: message.event.seq };
};

/** Folds lesson and segment events into one lesson's detail. Events for other lessons are ignored. */
export const reduceLesson = (lesson: LessonDetail, event: PipelineEvent): LessonDetail => {
  if (event.lessonId !== lesson.id) return lesson;
  let next = lesson;
  if (event.lesson) next = { ...next, ...event.lesson };
  const segment = event.segment;
  if (segment) {
    const known = next.segments.some((item) => item.id === segment.id);
    const segments = known
      ? next.segments.map((item) => (item.id === segment.id ? segment : item))
      : [...next.segments, segment].sort((a, b) => a.index - b.index);
    next = { ...next, segments };
  }
  return next;
};
