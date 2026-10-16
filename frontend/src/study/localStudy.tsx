import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SourceFile, Topic } from '../data/topics.ts';

export type Stroke = {
  points: { x: number; y: number }[];
};

export type Stamp = {
  id: string;
  timestamp: string;
  text: string;
};

export type DoubtTurn = {
  role: 'user' | 'krayon';
  text: string;
};

export type LessonMarks = {
  strokes: Stroke[];
  pins: Stamp[];
  notes: Stamp[];
  doubts: DoubtTurn[];
  expanded: boolean;
  quizReady: boolean;
  watchedIds: string[];
};

export type TopicProgress = {
  doneIds: string[];
  updatedAt: number;
};

const PROGRESS_KEY = 'krayon.progress.v1';
const SOURCES_KEY = 'krayon.sources.v1';
const MARKS_KEY = 'krayon.marks.v1';

export const emptyMarks = (): LessonMarks => ({
  strokes: [],
  pins: [],
  notes: [],
  doubts: [],
  expanded: false,
  quizReady: false,
  watchedIds: [],
});

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const topicKey = (id: string) => `topic:${id}`;

export const lessonKey = (topicId: string, subtopicId: string) => `topic:${topicId}:${subtopicId}`;

export const stepStatus = (doneIds: string[], ids: string[], id: string): 'done' | 'next' | 'locked' => {
  if (doneIds.includes(id)) return 'done';
  const firstOpen = ids.find((item) => !doneIds.includes(item));
  if (!firstOpen || firstOpen === id) return 'next';
  return 'locked';
};

export const nextSubtopic = (topic: Topic, doneIds: string[]) =>
  topic.subtopics.find((subtopic) => !doneIds.includes(subtopic.id)) ?? topic.subtopics[0];

type LocalStudyValue = {
  progress: Record<string, TopicProgress>;
  sources: Record<string, SourceFile[]>;
  marks: Record<string, LessonMarks>;
  doneIds: (key: string) => string[];
  sourceList: (key: string) => SourceFile[];
  lessonMarks: (key: string) => LessonMarks;
  touchTopic: (key: string) => void;
  markSubtopicDone: (key: string, subtopicId: string) => void;
  addSources: (key: string, files: SourceFile[]) => void;
  patchMarks: (key: string, update: (current: LessonMarks) => LessonMarks) => void;
};

const LocalStudyContext = createContext<LocalStudyValue | null>(null);

export function LocalStudyProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Record<string, TopicProgress>>(() => read(PROGRESS_KEY, {}));
  const [sources, setSources] = useState<Record<string, SourceFile[]>>(() => read(SOURCES_KEY, {}));
  const [marks, setMarks] = useState<Record<string, LessonMarks>>(() => read(MARKS_KEY, {}));

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    localStorage.setItem(MARKS_KEY, JSON.stringify(marks));
  }, [marks]);

  const value = useMemo<LocalStudyValue>(
    () => ({
      progress,
      sources,
      marks,
      doneIds: (key) => progress[key]?.doneIds ?? [],
      sourceList: (key) => sources[key] ?? [],
      lessonMarks: (key) => marks[key] ?? emptyMarks(),
      touchTopic: (key) => {
        setProgress((current) => {
          const prev = current[key] ?? { doneIds: [], updatedAt: 0 };
          return { ...current, [key]: { ...prev, updatedAt: Date.now() } };
        });
      },
      markSubtopicDone: (key, subtopicId) => {
        setProgress((current) => {
          const prev = current[key] ?? { doneIds: [], updatedAt: 0 };
          const doneIds = prev.doneIds.includes(subtopicId)
            ? prev.doneIds
            : [...prev.doneIds, subtopicId];
          return { ...current, [key]: { doneIds, updatedAt: Date.now() } };
        });
      },
      addSources: (key, files) => {
        setSources((current) => {
          const prev = current[key] ?? [];
          const names = new Set(prev.map((file) => file.name));
          const next = [...prev];
          for (const file of files) {
            if (names.has(file.name)) continue;
            names.add(file.name);
            next.push(file);
          }
          return { ...current, [key]: next };
        });
      },
      patchMarks: (key, update) => {
        setMarks((current) => {
          const prev = current[key] ?? emptyMarks();
          const next = update(prev);
          if (next === prev) return current;
          return { ...current, [key]: next };
        });
      },
    }),
    [marks, progress, sources],
  );

  return <LocalStudyContext.Provider value={value}>{children}</LocalStudyContext.Provider>;
}

export const useLocalStudy = () => {
  const value = useContext(LocalStudyContext);
  if (!value) throw new Error('Local study is missing.');
  return value;
};

export const latestOpenTopic = (topics: Topic[], progress: Record<string, TopicProgress>) => {
  const open = topics
    .map((topic) => ({ topic, record: progress[topicKey(topic.id)] }))
    .filter(
      (item): item is { topic: Topic; record: TopicProgress } =>
        !!item.record &&
        item.record.updatedAt > 0 &&
        item.record.doneIds.length < item.topic.subtopics.length,
    )
    .sort((a, b) => b.record.updatedAt - a.record.updatedAt);
  return open[0]?.topic ?? null;
};
