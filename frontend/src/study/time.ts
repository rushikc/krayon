import type { Topic } from '../data/topics.ts';
import { FPS } from '../remotion/catalog.ts';
import { topicLessonDuration } from '../remotion/topicLessonTiming.ts';

export const formatClock = (frames: number, fps = FPS) => {
  const total = Math.max(0, Math.round(frames / fps));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const formatLength = (frames: number, fps = FPS) => {
  const total = Math.max(0, Math.round(frames / fps));
  if (total < 60) return `${total}s`;
  const minutes = Math.max(1, Math.round(total / 60));
  return `${minutes} min`;
};

export const subtopicFrames = (beatCount: number) => topicLessonDuration(beatCount);

export const topicFrames = (topic: Topic) =>
  topic.subtopics.reduce((total, subtopic) => total + subtopicFrames(subtopic.beats.length), 0);
