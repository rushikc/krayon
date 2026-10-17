import type { Subtopic } from '../data/topics.ts';
import { TOPIC_BEAT_FRAMES, TOPIC_TITLE_FRAMES } from '../remotion/topicLessonTiming.ts';

export type Chapter = {
  id: string;
  title: string;
  start: number;
  duration: number;
};

export const curatedChapters = (subtopic: Subtopic): Chapter[] => {
  const chapters: Chapter[] = [
    {
      id: `${subtopic.id}-title`,
      title: subtopic.title,
      start: 0,
      duration: TOPIC_TITLE_FRAMES,
    },
  ];
  subtopic.beats.forEach((beat, index) => {
    chapters.push({
      id: `${subtopic.id}-beat-${index}`,
      title: beat,
      start: TOPIC_TITLE_FRAMES + index * TOPIC_BEAT_FRAMES,
      duration: TOPIC_BEAT_FRAMES,
    });
  });
  return chapters;
};

export const chapterIndexAtFrame = (frame: number, chapters: Chapter[]) => {
  let index = 0;
  chapters.forEach((chapter, i) => {
    if (frame >= chapter.start) index = i;
  });
  return index;
};
