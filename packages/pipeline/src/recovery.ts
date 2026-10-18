import type { Clock, DocData, DocRecord, DocStore, TaskDispatcher } from '@krayon/shared';
import { taskName } from './handlers/taskName.js';
import { chapterIndexPath, lessonIndexPath, noteChapter, noteCourse, noteLesson } from './store.js';

const staleMs = () => (Number(process.env.STALE_MINUTES || 15) || 15) * 60 * 1000;

const asMs = (value: number) => (value > 0 && value < 1e12 ? value * 1000 : value);

const liveLease = (data: DocData, now: number) => typeof data.leaseUntil === 'number' && data.leaseUntil > now;

const stale = (doc: DocRecord, leaseExpiredOnly: boolean, now: number) => {
  if (!leaseExpiredOnly) return true;
  if (liveLease(doc.data, now)) return false;
  const until = typeof doc.data.leaseUntil === 'number' ? doc.data.leaseUntil : 0;
  const leaseDead = until > 0 && until < now;
  const fieldAt = typeof doc.data.updatedAt === 'number' ? doc.data.updatedAt : 0;
  const recordAt = asMs(typeof doc.updatedAt === 'number' ? doc.updatedAt : 0);
  const updatedAt = fieldAt > 0 ? fieldAt : recordAt;
  const queued = until <= 0;
  return leaseDead || (queued && updatedAt > 0 && now - updatedAt > staleMs());
};

/** Copies course, chapter, and lesson docs (and leftover per-user indexes) into the shared indexes. */
const backfillIndexes = async (docs: DocStore) => {
  for (const doc of await docs.collectionGroup('courses', [])) {
    const parts = doc.path.split('/');
    if (parts[0] === 'users' && parts[2] === 'courses' && parts.length === 4 && parts[1]) {
      await noteCourse(docs, parts[1], doc.id, {});
    }
  }
  for (const doc of await docs.collectionGroup('chapters', [])) {
    const parts = doc.path.split('/');
    if (parts[0] === 'users' && parts[2] === 'courses' && parts[4] === 'chapters' && parts[1] && parts[3]) {
      await noteChapter(docs, parts[1], parts[3], doc.id);
    }
  }
  for (const doc of await docs.collectionGroup('lessons', [])) {
    const parts = doc.path.split('/');
    const chapterId = typeof doc.data.chapterId === 'string' ? doc.data.chapterId : '';
    if (parts[0] === 'users' && parts[2] === 'courses' && parts[4] === 'lessons' && parts[1] && parts[3] && chapterId) {
      await noteLesson(docs, parts[1], parts[3], chapterId, doc.id);
    }
  }
  const groups = ['lessonIndex', 'chapterIndex'] as const;
  for (const group of groups) {
    for (const doc of await docs.collectionGroup(group, [])) {
      const parts = doc.path.split('/');
      if (parts[0] !== 'users') continue;
      const ownerUid = typeof doc.data.ownerUid === 'string' ? doc.data.ownerUid : parts[1];
      const courseId = typeof doc.data.courseId === 'string' ? doc.data.courseId : '';
      if (!ownerUid || !courseId) continue;
      if (group === 'lessonIndex') {
        const chapterId = typeof doc.data.chapterId === 'string' ? doc.data.chapterId : '';
        if (chapterId && !(await docs.get(lessonIndexPath(doc.id)))) {
          await noteLesson(docs, ownerUid, courseId, chapterId, doc.id);
        }
      } else if (!(await docs.get(chapterIndexPath(doc.id)))) {
        await noteChapter(docs, ownerUid, courseId, doc.id);
      }
    }
  }
};

const mark = (open: Map<string, { uid: string; courseId: string }>, path: string) => {
  const parts = path.split('/');
  const uid = parts[1] ?? '';
  const courseId = parts[3] ?? '';
  if (uid && courseId) open.set(`${uid}/${courseId}`, { uid, courseId });
};

/**
 * Puts interrupted work back on the queue. Local startup passes leaseExpiredOnly false.
 * The sweeper passes true, so only a dead lease is restarted.
 */
export const recoverStale = async (
  docs: DocStore,
  clock: Clock,
  dispatch: TaskDispatcher,
  opts: { leaseExpiredOnly: boolean },
) => {
  const now = clock.now();
  await backfillIndexes(docs);
  const open = new Map<string, { uid: string; courseId: string }>();
  const counts = { jobs: 0, chapters: 0, lessons: 0, segments: 0 };

  for (const doc of await docs.list('jobs')) {
    if (!stale(doc, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'queued' || doc.data.status === 'running') {
      await docs.set(doc.path, { status: 'error', error: 'interrupted' }, { merge: true });
      counts.jobs += 1;
    }
  }

  for (const doc of await docs.collectionGroup('courses', [])) {
    if (!stale(doc, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'structure' || doc.data.status === 'created' || doc.data.status === 'writing') mark(open, doc.path);
  }

  const failedChapters = new Set<string>();
  for (const doc of await docs.collectionGroup('chapters', [])) {
    if (doc.data.status === 'failed') failedChapters.add(doc.path);
    if (opts.leaseExpiredOnly && liveLease(doc.data, now)) continue;
    if (!stale(doc, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'writing') {
      await docs.set(doc.path, { status: 'pending', statusDetail: null, leaseOwner: null, leaseUntil: 0 }, { merge: true });
      counts.chapters += 1;
    }
    if (doc.data.status === 'writing' || doc.data.status === 'pending') {
      const parts = doc.path.split('/');
      const uid = parts[1] ?? '';
      const courseId = parts[3] ?? '';
      if (uid && courseId) {
        const gen = Number(doc.data.chapterGen ?? 0) + 1;
        await docs.set(doc.path, { chapterGen: gen }, { merge: true });
        await dispatch.dispatch({
          kind: 'chapter.write',
          queue: 'ai-background',
          payload: { uid, courseId, chapterId: doc.id, gen },
          dedupeKey: taskName([uid, courseId, doc.id, 'write', `g${gen}`]),
        });
      }
    }
  }

  const liveLessonFromSegments = new Set<string>();
  for (const doc of await docs.collectionGroup('segments', [])) {
    if (opts.leaseExpiredOnly && liveLease(doc.data, now)) {
      const lessonPath = doc.path.split('/segments/')[0];
      if (lessonPath) liveLessonFromSegments.add(lessonPath);
      continue;
    }
    if (!stale(doc, opts.leaseExpiredOnly, now)) continue;
    const patch: DocData = {};
    const status = typeof doc.data.status === 'string' ? doc.data.status : '';
    if (status && !['pending', 'ready', 'failed'].includes(status)) {
      patch.status = 'pending';
      patch.statusDetail = null;
      counts.segments += 1;
    }
    if (doc.data.voice === 'voicing') patch.voice = 'pending';
    if (Object.keys(patch).length > 0) await docs.set(doc.path, patch, { merge: true });
  }

  for (const doc of await docs.collectionGroup('lessons', [])) {
    if (opts.leaseExpiredOnly && (liveLease(doc.data, now) || liveLessonFromSegments.has(doc.path))) continue;
    if (!stale(doc, opts.leaseExpiredOnly, now)) continue;
    const chapterId = typeof doc.data.chapterId === 'string' ? doc.data.chapterId : '';
    const chapterPath = doc.path.split('/lessons/')[0] + `/chapters/${chapterId}`;
    if (doc.data.status === 'writing' && chapterId && failedChapters.has(chapterPath)) {
      await docs.set(doc.path, { status: 'failed', statusDetail: null, leaseOwner: null, leaseUntil: 0 }, { merge: true });
      counts.lessons += 1;
      continue;
    }
    if (doc.data.status === 'rendering' || doc.data.status === 'queued') {
      await docs.set(doc.path, { status: 'queued', statusDetail: 'Queued', leaseOwner: null, leaseUntil: 0 }, { merge: true });
      counts.lessons += 1;
      const parts = doc.path.split('/');
      const uid = parts[1] ?? '';
      const courseId = parts[3] ?? '';
      if (uid && courseId) {
        const gen = Number(doc.data.renderGen ?? 0) + 1;
        await docs.set(doc.path, { renderGen: gen }, { merge: true });
        await dispatch.dispatch({
          kind: 'lesson.plan',
          queue: 'ai-auto',
          payload: { uid, courseId, lessonId: doc.id, chapterId, gen },
          dedupeKey: taskName([uid, courseId, doc.id, 'plan', `g${gen}`]),
        });
      }
    }
  }

  for (const { uid, courseId } of open.values()) {
    await dispatch.dispatch({
      kind: 'course.structure',
      queue: 'ai-auto',
      payload: { uid, courseId },
      dedupeKey: taskName([uid, courseId, 'structure', 'recover']),
    });
  }

  return { courses: open.size, ...counts };
};
