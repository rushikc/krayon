import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { generateLesson, generateRoadmap, regenerateSegment } from '../lib/ai.ts';
import type { LessonProgress } from '../lib/ai.ts';
import type { GeneratedLesson, GeneratedSegment, Roadmap, RoadmapTopic } from '../remotion/scene.ts';
import { StudySessionContext } from './studyState.ts';
import type { StudyStatus } from './studyState.ts';

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'The model response could not be used.';

type StudySessionProviderProps = {
  children: ReactNode;
};

export function StudySessionProvider({ children }: StudySessionProviderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [lessons, setLessons] = useState<Record<string, GeneratedLesson>>({});
  const [status, setStatus] = useState<StudyStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [fallbackTopicId, setFallbackTopicId] = useState<string | null>(null);
  const inflight = useRef(new Set<string>());

  const value = useMemo(() => {
    const startFromFile = async (nextFile: File) => {
      setStatus('roadmap');
      setStatusDetail(null);
      setError(null);
      setFile(nextFile);
      setRoadmap(null);
      setLessons({});
      setActiveTopicId(null);
      setFallbackTopicId(null);
      try {
        const nextRoadmap = await generateRoadmap(nextFile);
        setRoadmap(nextRoadmap);
      } catch (caught) {
        setError(messageOf(caught));
        throw caught;
      } finally {
        setStatus('idle');
        setStatusDetail(null);
      }
    };

    const report =
      (writing: StudyStatus) =>
      (progress: LessonProgress) => {
        setStatus(progress.phase === 'writing' ? writing : progress.phase);
        setStatusDetail(progress.detail);
      };

    const openTopic = async (topicId: string) => {
      setActiveTopicId(topicId);
      setError(null);
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

    const regenerate = async (topic: RoadmapTopic, segment: GeneratedSegment) => {
      if (!file) return;
      setRegeneratingId(segment.id);
      setStatus('segment');
      setStatusDetail('Writing the lesson…');
      setError(null);
      try {
        const replacement = await regenerateSegment(topic, file, segment, report('segment'));
        setLessons((current) => {
          const lesson = current[topic.id];
          if (!lesson) return current;
          return {
            ...current,
            [topic.id]: {
              ...lesson,
              segments: lesson.segments.map((item) =>
                item.id === segment.id ? { ...replacement, id: segment.id } : item,
              ),
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

    return {
      fileName: file?.name ?? null,
      roadmap,
      lessons,
      status,
      statusDetail,
      error,
      activeTopicId,
      regeneratingId,
      fallbackTopicId,
      startFromFile,
      openTopic,
      regenerate,
      closeTopic: () => setActiveTopicId(null),
    };
  }, [activeTopicId, error, fallbackTopicId, file, lessons, regeneratingId, roadmap, status, statusDetail]);

  return <StudySessionContext.Provider value={value}>{children}</StudySessionContext.Provider>;
}
