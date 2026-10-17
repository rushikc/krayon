import type { ChapterState, LessonDetail, LessonSummary } from '@krayon/shared';

export type Failure = {
  id: string;
  title: string;
  message: string;
  code?: string | null;
  /** Retry is disabled (work is still running). */
  busy?: boolean;
  /** A retry of this item is running. */
  retrying?: boolean;
  onRetry?: () => void;
};

const plain = (message: string | null | undefined, fallback: string) => message?.trim() || fallback;

export const chapterFailure = (chapter: ChapterState, onRetry: () => void): Failure | null =>
  chapter.status === 'failed'
    ? {
        id: `chapter:${chapter.id}`,
        title: 'This chapter could not be split into lessons',
        message: plain(chapter.error, 'Writing the chapter failed.'),
        code: chapter.errorInfo?.code,
        onRetry,
      }
    : null;

/** The lesson failure, plus each failed segment on the lesson page. Retry re-runs only failed segments. */
export const lessonFailures = (lesson: LessonSummary | LessonDetail, onRetry: () => void): Failure[] => {
  if (lesson.status !== 'failed') return [];
  const items: Failure[] = [
    {
      id: `lesson:${lesson.id}`,
      title: 'This video could not be finished',
      message: plain(lesson.error, 'Some parts of the video could not be made.'),
      code: lesson.errorInfo?.code,
      onRetry,
    },
  ];
  if ('segments' in lesson) {
    for (const segment of lesson.segments) {
      if (segment.status !== 'failed') continue;
      items.push({
        id: segment.id,
        title: `Part ${segment.index + 1}: “${segment.title}”`,
        message: plain(segment.error, 'This part could not be made.'),
        code: segment.errorInfo?.code,
      });
    }
  }
  return items;
};
