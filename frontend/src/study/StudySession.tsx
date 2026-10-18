import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CourseFold, CourseState, LessonProgress, LessonSummary, PipelineEvent } from '@krayon/shared';
import { reduceCourse } from '@krayon/shared';
import {
  ApiError,
  createCourse,
  getCourse,
  renderLesson as postRender,
  retryChapter as postRetryChapter,
  retryCourse as postRetryCourse,
  retryLesson as postRetryLesson,
} from '../lib/api.ts';
import { clearSavedCourse, loadCourse, saveCourse } from '../lib/localDb.ts';
import { connectCourse } from '../lib/realtime.ts';
import type { CourseSocket } from '../lib/realtime.ts';
import { currentUid } from '../lib/firebase.ts';
import { StudySessionContext } from './studyState.ts';
import type { StudySessionValue } from './studyState.ts';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The request failed.');

const patchLesson = (course: CourseState, lessonId: string, patch: (lesson: LessonSummary) => LessonSummary) => ({
  ...course,
  chapters: course.chapters.map((chapter) => ({
    ...chapter,
    lessons: chapter.lessons.map((lesson) => (lesson.id === lessonId ? patch(lesson) : lesson)),
  })),
});

/** Shows a lesson as queued right away, before its event arrives. */
const markLesson = (course: CourseState, lessonId: string) =>
  patchLesson(course, lessonId, (lesson) =>
    lesson.status === 'ready' || lesson.status === 'rendering' || lesson.status === 'queued'
      ? lesson
      : { ...lesson, status: 'queued', statusDetail: 'Queued', error: null, errorInfo: null },
  );

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const [cached] = useState(loadCourse);
  const [course, setCourse] = useState<CourseState | null>(cached);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const socket = useRef<CourseSocket | null>(null);
  const fold = useRef<CourseFold | null>(cached ? { course: cached, seq: 0 } : null);
  const listeners = useRef(new Set<(event: PipelineEvent) => void>());

  const show = useCallback((next: CourseState) => {
    saveCourse(next);
    setCourse(next);
  }, []);

  const adopt = useCallback(
    (next: CourseState) => {
      fold.current = reduceCourse(fold.current ?? { course: next, seq: 0 }, { type: 'snapshot', course: next });
      show(next);
    },
    [show],
  );

  const follow = useCallback(
    (courseId: string) => {
      socket.current?.close();
      socket.current = connectCourse(courseId, {
        onSnapshot: adopt,
        onEvent: (event) => {
          if (!fold.current || fold.current.course.id !== event.courseId) return;
          const next = reduceCourse(fold.current, { type: 'event', event });
          if (next !== fold.current) {
            fold.current = next;
            show(next.course);
          }
          for (const listener of listeners.current) listener(event);
        },
        onReconnect: () => {
          void getCourse(courseId).then(adopt).catch(() => undefined);
        },
      });
    },
    [adopt, show],
  );

  useEffect(() => {
    if (cached) follow(cached.id);
    return () => socket.current?.close();
  }, [cached, follow]);

  const flash = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 3000);
  };

  const run = useCallback(async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        flash(caught.message || 'Still working on it, try again in a moment');
        return;
      }
      setError(messageOf(caught));
    }
  }, []);

  const value = useMemo<StudySessionValue>(() => {
    const courseId = course?.id ?? null;
    return {
      course,
      courseId,
      starting,
      error,
      startFromFiles: async (files) => {
        setStarting(true);
        setError(null);
        try {
          const created = await createCourse(files);
          const fresh: CourseState = {
            id: created.courseId,
            owner: currentUid(),
            status: 'created',
            stage: 'structure',
            title: null,
            category: null,
            fileNames: files.map((file) => file.name),
            sources: [],
            pageCount: null,
            chapters: [],
            error: null,
            errorInfo: null,
          };
          fold.current = { course: fresh, seq: 0 };
          show(fresh);
          follow(created.courseId);
        } finally {
          setStarting(false);
        }
      },
      openCourse: async (id) => {
        if (fold.current?.course.id === id) return;
        const next = await getCourse(id);
        fold.current = { course: next, seq: 0 };
        show(next);
        follow(id);
      },
      clearCourse: (id) => {
        if (id && fold.current?.course.id !== id) return;
        socket.current?.close();
        socket.current = null;
        fold.current = null;
        clearSavedCourse();
        setCourse(null);
        setError(null);
      },
      renderLesson: (lessonId) =>
        run(async () => {
          if (fold.current) {
            fold.current = { ...fold.current, course: markLesson(fold.current.course, lessonId) };
            show(fold.current.course);
          }
          await postRender(lessonId);
        }),
      retryCourse: () => run(async () => (courseId ? postRetryCourse(courseId) : undefined)),
      retryChapter: (chapterId) => run(() => postRetryChapter(chapterId)),
      retryLesson: (lessonId) =>
        run(async () => {
          if (fold.current) {
            fold.current = { ...fold.current, course: markLesson(fold.current.course, lessonId) };
            show(fold.current.course);
          }
          await postRetryLesson(lessonId);
        }),
      noteProgress: (lessonId: string, progress: LessonProgress) => {
        if (!fold.current) return;
        fold.current = { ...fold.current, course: patchLesson(fold.current.course, lessonId, (lesson) => ({ ...lesson, progress })) };
        show(fold.current.course);
      },
      listen: (listener) => {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    };
  }, [course, error, follow, run, show, starting]);

  return (
    <StudySessionContext.Provider value={value}>
      {notice ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm text-paper">{notice}</div>
      ) : null}
      {children}
    </StudySessionContext.Provider>
  );
}
