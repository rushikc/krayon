import { chapterFrom, courseFrom, lessonSummaryFrom, progressFrom, segmentFrom } from '@krayon/shared';
import type { DocStore, LessonDetail, LessonProgress, LessonSummary } from '@krayon/shared';

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

const progressFor = async (docs: DocStore, uid: string, lessonIds: string[]) => {
  const entries = await Promise.all(lessonIds.map(async (lessonId) => [lessonId, await readProgress(docs, uid, lessonId)] as const));
  return (lessonId: string) => entries.find(([id]) => id === lessonId)?.[1] ?? null;
};

export const readProgress = async (docs: DocStore, uid: string, lessonId: string): Promise<LessonProgress | null> =>
  progressFrom((await docs.get(progressPath(uid, lessonId)))?.data);

export const lessonSummary = async (docs: DocStore, uid: string, doc: { id: string; path: string; data: Record<string, unknown>; updatedAt: number }): Promise<LessonSummary> =>
  lessonSummaryFrom(doc, await readProgress(docs, uid, doc.id));

export const loadChapter = async (docs: DocStore, uid: string, courseId: string, chapterId: string) => {
  const doc = await docs.get(chapterPath(uid, courseId, chapterId));
  if (!doc) return null;
  const lessons = await docs.list(lessonsPath(uid, courseId));
  return chapterFrom(courseId, doc, lessons, await progressFor(docs, uid, lessons.map((row) => row.id)));
};

export const assembleCourse = async (docs: DocStore, uid: string, courseId: string) => {
  const course = await docs.get(coursePath(uid, courseId));
  if (!course) return null;
  const [chapterDocs, lessons] = await Promise.all([docs.list(chaptersPath(uid, courseId)), docs.list(lessonsPath(uid, courseId))]);
  return courseFrom(uid, courseId, course, chapterDocs, lessons, await progressFor(docs, uid, lessons.map((row) => row.id)));
};

export const listCourses = async (docs: DocStore, uid: string) => {
  const rows = await docs.list(`users/${uid}/courses`);
  const courses = await Promise.all(rows.map((doc) => assembleCourse(docs, uid, doc.id)));
  return courses.filter((course) => course !== null);
};

export const loadSegment = async (docs: DocStore, uid: string, courseId: string, lessonId: string, segmentId: string) => {
  const doc = await docs.get(segmentPath(uid, courseId, lessonId, segmentId));
  if (!doc) return null;
  const rounds = await docs.list(`${segmentPath(uid, courseId, lessonId, segmentId)}/rounds`);
  return segmentFrom(lessonId, doc, rounds);
};

/** Finds a lesson by id alone (the API addresses lessons without their course). */
export const locateLesson = async (docs: DocStore, uid: string, lessonId: string) => {
  const index = (await docs.get(lessonIndexPath(uid, lessonId)))?.data;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = await docs.get(lessonPath(uid, courseId, lessonId));
  return doc ? { courseId, doc } : null;
};

export const locateChapter = async (docs: DocStore, uid: string, chapterId: string) => {
  const index = (await docs.get(chapterIndexPath(uid, chapterId)))?.data;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = await docs.get(chapterPath(uid, courseId, chapterId));
  return doc ? { courseId, doc } : null;
};

export const loadSummary = async (docs: DocStore, uid: string, courseId: string, lessonId: string) => {
  const doc = await docs.get(lessonPath(uid, courseId, lessonId));
  return doc ? lessonSummary(docs, uid, doc) : null;
};

export const lessonDetail = async (docs: DocStore, uid: string, lessonId: string): Promise<LessonDetail | null> => {
  const found = await locateLesson(docs, uid, lessonId);
  if (!found) return null;
  const { courseId, doc } = found;
  const chapter = await docs.get(chapterPath(uid, courseId, String(doc.data.chapterId ?? '')));
  const rows = (await docs.list(segmentsPath(uid, courseId, lessonId))).sort((a, b) => Number(a.data.index) - Number(b.data.index) || a.id.localeCompare(b.id));
  const segments = await Promise.all(
    rows.map(async (row) => segmentFrom(lessonId, row, await docs.list(`${segmentPath(uid, courseId, lessonId, row.id)}/rounds`))),
  );
  return {
    ...(await lessonSummary(docs, uid, doc)),
    chapterTitle: String(chapter?.data.title ?? ''),
    explanationSummary: String(doc.data.explanationSummary ?? ''),
    studyDoc: String(doc.data.studyDoc ?? ''),
    segments,
  };
};

export const saveProgress = async (docs: DocStore, uid: string, lessonId: string, patch: Partial<LessonProgress>, now = Date.now()) => {
  const current = (await readProgress(docs, uid, lessonId)) ?? { watched: false, completed: false, positionFrame: 0, updatedAt: 0 };
  const next: LessonProgress = {
    watched: current.watched || patch.watched === true || patch.completed === true,
    completed: current.completed || patch.completed === true,
    positionFrame: Math.max(0, Math.round(patch.positionFrame ?? current.positionFrame)),
    updatedAt: now,
  };
  await docs.set(progressPath(uid, lessonId), next);
  return next;
};

/** What the chat model sees: the segment on screen at `frame`, the script, the study notes, and the chapter text. */
export const chatContext = async (docs: DocStore, uid: string, lessonId: string, frame: number) => {
  const detail = await lessonDetail(docs, uid, lessonId);
  if (!detail) return null;
  const segment = detail.segments.find((item) => frame >= item.startFrame && frame < item.startFrame + item.durationInFrames) ?? null;
  const chapter = (await docs.get(chapterPath(uid, detail.courseId, detail.chapterId)))?.data;
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
