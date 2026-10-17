import type {
  ChapterState,
  CourseState,
  DocRecord,
  DocStore,
  GeneratedSegment,
  GenerationErrorInfo,
  LessonDetail,
  LessonProgress,
  LessonSummary,
  SegmentAudio,
  SegmentRound,
  SegmentState,
  SegmentVoice,
} from '@krayon/shared';

export const coursePath = (uid: string, courseId: string) => `users/${uid}/courses/${courseId}`;
export const chaptersPath = (uid: string, courseId: string) => `${coursePath(uid, courseId)}/chapters`;
export const chapterPath = (uid: string, courseId: string, chapterId: string) => `${chaptersPath(uid, courseId)}/${chapterId}`;
export const lessonsPath = (uid: string, courseId: string) => `${coursePath(uid, courseId)}/lessons`;
export const lessonPath = (uid: string, courseId: string, lessonId: string) => `${lessonsPath(uid, courseId)}/${lessonId}`;
export const segmentsPath = (uid: string, courseId: string, lessonId: string) => `${lessonPath(uid, courseId, lessonId)}/segments`;
export const segmentPath = (uid: string, courseId: string, lessonId: string, segmentId: string) =>
  `${segmentsPath(uid, courseId, lessonId)}/${segmentId}`;
export const roundPath = (uid: string, courseId: string, lessonId: string, segmentId: string, n: number) =>
  `${segmentPath(uid, courseId, lessonId, segmentId)}/rounds/${n}`;
export const lessonIndexPath = (uid: string, lessonId: string) => `users/${uid}/lessonIndex/${lessonId}`;
export const chapterIndexPath = (uid: string, chapterId: string) => `users/${uid}/chapterIndex/${chapterId}`;
export const progressPath = (uid: string, lessonId: string) => `users/${uid}/progress/${lessonId}`;

export const chapterIdFor = (courseId: string, index: number) => `${courseId}-c${index + 1}`;
export const lessonIdFor = (chapterId: string, index: number) => `${chapterId}-l${index + 1}`;
export const segmentIdFor = (index: number) => `s${String(index + 1).padStart(2, '0')}`;

const num = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const str = (value: unknown) => (typeof value === 'string' ? value : null);
const byIndex = (a: DocRecord, b: DocRecord) => num(a.data.index) - num(b.data.index) || a.id.localeCompare(b.id);

export const readProgress = (docs: DocStore, uid: string, lessonId: string): LessonProgress | null => {
  const data = docs.get(progressPath(uid, lessonId))?.data;
  if (!data) return null;
  return {
    watched: data.watched === true,
    completed: data.completed === true,
    positionFrame: num(data.positionFrame),
    updatedAt: num(data.updatedAt),
  };
};

export const lessonSummary = (docs: DocStore, uid: string, doc: DocRecord): LessonSummary => {
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
    progress: readProgress(docs, uid, doc.id),
  };
};

export const chapterState = (docs: DocStore, uid: string, courseId: string, doc: DocRecord, lessons?: DocRecord[]): ChapterState => {
  const data = doc.data;
  const rows = (lessons ?? docs.list(lessonsPath(uid, courseId))).filter((row) => row.data.chapterId === doc.id).sort(byIndex);
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
    lessons: rows.map((row) => lessonSummary(docs, uid, row)),
  };
};

export const loadChapter = (docs: DocStore, uid: string, courseId: string, chapterId: string) => {
  const doc = docs.get(chapterPath(uid, courseId, chapterId));
  return doc ? chapterState(docs, uid, courseId, doc) : null;
};

export const assembleCourse = (docs: DocStore, uid: string, courseId: string): CourseState | null => {
  const course = docs.get(coursePath(uid, courseId));
  if (!course) return null;
  const data = course.data;
  const lessons = docs.list(lessonsPath(uid, courseId));
  const chapters = docs
    .list(chaptersPath(uid, courseId))
    .sort(byIndex)
    .map((doc) => chapterState(docs, uid, courseId, doc, lessons));
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

export const listCourses = (docs: DocStore, uid: string): CourseState[] =>
  docs
    .list(`users/${uid}/courses`)
    .map((doc) => assembleCourse(docs, uid, doc.id))
    .filter((course): course is CourseState => Boolean(course));

export const segmentState = (docs: DocStore, uid: string, courseId: string, lessonId: string, doc: DocRecord): SegmentState => {
  const data = doc.data;
  const rounds = docs
    .list(`${segmentPath(uid, courseId, lessonId, doc.id)}/rounds`)
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
    rounds,
    error: str(data.error),
    errorInfo: (data.errorInfo as GenerationErrorInfo | null) ?? null,
    reviewStatus: data.reviewStatus === 'unreviewed' ? 'unreviewed' : null,
    audio: isAudio(data.audio) ? data.audio : undefined,
    voice: isVoice(data.voice) ? data.voice : undefined,
    audioUrl: isAudio(data.audio) ? `/api/audio/${data.audio.blobId}` : undefined,
  };
};

const isVoice = (value: unknown): value is SegmentVoice =>
  value === 'pending' || value === 'voicing' || value === 'voiced' || value === 'failed';

const isAudio = (value: unknown): value is SegmentAudio =>
  Boolean(value) && typeof value === 'object' && typeof (value as SegmentAudio).blobId === 'string' && typeof (value as SegmentAudio).seconds === 'number';

export const loadSegment = (docs: DocStore, uid: string, courseId: string, lessonId: string, segmentId: string) => {
  const doc = docs.get(segmentPath(uid, courseId, lessonId, segmentId));
  return doc ? segmentState(docs, uid, courseId, lessonId, doc) : null;
};

/** Finds a lesson by id alone (the API addresses lessons without their course). */
export const locateLesson = (docs: DocStore, uid: string, lessonId: string) => {
  const index = docs.get(lessonIndexPath(uid, lessonId))?.data;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = docs.get(lessonPath(uid, courseId, lessonId));
  return doc ? { courseId, doc } : null;
};

export const locateChapter = (docs: DocStore, uid: string, chapterId: string) => {
  const index = docs.get(chapterIndexPath(uid, chapterId))?.data;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = docs.get(chapterPath(uid, courseId, chapterId));
  return doc ? { courseId, doc } : null;
};

export const loadSummary = (docs: DocStore, uid: string, courseId: string, lessonId: string) => {
  const doc = docs.get(lessonPath(uid, courseId, lessonId));
  return doc ? lessonSummary(docs, uid, doc) : null;
};

export const lessonDetail = (docs: DocStore, uid: string, lessonId: string): LessonDetail | null => {
  const found = locateLesson(docs, uid, lessonId);
  if (!found) return null;
  const { courseId, doc } = found;
  const chapter = docs.get(chapterPath(uid, courseId, String(doc.data.chapterId ?? '')));
  const segments = docs
    .list(segmentsPath(uid, courseId, lessonId))
    .sort(byIndex)
    .map((row) => segmentState(docs, uid, courseId, lessonId, row));
  return {
    ...lessonSummary(docs, uid, doc),
    chapterTitle: String(chapter?.data.title ?? ''),
    explanationSummary: String(doc.data.explanationSummary ?? ''),
    studyDoc: String(doc.data.studyDoc ?? ''),
    segments,
  };
};

export const saveProgress = (docs: DocStore, uid: string, lessonId: string, patch: Partial<LessonProgress>) => {
  const current = readProgress(docs, uid, lessonId) ?? { watched: false, completed: false, positionFrame: 0, updatedAt: 0 };
  const next: LessonProgress = {
    watched: current.watched || patch.watched === true || patch.completed === true,
    completed: current.completed || patch.completed === true,
    positionFrame: Math.max(0, Math.round(patch.positionFrame ?? current.positionFrame)),
    updatedAt: Date.now(),
  };
  docs.set(progressPath(uid, lessonId), next);
  return next;
};

/** What the chat model sees: the segment on screen at `frame`, the script, the study notes, and the chapter text. */
export const chatContext = (docs: DocStore, uid: string, lessonId: string, frame: number) => {
  const detail = lessonDetail(docs, uid, lessonId);
  if (!detail) return null;
  const segment = detail.segments.find((item) => frame >= item.startFrame && frame < item.startFrame + item.durationInFrames) ?? null;
  const chapter = docs.get(chapterPath(uid, detail.courseId, detail.chapterId))?.data;
  return {
    courseId: detail.courseId,
    segmentId: segment?.id ?? null,
    lessonTitle: detail.title,
    chapterTitle: detail.chapterTitle,
    segmentNarration: segment?.narration ?? '',
    explanationSummary: detail.explanationSummary,
    studyDoc: detail.studyDoc,
    chapterText: String(chapter?.chapterText ?? ''),
  };
};
