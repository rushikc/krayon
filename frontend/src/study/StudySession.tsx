import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CourseFold, CourseState, GeneratedLesson, GeneratedSegment, PipelineEvent, Roadmap, RoadmapTopic } from '@krayon/shared';
import { reduceCourse } from '@krayon/shared';
import { generateLesson, generateRoadmap, regenerateSegment } from '../lib/ai.ts';
import type { LessonProgress } from '../lib/ai.ts';
import {
  ApiError,
  createCourse,
  getCourse,
  regenerateCourseSegment,
  renderCourseTopic,
  retryCourseSegment,
  retryCourseTopic,
  useBackendPipeline,
} from '../lib/api.ts';
import { loadCourse, saveCourse } from '../lib/localDb.ts';
import { connectCourse } from '../lib/socket.ts';
import type { CourseSocket } from '../lib/socket.ts';
import { StudySessionContext, applyCourse } from './studyState.ts';
import type { StudyStatus, TopicRuntime } from './studyState.ts';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'The model response could not be used.';

const emptyTopic = (status = 'queued'): TopicRuntime => ({
  status,
  statusDetail: null,
  error: null,
  segments: {},
});

export function StudySessionProvider({ children }: { children: ReactNode }) {
  const cached = useBackendPipeline ? loadCourse() : null;
  const applied = cached ? applyCourse(cached) : null;
  const [fileName, setFileName] = useState<string | null>(applied?.fileName ?? null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(applied?.roadmap ?? null);
  const [lessons, setLessons] = useState<Record<string, GeneratedLesson>>(applied?.lessons ?? {});
  const [topics, setTopics] = useState<Record<string, TopicRuntime>>(applied?.topics ?? {});
  const [buildingRoadmap, setBuildingRoadmap] = useState(applied?.buildingRoadmap ?? false);
  const [status, setStatus] = useState<StudyStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(applied?.error ?? null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [fallbackTopicId, setFallbackTopicId] = useState<string | null>(null);
  const [courseIdState, setCourseIdState] = useState<string | null>(cached?.id ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());
  const socket = useRef<CourseSocket | null>(null);
  const courseId = useRef<string | null>(cached?.id ?? null);
  const fold = useRef<CourseFold | null>(cached ? { course: cached, seq: 0 } : null);

  const show = (course: CourseState) => {
    saveCourse(course);
    courseId.current = course.id;
    setCourseIdState(course.id);
    const next = applyCourse(course);
    setFileName(next.fileName);
    setRoadmap(next.roadmap);
    setLessons(next.lessons);
    setTopics(next.topics);
    setBuildingRoadmap(next.buildingRoadmap);
    if (next.error) setError(next.error);
  };

  const adopt = (course: CourseState) => {
    const current = fold.current ?? { course, seq: 0 };
    fold.current = reduceCourse(current, { type: 'snapshot', course });
    show(course);
  };

  const noteBusy = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 409) {
      setNotice('Still generating, try again in a moment');
      setRegeneratingId(null);
      if (courseId.current) void getCourse(courseId.current).then(adopt).catch(() => undefined);
      window.setTimeout(() => setNotice(null), 3000);
      return;
    }
    setError(messageOf(caught));
  };

  const onEvent = (event: PipelineEvent) => {
    if (!fold.current) return;
    const next = reduceCourse(fold.current, { type: 'event', event });
    if (next === fold.current) return;
    fold.current = next;
    show(next.course);
    if (event.type === 'roadmap.started' || event.type === 'course.created') {
      setBuildingRoadmap(true);
      setStatus('roadmap');
      setStatusDetail('Reading the document…');
    }
    if (event.type === 'roadmap.ready' && event.roadmap) {
      setRoadmap(event.roadmap);
      setBuildingRoadmap(false);
      setStatus('idle');
      setStatusDetail(null);
      setTopics((current) => {
        const next = { ...current };
        for (const topic of event.roadmap?.topics ?? []) next[topic.id] ??= emptyTopic('idle');
        return next;
      });
    }
    if (event.type === 'lesson.drafted' && event.topicId) {
      const topicId = event.topicId;
      setTopics((current) => ({
        ...current,
        [topicId]: { ...(current[topicId] ?? emptyTopic('generating')), status: 'generating', statusDetail: 'Writing the lesson' },
      }));
    }
    if (event.topicId && event.type.startsWith('topic.')) {
      const topicId = event.topicId;
      const statusName = event.type.replace('topic.', '');
      const status = statusName === 'started' ? 'generating' : statusName;
      const detail =
        event.detail ??
        (status === 'queued' ? 'Queued' : status === 'generating' ? 'Writing the lesson' : null);
      const failed = status === 'failed';
      setTopics((current) => {
        const topic = current[topicId] ?? emptyTopic();
        return {
          ...current,
          [topicId]: {
            ...topic,
            status,
            statusDetail: failed || status === 'ready' ? null : (detail ?? topic.statusDetail),
            // Topic failures stay on the topic (shown inline with Retry), not in the page-wide error.
            error: failed ? (event.error ?? topic.error ?? 'Topic failed') : null,
            errorCode: failed ? (event.errorInfo?.code ?? null) : null,
          },
        };
      });
    }
    if (event.type === 'topic.ready' && event.topicId && event.lesson) {
      setLessons((current) => ({ ...current, [event.topicId!]: event.lesson! }));
      setFallbackTopicId((current) => (current === event.topicId ? null : current));
    }
    if (event.type === 'topic.ready' || event.type === 'segment.ready') setError(null);
    if (event.type === 'topic.failed' && event.topicId) {
      setFallbackTopicId(event.topicId);
    }
    if (event.type === 'segment.failed' && event.topicId) {
      const topicId = event.topicId;
      const segmentId = event.segmentId;
      setRegeneratingId((current) => (segmentId && current === segmentId ? null : current));
      setTopics((current) => {
        const topic = current[topicId];
        if (!topic) return current;
        const rewriting = topic.statusDetail === 'Rewriting the segment';
        return {
          ...current,
          [topicId]: {
            ...topic,
            status: rewriting ? 'ready' : topic.status,
            statusDetail: null,
            segments: segmentId
              ? {
                  ...topic.segments,
                  [segmentId]: {
                    ...(topic.segments[segmentId] ?? { id: segmentId, title: segmentId, status: 'failed', statusDetail: null, rounds: [] }),
                    status: 'failed',
                    statusDetail: null,
                    error: event.error ?? 'Segment failed',
                    errorCode: event.errorInfo?.code ?? null,
                  },
                }
              : topic.segments,
          },
        };
      });
    }
    if (event.topicId && event.segmentId && event.type.startsWith('segment.') && event.type !== 'segment.failed') {
      const segmentId = event.segmentId;
      const topicId = event.topicId;
      const statusName = event.type.replace('segment.', '');
      const topicStatus = statusName === 'review' || statusName === 'fixed' ? 'reviewing' : statusName === 'check' || statusName === 'render' ? 'checking' : null;
      const detail =
        event.detail ??
        (statusName === 'check' ? 'Checking the segment' : statusName === 'render' ? 'Rendering keyframes' : null);
      setTopics((current) => {
        const topic = current[topicId] ?? emptyTopic('generating');
        const segment = topic.segments[segmentId] ?? { id: segmentId, title: segmentId, status: 'draft', statusDetail: null, rounds: [] };
        return {
          ...current,
          [topicId]: {
            ...topic,
            status: topicStatus ?? topic.status,
            statusDetail: detail ?? topic.statusDetail,
            segments: {
              ...topic.segments,
              [segmentId]: {
                ...segment,
                status: statusName,
                statusDetail: detail ?? segment.statusDetail,
                error: statusName === 'ready' ? null : segment.error,
                errorCode: statusName === 'ready' ? null : segment.errorCode,
              },
            },
          },
        };
      });
      if (event.type === 'segment.ready') {
        setRegeneratingId((current) => (current === segmentId ? null : current));
      }
    }
    if (event.type === 'course.done' || event.type === 'course.failed') {
      setBuildingRoadmap(false);
      setStatus('idle');
      setStatusDetail(null);
    }
    if (event.type === 'course.failed') setError(event.error ?? 'Course failed');
    if (
      event.type === 'roadmap.ready' ||
      event.type === 'segment.review' ||
      event.type === 'segment.ready' ||
      event.type === 'segment.failed' ||
      event.type === 'topic.ready' ||
      event.type === 'course.failed' ||
      event.type === 'course.done'
    ) {
      void getCourse(event.courseId).then(adopt).catch(() => undefined);
    }
  };

  useEffect(() => {
    if (!useBackendPipeline || !courseId.current) return;
    const id = courseId.current;
    socket.current = connectCourse(id, {
      onSnapshot: adopt,
      onEvent,
      onReconnect: () => {
        void getCourse(id).then(adopt).catch(() => undefined);
      },
    });
    return () => socket.current?.close();
    // Reconnect only when the cached course id is known at mount or after upload sets it via startFromFiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => {
    const report =
      (writing: StudyStatus) =>
      (progress: LessonProgress) => {
        setStatus(progress.phase === 'writing' ? writing : progress.phase);
        setStatusDetail(progress.detail);
      };

    const startFromFile = async (nextFile: File) => {
      if (useBackendPipeline) {
        await startFromFiles([nextFile]);
        return;
      }
      setStatus('roadmap');
      setStatusDetail(null);
      setError(null);
      setFile(nextFile);
      setFileName(nextFile.name);
      setRoadmap(null);
      setLessons({});
      setTopics({});
      setActiveTopicId(null);
      setFallbackTopicId(null);
      try {
        setRoadmap(await generateRoadmap(nextFile));
      } catch (caught) {
        setError(messageOf(caught));
        throw caught;
      } finally {
        setStatus('idle');
        setStatusDetail(null);
      }
    };

    const startFromFiles = async (files: File[]) => {
      setStatus('roadmap');
      setStatusDetail('Reading the document…');
      setError(null);
      setBuildingRoadmap(true);
      setFile(files[0] ?? null);
      setFileName(files.map((item) => item.name).join(', '));
      setRoadmap(null);
      setLessons({});
      setTopics({});
      setActiveTopicId(null);
      setFallbackTopicId(null);
      const created = await createCourse(files);
      courseId.current = created.courseId;
      fold.current = {
        course: {
          id: created.courseId,
          owner: 'local-user',
          status: 'created',
          fileNames: files.map((item) => item.name),
          sources: [],
          roadmap: null,
          topics: [],
          error: null,
        },
        seq: 0,
      };
      socket.current?.close();
      socket.current = connectCourse(created.courseId, {
        onSnapshot: adopt,
        onEvent,
        onReconnect: () => {
          void getCourse(created.courseId).then(adopt).catch(() => undefined);
        },
      });
    };

    const openTopic = async (topicId: string) => {
      setActiveTopicId(topicId);
      setError(null);
      if (useBackendPipeline) return;
      if (!file || !roadmap) return;
      if (lessons[topicId] || inflight.current.has(topicId)) return;
      const topic = roadmap.topics.find((item) => item.id === topicId);
      if (!topic) return;
      inflight.current.add(topicId);
      setStatus('lesson');
      setStatusDetail('Writing the lesson…');
      try {
        const lesson = await generateLesson(topic, file, report('lesson'));
        setLessons((current) => ({ ...current, [topicId]: lesson }));
        setFallbackTopicId((current) => (current === topicId ? null : current));
      } catch (caught) {
        setError(messageOf(caught));
        setFallbackTopicId(topicId);
      } finally {
        inflight.current.delete(topicId);
        setStatus('idle');
        setStatusDetail(null);
      }
    };

    const regenerate = async (topic: RoadmapTopic, segment: GeneratedSegment, prompt?: string) => {
      setRegeneratingId(segment.id);
      setError(null);
      if (useBackendPipeline && courseId.current) {
        setTopics((current) => {
          const topicRuntime = current[topic.id] ?? emptyTopic('generating');
          const segmentRuntime = topicRuntime.segments[segment.id] ?? {
            id: segment.id,
            title: segment.title,
            status: 'draft',
            statusDetail: null,
            rounds: [],
          };
          return {
            ...current,
            [topic.id]: {
              ...topicRuntime,
              status: 'generating',
              statusDetail: 'Rewriting the segment',
              segments: {
                ...topicRuntime.segments,
                [segment.id]: { ...segmentRuntime, status: 'generating', statusDetail: 'Rewriting the segment' },
              },
            },
          };
        });
        void regenerateCourseSegment(courseId.current, topic.id, segment.id, prompt).catch((caught) => {
          setRegeneratingId(null);
          noteBusy(caught);
        });
        return;
      }
      if (!file) return;
      setStatus('segment');
      setStatusDetail('Writing the lesson…');
      try {
        const replacement = await regenerateSegment(topic, file, segment, report('segment'));
        setLessons((current) => {
          const lesson = current[topic.id];
          if (!lesson) return current;
          return {
            ...current,
            [topic.id]: {
              ...lesson,
              segments: lesson.segments.map((item) => (item.id === segment.id ? { ...replacement, id: segment.id } : item)),
            },
          };
        });
        setFallbackTopicId((current) => (current === topic.id ? null : current));
      } catch (caught) {
        setError(messageOf(caught));
      } finally {
        setRegeneratingId(null);
        setStatus('idle');
        setStatusDetail(null);
      }
    };

    const markRetrying = (topicId: string, segmentId?: string) =>
      setTopics((current) => {
        const topic = current[topicId] ?? emptyTopic('generating');
        if (!segmentId) return { ...current, [topicId]: { ...topic, status: 'queued', statusDetail: 'Retrying', error: null, errorCode: null } };
        const segment = topic.segments[segmentId] ?? { id: segmentId, title: segmentId, status: 'failed', statusDetail: null, rounds: [] };
        return {
          ...current,
          [topicId]: {
            ...topic,
            segments: { ...topic.segments, [segmentId]: { ...segment, status: 'generating', statusDetail: 'Retrying', error: null, errorCode: null } },
          },
        };
      });

    const retrySegment = async (topicId: string, segmentId: string) => {
      if (!useBackendPipeline || !courseId.current) return;
      markRetrying(topicId, segmentId);
      try {
        await retryCourseSegment(courseId.current, topicId, segmentId);
      } catch (caught) {
        noteBusy(caught);
        if (!(caught instanceof ApiError && caught.status === 409)) {
          void getCourse(courseId.current).then(adopt).catch(() => undefined);
        }
      }
    };

    const retryTopic = async (topicId: string) => {
      if (!useBackendPipeline || !courseId.current) return;
      markRetrying(topicId);
      setFallbackTopicId((current) => (current === topicId ? null : current));
      try {
        await retryCourseTopic(courseId.current, topicId);
      } catch (caught) {
        noteBusy(caught);
        if (!(caught instanceof ApiError && caught.status === 409)) {
          void getCourse(courseId.current).then(adopt).catch(() => undefined);
        }
      }
    };

    const renderTopic = async (topicId: string) => {
      if (!useBackendPipeline || !courseId.current) return;
      setTopics((current) => {
        const topic = current[topicId] ?? emptyTopic('idle');
        return { ...current, [topicId]: { ...topic, status: 'queued', statusDetail: 'Queued', error: null, errorCode: null } };
      });
      try {
        await renderCourseTopic(courseId.current, topicId);
      } catch (caught) {
        noteBusy(caught);
        if (!(caught instanceof ApiError && caught.status === 409)) {
          void getCourse(courseId.current).then(adopt).catch(() => undefined);
        }
      }
    };

    const openCourse = async (id: string) => {
      if (!useBackendPipeline || courseId.current === id) return;
      const course = await getCourse(id);
      adopt(course);
      socket.current?.close();
      socket.current = connectCourse(id, {
        onSnapshot: adopt,
        onEvent,
        onReconnect: () => {
          void getCourse(id).then(adopt).catch(() => undefined);
        },
      });
    };

    return {
      fileName,
      roadmap,
      lessons,
      topics,
      buildingRoadmap,
      status,
      statusDetail,
      error,
      activeTopicId,
      regeneratingId,
      fallbackTopicId,
      startFromFile,
      startFromFiles,
      openTopic,
      regenerate,
      canRetry: useBackendPipeline,
      retrySegment,
      retryTopic,
      renderTopic,
      openCourse,
      courseId: courseIdState,
      closeTopic: () => setActiveTopicId(null),
    };
  }, [
    activeTopicId,
    buildingRoadmap,
    courseIdState,
    error,
    fallbackTopicId,
    file,
    fileName,
    lessons,
    regeneratingId,
    roadmap,
    status,
    statusDetail,
    topics,
  ]);

  return (
    <StudySessionContext.Provider value={value}>
      {notice ? (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2 text-sm text-paper">{notice}</div>
      ) : null}
      {children}
    </StudySessionContext.Provider>
  );
}
