import type { ChapterState, CourseState, LessonProgress, LessonSummary, SegmentAudio, SegmentRound, SegmentState, SegmentVoice } from './course.js';
import type { GenerationErrorInfo } from './generation.js';
import type { GeneratedSegment } from './scene.js';
import type { DocRecord } from './ports.js';

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown) => (typeof value === 'string' ? value : null);
const byIndex = (a: DocRecord, b: DocRecord) => num(a.data.index) - num(b.data.index) || a.id.localeCompare(b.id);

export const progressFrom = (data: Record<string, unknown> | undefined): LessonProgress | null => {
  if (!data) return null;
  return {
    watched: data.watched === true,
    completed: data.completed === true,
    positionFrame: num(data.positionFrame),
    updatedAt: num(data.updatedAt),
  };
};

export const lessonSummaryFrom = (doc: DocRecord, progress: LessonProgress | null): LessonSummary => {
  const data = doc.data;
  return {
    id: doc.id,
    courseId: String(data.courseId ?? ''),
    chapterId: String(data.chapterId ?? ''),
    index: num(data.index),
    title: String(data.title ?? ''),
    sourcePages: (data.sourcePages as number[]) ?? [],
    status: (data.status as LessonSummary['status']) ?? 'outlined',
    statusDetail: str(data.statusDetail),
    durationFrames: num(data.durationFrames),
    segmentCount: num(data.segmentCount),
    segmentsReady: num(data.segmentsReady),
    wordCount: num(data.wordCount),
    shortSource: data.shortSource === true,
    error: str(data.error),
    errorInfo: (data.errorInfo as GenerationErrorInfo | null) ?? null,
    progress,
  };
};

export const chapterFrom = (courseId: string, doc: DocRecord, lessons: DocRecord[], progressFor: (lessonId: string) => LessonProgress | null): ChapterState => {
  const data = doc.data;
  const rows = lessons.filter((row) => row.data.chapterId === doc.id).sort(byIndex);
  return {
    id: doc.id,
    courseId,
    index: num(data.index),
    title: String(data.title ?? ''),
    pdfPageStart: num(data.pdfPageStart),
    pdfPageEnd: num(data.pdfPageEnd),
    skip: data.skip === true,
    status: (data.status as ChapterState['status']) ?? 'pending',
    statusDetail: str(data.statusDetail),
    error: str(data.error),
    errorInfo: (data.errorInfo as GenerationErrorInfo | null) ?? null,
    lessons: rows.map((row) => lessonSummaryFrom(row, progressFor(row.id))),
  };
};

export const courseFrom = (
  uid: string,
  courseId: string,
  course: DocRecord,
  chapterDocs: DocRecord[],
  lessonDocs: DocRecord[],
  progressFor: (lessonId: string) => LessonProgress | null,
): CourseState => {
  const data = course.data;
  const chapters = [...chapterDocs].sort(byIndex).map((doc) => chapterFrom(courseId, doc, lessonDocs, progressFor));
  return {
    id: courseId,
    owner: uid,
    status: (data.status as CourseState['status']) ?? 'created',
    stage: (data.stage as CourseState['stage']) ?? 'structure',
    title: str(data.title),
    category: str(data.category),
    fileNames: (data.fileNames as string[]) ?? [],
    sources: (data.sources as CourseState['sources']) ?? [],
    pageCount: typeof data.pageCount === 'number' ? data.pageCount : null,
    chapters,
    error: str(data.error),
    errorInfo: (data.errorInfo as GenerationErrorInfo | null) ?? null,
  };
};

const isVoice = (value: unknown): value is SegmentVoice =>
  value === 'pending' || value === 'voicing' || value === 'voiced' || value === 'failed';

const isAudio = (value: unknown): value is SegmentAudio =>
  Boolean(value) && typeof value === 'object' && typeof (value as SegmentAudio).blobId === 'string' && typeof (value as SegmentAudio).seconds === 'number';

export const segmentFrom = (lessonId: string, doc: DocRecord, rounds: DocRecord[]): SegmentState => {
  const data = doc.data;
  const mapped = rounds
    .map((round): SegmentRound => ({
      n: Number(round.id),
      segment: round.data.segment as GeneratedSegment,
      issues: (round.data.issues as SegmentRound['issues']) ?? [],
      score: (round.data.score as number | null) ?? null,
      pass: (round.data.pass as boolean | null) ?? null,
      fixed: typeof round.data.fixed === 'boolean' ? round.data.fixed : undefined,
      keyframeIds: (round.data.keyframeIds as string[]) ?? [],
    }))
    .sort((a, b) => a.n - b.n);
  const audio = isAudio(data.audio) ? data.audio : undefined;
  return {
    id: doc.id,
    lessonId,
    index: num(data.index),
    title: String(data.title ?? ''),
    narration: String(data.narration ?? ''),
    durationInFrames: num(data.durationInFrames),
    startFrame: num(data.startFrame),
    sourcePages: (data.sourcePages as number[]) ?? [],
    status: (data.status as SegmentState['status']) ?? 'pending',
    statusDetail: str(data.statusDetail),
    segment: (data.segment as GeneratedSegment | null) ?? null,
    rounds: mapped,
    error: str(data.error),
    errorInfo: (data.errorInfo as GenerationErrorInfo | null) ?? null,
    reviewStatus: data.reviewStatus === 'unreviewed' ? 'unreviewed' : null,
    audio,
    voice: isVoice(data.voice) ? data.voice : undefined,
    audioUrl: audio ? `/api/audio/${audio.blobId}` : undefined,
  };
};
