import { modelResponseSchemas } from '@krayon/shared';
import type {
  BlobStorage,
  CourseState,
  DocRecord,
  DocStore,
  GenerationErrorInfo,
  GeneratedLesson,
  GeneratedSegment,
  Roadmap,
  SegmentRound,
  SegmentState,
  TopicState,
} from '@krayon/shared';

export const coursePath = (uid: string, courseId: string) => `users/${uid}/courses/${courseId}`;
export const topicPath = (uid: string, courseId: string, topicId: string) => `${coursePath(uid, courseId)}/topics/${topicId}`;
export const segmentPath = (uid: string, courseId: string, topicId: string, segmentId: string) =>
  `${topicPath(uid, courseId, topicId)}/segments/${segmentId}`;
export const roundPath = (uid: string, courseId: string, topicId: string, segmentId: string, n: number) =>
  `${segmentPath(uid, courseId, topicId, segmentId)}/rounds/${n}`;

/**
 * Gemini response schemas generated from the zod schemas in @krayon/shared (single source of truth).
 * src/ai_schemas.json is a generated copy for reference: `npm run schemas -w @krayon/pipeline`.
 */
export const responseSchemas = {
  roadmap: modelResponseSchemas.roadmap,
  lesson: modelResponseSchemas.lesson,
  segment: modelResponseSchemas.segment,
};

export const reviewResponseSchema: Record<string, unknown> = modelResponseSchemas.review;

const segmentState = (docs: DocStore, uid: string, courseId: string, topicId: string, doc: DocRecord): SegmentState => {
  const rounds = docs.list(`${segmentPath(uid, courseId, topicId, doc.id)}/rounds`).map((round) => {
    const data = round.data;
    return {
      n: Number(round.id),
      segment: data.segment as GeneratedSegment,
      issues: (data.issues as SegmentRound['issues']) ?? [],
      score: (data.score as number | null) ?? null,
      pass: (data.pass as boolean | null) ?? null,
      fixed: typeof data.fixed === 'boolean' ? data.fixed : undefined,
      keyframeIds: (data.keyframeIds as string[]) ?? [],
    };
  });
  return {
    id: doc.id,
    title: String(doc.data.title ?? ''),
    status: (doc.data.status as SegmentState['status']) ?? 'draft',
    statusDetail: (doc.data.statusDetail as string | null) ?? null,
    rounds,
    segment: (doc.data.segment as GeneratedSegment | null) ?? null,
    error: (doc.data.error as string | null) ?? null,
    errorInfo: (doc.data.errorInfo as GenerationErrorInfo | null) ?? null,
    reviewStatus: doc.data.reviewStatus === 'unreviewed' ? 'unreviewed' : null,
  };
};

export const assembleCourse = (docs: DocStore, uid: string, courseId: string): CourseState | null => {
  const course = docs.get(coursePath(uid, courseId));
  if (!course) return null;
  const data = course.data;
  const orderOf = (data: Record<string, unknown>) => (typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER);
  const topics = docs
    .list(`${coursePath(uid, courseId)}/topics`)
    .sort((a, b) => orderOf(a.data) - orderOf(b.data) || a.id.localeCompare(b.id))
    .map((topic): TopicState => {
      const status = (topic.data.status as TopicState['status']) ?? 'queued';
      const segments = docs
        .list(`${topicPath(uid, courseId, topic.id)}/segments`)
        .sort((a, b) => orderOf(a.data) - orderOf(b.data) || a.id.localeCompare(b.id))
        .map((segment) => segmentState(docs, uid, courseId, topic.id, segment));
      const lessonSegments = segments
        .map((segment) => segment.segment)
        .filter((segment): segment is GeneratedSegment => Boolean(segment));
      const studyDoc = String(topic.data.studyDoc ?? '');
      return {
        id: topic.id,
        title: String(topic.data.title ?? ''),
        summary: String(topic.data.summary ?? ''),
        prerequisites: (topic.data.prerequisites as string[]) ?? [],
        sourcePages: (topic.data.sourcePages as number[]) ?? [],
        status,
        statusDetail: (topic.data.statusDetail as string | null) ?? null,
        error: (topic.data.error as string | null) ?? null,
        errorInfo: (topic.data.errorInfo as GenerationErrorInfo | null) ?? null,
        lesson: status === 'ready' && lessonSegments.length ? { studyDoc, segments: lessonSegments } : null,
        segments,
      };
    });
  return {
    id: courseId,
    owner: uid,
    status: (data.status as CourseState['status']) ?? 'created',
    fileNames: (data.fileNames as string[]) ?? [],
    sources: (data.sources as CourseState['sources']) ?? [],
    roadmap: (data.roadmap as Roadmap | null) ?? null,
    topics,
    error: (data.error as string | null) ?? null,
  };
};

export const listCourses = (docs: DocStore, uid: string): CourseState[] =>
  docs.list(`users/${uid}/courses`).map((doc) => assembleCourse(docs, uid, doc.id)).filter((course): course is CourseState => Boolean(course));

export const saveLesson = (docs: DocStore, uid: string, courseId: string, topicId: string, lesson: GeneratedLesson) => {
  docs.set(topicPath(uid, courseId, topicId), { studyDoc: lesson.studyDoc, status: 'ready', statusDetail: null, error: null }, true);
  lesson.segments.forEach((segment, index) => {
    const path = segmentPath(uid, courseId, topicId, segment.id);
    // Keep the drafted position so failed segments kept between ready ones stay in place.
    const previous = docs.get(path)?.data;
    const stored = previous?.order;
    const preserved = previous?.status === 'unreviewed' || previous?.status === 'blocked' ? previous.status : 'ready';
    docs.set(path, {
      title: segment.title,
      status: preserved,
      statusDetail: null,
      reviewStatus: preserved === 'unreviewed' ? 'unreviewed' : null,
      segment,
      order: typeof stored === 'number' ? stored : index,
    });
  });
};

export const readSources = (blobs: BlobStorage, uid: string, course: CourseState) =>
  course.sources.map((source) => {
    const blob = blobs.get(uid, source.id);
    if (!blob) throw new Error(`Missing source ${source.id}`);
    return { id: source.id, name: source.name, contentType: source.content_type, data: blob.data };
  });
