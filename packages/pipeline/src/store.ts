import { chapterFrom, courseFrom, lessonSummaryFrom, progressFrom, segmentFrom } from '@krayon/shared';
import type { DocData, DocStore, LessonDetail, LessonProgress, LessonSummary } from '@krayon/shared';

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
/** Top-level indexes. The per-user copies are no longer written. */
export const courseIndexPath = (courseId: string) => `courseIndex/${courseId}`;
export const chapterIndexPath = (chapterId: string) => `chapterIndex/${chapterId}`;
export const lessonIndexPath = (lessonId: string) => `lessonIndex/${lessonId}`;
export const courseViewPath = (courseId: string) => `courseViews/${courseId}`;
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

export const assembleCourse = async (docs: DocStore, ownerUid: string, courseId: string, viewerUid = ownerUid) => {
  const course = await docs.get(coursePath(ownerUid, courseId));
  if (!course) return null;
  const [chapterDocs, lessons] = await Promise.all([docs.list(chaptersPath(ownerUid, courseId)), docs.list(lessonsPath(ownerUid, courseId))]);
  const assembled = courseFrom(ownerUid, courseId, course, chapterDocs, lessons, await progressFor(docs, viewerUid, lessons.map((row) => row.id)));
  return { ...assembled, ownerUid };
};

/** Every course, newest first. Progress is the viewer's, never the uploader's. */
export const listCourses = async (docs: DocStore, viewerUid: string) => {
  const rows = (await docs.list('courseIndex')).sort((a, b) => Number(b.data.createdAt ?? 0) - Number(a.data.createdAt ?? 0));
  const courses = await Promise.all(
    rows.map((row) => assembleCourse(docs, String(row.data.ownerUid ?? ''), row.id, viewerUid)),
  );
  return courses.filter((course) => course !== null);
};

/** Writes the course doc and refreshes courseIndex. */
export const noteCourse = async (docs: DocStore, ownerUid: string, courseId: string, patch: DocData) => {
  await docs.set(coursePath(ownerUid, courseId), patch, { merge: true });
  const course = await docs.get(coursePath(ownerUid, courseId));
  const data = course?.data ?? {};
  const existing = await docs.get(courseIndexPath(courseId));
  const now = Date.now();
  await docs.set(
    courseIndexPath(courseId),
    {
      ownerUid,
      title: typeof data.title === 'string' ? data.title : null,
      status: typeof data.status === 'string' ? data.status : 'created',
      createdAt: existing?.data.createdAt ?? now,
      updatedAt: now,
    },
    { merge: true },
  );
};

export const noteChapter = async (docs: DocStore, ownerUid: string, courseId: string, chapterId: string) => {
  await docs.set(chapterIndexPath(chapterId), { ownerUid, courseId });
};

export const noteLesson = async (docs: DocStore, ownerUid: string, courseId: string, chapterId: string, lessonId: string) => {
  await docs.set(lessonIndexPath(lessonId), { ownerUid, courseId, chapterId });
};

export const loadSegment = async (docs: DocStore, uid: string, courseId: string, lessonId: string, segmentId: string) => {
  const doc = await docs.get(segmentPath(uid, courseId, lessonId, segmentId));
  if (!doc) return null;
  const rounds = await docs.list(`${segmentPath(uid, courseId, lessonId, segmentId)}/rounds`);
  return segmentFrom(lessonId, doc, rounds);
};

/** Finds a lesson from the global index. `viewerUid` is only for the caller's progress. */
export const locateLesson = async (docs: DocStore, viewerUid: string, lessonId: string) => {
  const index = (await docs.get(lessonIndexPath(lessonId)))?.data;
  const ownerUid = typeof index?.ownerUid === 'string' ? index.ownerUid : viewerUid;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = await docs.get(lessonPath(ownerUid, courseId, lessonId));
  return doc ? { ownerUid, courseId, chapterId: typeof index?.chapterId === 'string' ? index.chapterId : String(doc.data.chapterId ?? ''), doc } : null;
};

export const locateChapter = async (docs: DocStore, viewerUid: string, chapterId: string) => {
  const index = (await docs.get(chapterIndexPath(chapterId)))?.data;
  const ownerUid = typeof index?.ownerUid === 'string' ? index.ownerUid : viewerUid;
  const courseId = typeof index?.courseId === 'string' ? index.courseId : null;
  if (!courseId) return null;
  const doc = await docs.get(chapterPath(ownerUid, courseId, chapterId));
  return doc ? { ownerUid, courseId, doc } : null;
};

export const locateCourse = async (docs: DocStore, courseId: string) => {
  const index = (await docs.get(courseIndexPath(courseId)))?.data;
  const ownerUid = typeof index?.ownerUid === 'string' ? index.ownerUid : null;
  if (!ownerUid) return null;
  return { ownerUid, courseId };
};

export const loadSummary = async (docs: DocStore, ownerUid: string, courseId: string, lessonId: string, viewerUid = ownerUid) => {
  const doc = await docs.get(lessonPath(ownerUid, courseId, lessonId));
  if (!doc) return null;
  return { ...(await lessonSummary(docs, viewerUid, doc)), ownerUid };
};

export const lessonDetail = async (docs: DocStore, viewerUid: string, lessonId: string): Promise<LessonDetail | null> => {
  const found = await locateLesson(docs, viewerUid, lessonId);
  if (!found) return null;
  const { ownerUid, courseId, doc } = found;
  const chapter = await docs.get(chapterPath(ownerUid, courseId, String(doc.data.chapterId ?? '')));
  const rows = (await docs.list(segmentsPath(ownerUid, courseId, lessonId))).sort((a, b) => Number(a.data.index) - Number(b.data.index) || a.id.localeCompare(b.id));
  const segments = await Promise.all(
    rows.map(async (row) => segmentFrom(lessonId, row, await docs.list(`${segmentPath(ownerUid, courseId, lessonId, row.id)}/rounds`))),
  );
  return {
    ...(await lessonSummary(docs, viewerUid, doc)),
    ownerUid,
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
  const chapter = (await docs.get(chapterPath(detail.ownerUid ?? uid, detail.courseId, detail.chapterId)))?.data;
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
