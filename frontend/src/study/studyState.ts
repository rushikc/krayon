import { createContext, useContext } from 'react';
import type { CourseState, GeneratedLesson, GeneratedSegment, Roadmap, RoadmapTopic, SegmentRound } from '@krayon/shared';

export type StudyStatus = 'idle' | 'roadmap' | 'lesson' | 'segment' | 'checking' | 'repairing';

export type SegmentRuntime = {
  id: string;
  title: string;
  status: string;
  statusDetail: string | null;
  rounds: SegmentRound[];
  /** Path-qualified failure message (failed segment, or a rewrite that failed and kept the old one). */
  error?: string | null;
  errorCode?: string | null;
};

export type TopicRuntime = {
  status: string;
  statusDetail: string | null;
  error: string | null;
  errorCode?: string | null;
  segments: Record<string, SegmentRuntime>;
};

export type StudySessionValue = {
  fileName: string | null;
  roadmap: Roadmap | null;
  lessons: Record<string, GeneratedLesson>;
  topics: Record<string, TopicRuntime>;
  buildingRoadmap: boolean;
  status: StudyStatus;
  statusDetail: string | null;
  error: string | null;
  activeTopicId: string | null;
  regeneratingId: string | null;
  fallbackTopicId: string | null;
  startFromFile: (file: File) => Promise<void>;
  startFromFiles: (files: File[]) => Promise<void>;
  openTopic: (topicId: string) => Promise<void>;
  regenerate: (topic: RoadmapTopic, segment: GeneratedSegment, prompt?: string) => Promise<void>;
  /** True when failed segments/topics can be retried (backend pipeline). */
  canRetry: boolean;
  retrySegment: (topicId: string, segmentId: string) => Promise<void>;
  retryTopic: (topicId: string) => Promise<void>;
  /** Queues an idle lesson. The button becomes Queued and it renders next. */
  renderTopic: (topicId: string) => Promise<void>;
  /** Opens a stored course and follows its live updates. No-op when that course is already open. */
  openCourse: (courseId: string) => Promise<void>;
  courseId: string | null;
  closeTopic: () => void;
};

export const applyCourse = (course: CourseState) => {
  const lessons: Record<string, GeneratedLesson> = {};
  const topics: Record<string, TopicRuntime> = {};
  for (const topic of course.topics) {
    if (topic.lesson) lessons[topic.id] = topic.lesson;
    const segments: Record<string, SegmentRuntime> = {};
    for (const segment of topic.segments) {
      segments[segment.id] = {
        id: segment.id,
        title: segment.title,
        status: segment.status,
        statusDetail: segment.statusDetail,
        rounds: segment.rounds,
        error: segment.error ?? null,
        errorCode: segment.errorInfo?.code ?? null,
      };
    }
    topics[topic.id] = {
      status: topic.status,
      statusDetail: topic.statusDetail,
      error: topic.error,
      errorCode: topic.errorInfo?.code ?? null,
      segments,
    };
  }
  return {
    fileName: course.fileNames.join(', ') || null,
    roadmap: course.roadmap,
    lessons,
    topics,
    buildingRoadmap: !course.roadmap && course.status !== 'done' && course.status !== 'failed',
    error: course.error,
  };
};

export const StudySessionContext = createContext<StudySessionValue | null>(null);

export const useStudySession = () => {
  const session = useContext(StudySessionContext);
  if (!session) throw new Error('Study session is missing.');
  return session;
};
