import type { GeneratedSegment, SceneIssue } from './scene.js';
import type { GenerationErrorInfo } from './generation.js';
import type { ReviewIssue } from './schemas.js';

export type CourseSource = {
  id: string;
  name: string;
  content_type: string;
  size: number;
  path: string;
};

/** Where course generation is. A restart resumes from the stored stage. */
export type CourseStage = 'structure' | 'chapters' | 'done';

export type CourseStatus = 'created' | 'structure' | 'writing' | 'ready' | 'failed';

export type ChapterStatus = 'pending' | 'writing' | 'ready' | 'failed';

export type LessonStatus = 'writing' | 'outlined' | 'queued' | 'rendering' | 'ready' | 'failed';

export type SegmentStatus = 'pending' | 'drafting' | 'checking' | 'rendering' | 'reviewing' | 'ready' | 'failed';

export type LessonProgress = {
  watched: boolean;
  completed: boolean;
  positionFrame: number;
  updatedAt: number;
};

export type SegmentRound = {
  n: number;
  segment: GeneratedSegment;
  issues: Array<SceneIssue | ReviewIssue>;
  score: number | null;
  pass: boolean | null;
  /** True when this round's fix replaced the segment. */
  fixed?: boolean;
  keyframeIds: string[];
};

/** A lesson as listed on the roadmap (no script, notes, or segments). */
export type LessonSummary = {
  id: string;
  courseId: string;
  chapterId: string;
  index: number;
  title: string;
  /** 1-based PDF pages. */
  sourcePages: number[];
  status: LessonStatus;
  statusDetail: string | null;
  durationFrames: number;
  segmentCount: number;
  segmentsReady: number;
  wordCount: number;
  /** The chapter could not support LESSON_WORDS.min words. */
  shortSource: boolean;
  error: string | null;
  errorInfo: GenerationErrorInfo | null;
  progress: LessonProgress | null;
};

export type ChapterState = {
  id: string;
  courseId: string;
  index: number;
  title: string;
  /** 0-based PDF page indexes, inclusive. */
  pdfPageStart: number;
  pdfPageEnd: number;
  /** Front or back matter: no lessons. */
  skip: boolean;
  status: ChapterStatus;
  statusDetail: string | null;
  error: string | null;
  errorInfo: GenerationErrorInfo | null;
  lessons: LessonSummary[];
};

export type SegmentState = {
  id: string;
  lessonId: string;
  index: number;
  title: string;
  narration: string;
  durationInFrames: number;
  startFrame: number;
  /** 1-based PDF pages. */
  sourcePages: number[];
  status: SegmentStatus;
  statusDetail: string | null;
  segment: GeneratedSegment | null;
  rounds: SegmentRound[];
  error: string | null;
  errorInfo: GenerationErrorInfo | null;
  /** Set when render or review failed but the segment can still play. */
  reviewStatus: 'unreviewed' | null;
};

export type LessonDetail = LessonSummary & {
  chapterTitle: string;
  /** Spoken script (reserved for TTS). */
  explanationSummary: string;
  studyDoc: string;
  segments: SegmentState[];
};

export type CourseState = {
  id: string;
  owner: string;
  status: CourseStatus;
  stage: CourseStage;
  title: string | null;
  category: string | null;
  fileNames: string[];
  sources: CourseSource[];
  pageCount: number | null;
  chapters: ChapterState[];
  error: string | null;
  errorInfo: GenerationErrorInfo | null;
};

/** Lessons of a course in play order. */
export const courseLessons = (course: Pick<CourseState, 'chapters'>) =>
  course.chapters.filter((chapter) => !chapter.skip).flatMap((chapter) => chapter.lessons);
