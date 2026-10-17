import type { Clock, DocData, DocStore, TaskDispatcher } from '@krayon/shared';

const stale = (data: DocData, leaseExpiredOnly: boolean, now: number) =>
  !leaseExpiredOnly || (typeof data.leaseUntil === 'number' && data.leaseUntil < now);

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
  const open = new Map<string, { uid: string; courseId: string }>();
  const counts = { jobs: 0, chapters: 0, lessons: 0, segments: 0 };

  for (const doc of await docs.list('jobs')) {
    if (!stale(doc.data, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'queued' || doc.data.status === 'running') {
      await docs.set(doc.path, { status: 'error', error: 'interrupted' }, { merge: true });
      counts.jobs += 1;
    }
  }

  for (const doc of await docs.collectionGroup('courses', [])) {
    if (!stale(doc.data, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'structure' || doc.data.status === 'created' || doc.data.status === 'writing') mark(open, doc.path);
  }

  const failedChapters = new Set<string>();
  for (const doc of await docs.collectionGroup('chapters', [])) {
    if (doc.data.status === 'failed') failedChapters.add(doc.path);
    if (!stale(doc.data, opts.leaseExpiredOnly, now)) continue;
    if (doc.data.status === 'writing') {
      await docs.set(doc.path, { status: 'pending', statusDetail: null, leaseOwner: null, leaseUntil: 0 }, { merge: true });
      counts.chapters += 1;
    }
    if (doc.data.status === 'writing' || doc.data.status === 'pending') {
      const parts = doc.path.split('/');
      const uid = parts[1] ?? '';
      const courseId = parts[3] ?? '';
      if (uid && courseId) {
        await dispatch.dispatch({
          kind: 'chapter.write',
          queue: 'ai-background',
          payload: { uid, courseId, chapterId: doc.id },
          dedupeKey: `recover-chapter-${courseId}-${doc.id}`,
        });
      }
    }
  }

  for (const doc of await docs.collectionGroup('segments', [])) {
    if (!stale(doc.data, opts.leaseExpiredOnly, now)) continue;
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
    if (!stale(doc.data, opts.leaseExpiredOnly, now)) continue;
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
        await dispatch.dispatch({
          kind: 'lesson.plan',
          queue: 'ai-auto',
          payload: { uid, courseId, lessonId: doc.id, chapterId },
          dedupeKey: `recover-lesson-${doc.id}`,
        });
      }
    }
  }

  for (const { uid, courseId } of open.values()) {
    await dispatch.dispatch({
      kind: 'course.structure',
      queue: 'ai-auto',
      payload: { uid, courseId },
      dedupeKey: `recover-${uid}-${courseId}`,
    });
  }

  return { courses: open.size, ...counts };
};
