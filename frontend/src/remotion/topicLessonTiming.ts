export const TOPIC_TITLE_FRAMES = 75;
export const TOPIC_BEAT_FRAMES = 90;

export const topicLessonDuration = (beatCount: number) =>
  TOPIC_TITLE_FRAMES + beatCount * TOPIC_BEAT_FRAMES;
