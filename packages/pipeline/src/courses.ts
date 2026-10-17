import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  BlobStorage,
  CourseState,
  DocRecord,
  DocStore,
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

const schemaFile = fileURLToPath(new URL('./ai_schemas.json', import.meta.url));

export const responseSchemas = JSON.parse(readFileSync(schemaFile, 'utf8')) as {
  roadmap: Record<string, unknown>;
  lesson: Record<string, unknown>;
  segment: Record<string, unknown>;
};

export const reviewResponseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    score: { type: 'number' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          frame: { type: 'number' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['frame', 'problem', 'severity'],
      },
    },
    patchedSegment: { type: 'object' },
  },
  required: ['pass', 'score', 'issues'],
};

const segmentState = (docs: DocStore, uid: string, courseId: string, topicId: string, doc: DocRecord): SegmentState => {
  const rounds = docs.list(`${segmentPath(uid, courseId, topicId, doc.id)}/rounds`).map((round) => {
    const data = round.data;
    return {
      n: Number(round.id),
      segment: data.segment as GeneratedSegment,
      issues: (data.issues as SegmentRound['issues']) ?? [],
      score: (data.score as number | null) ?? null,
      pass: (data.pass as boolean | null) ?? null,
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
  };
};

export const assembleCourse = (docs: DocStore, uid: string, courseId: string): CourseState | null => {
  const course = docs.get(coursePath(uid, courseId));
  if (!course) return null;
  const data = course.data;
  const topics = docs.list(`${coursePath(uid, courseId)}/topics`).map((topic): TopicState => {
    const segments = docs
      .list(`${topicPath(uid, courseId, topic.id)}/segments`)
      .map((segment) => segmentState(docs, uid, courseId, topic.id, segment));
    const lessonSegments = segments.map((segment) => segment.segment).filter((segment): segment is GeneratedSegment => Boolean(segment));
    const studyDoc = String(topic.data.studyDoc ?? '');
    return {
      id: topic.id,
      title: String(topic.data.title ?? ''),
      summary: String(topic.data.summary ?? ''),
      prerequisites: (topic.data.prerequisites as string[]) ?? [],
      sourcePages: (topic.data.sourcePages as number[]) ?? [],
      status: (topic.data.status as TopicState['status']) ?? 'queued',
      statusDetail: (topic.data.statusDetail as string | null) ?? null,
      error: (topic.data.error as string | null) ?? null,
      lesson: lessonSegments.length ? { studyDoc, segments: lessonSegments } : null,
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
  for (const segment of lesson.segments) {
    docs.set(segmentPath(uid, courseId, topicId, segment.id), {
      title: segment.title,
      status: 'ready',
      statusDetail: null,
      segment,
    });
  }
};

export const readSources = (blobs: BlobStorage, uid: string, course: CourseState) =>
  course.sources.map((source) => {
    const blob = blobs.get(uid, source.id);
    if (!blob) throw new Error(`Missing source ${source.id}`);
    return { id: source.id, name: source.name, contentType: source.content_type, data: blob.data };
  });
