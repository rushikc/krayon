import type { Subtopic } from '../data/topics.ts';
import { TOPIC_BEAT_FRAMES, TOPIC_TITLE_FRAMES } from '../remotion/topicLessonTiming.ts';
import type { GeneratedSegment } from '../remotion/scene.ts';

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

export const generatedChapters = (segments: GeneratedSegment[]): Chapter[] => {
  let start = 0;
  return segments.map((segment) => {
    const chapter = {
      id: segment.id,
      title: segment.title,
      start,
      duration: segment.durationInFrames,
    };
    start += segment.durationInFrames;
    return chapter;
  });
};

export const chapterIndexAtFrame = (frame: number, chapters: Chapter[]) => {
  let index = 0;
  chapters.forEach((chapter, i) => {
    if (frame >= chapter.start) index = i;
  });
  return index;
};

export const chapterProgress = (frame: number, chapter: Chapter, watched: boolean) => {
  if (watched) return 100;
  if (frame <= chapter.start) return 0;
  const ratio = (frame - chapter.start) / chapter.duration;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
};
