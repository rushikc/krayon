import { createContext, useContext } from 'react';
import type { GeneratedLesson, GeneratedSegment, Roadmap, RoadmapTopic } from '../remotion/scene.ts';

export type StudyStatus = 'idle' | 'roadmap' | 'lesson' | 'segment' | 'checking' | 'repairing';

export type StudySessionValue = {
  fileName: string | null;
  roadmap: Roadmap | null;
  lessons: Record<string, GeneratedLesson>;
  status: StudyStatus;
  statusDetail: string | null;
  error: string | null;
  activeTopicId: string | null;
  regeneratingId: string | null;
  fallbackTopicId: string | null;
  startFromFile: (file: File) => Promise<void>;
  openTopic: (topicId: string) => Promise<void>;
  regenerate: (topic: RoadmapTopic, segment: GeneratedSegment) => Promise<void>;
  closeTopic: () => void;
};

export const StudySessionContext = createContext<StudySessionValue | null>(null);

export const useStudySession = () => {
  const session = useContext(StudySessionContext);
  if (!session) throw new Error('Study session is missing.');
  return session;
};
