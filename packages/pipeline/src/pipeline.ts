import { randomUUID } from 'node:crypto';
import { chatSchema, modelResponseSchemas } from '@krayon/shared';
import type { TaskRequest } from '@krayon/shared';
import { createChapterStages } from './chapters.js';
import { claimStage, clearLease, renewLease } from './handlers/claim.js';
import { recountSegments } from './handlers/fanIn.js';
import { taskName } from './handlers/taskName.js';
import { createGemini } from './gemini.js';
import { createLessonStages } from './lessonRender.js';
import { chatPrompt } from './prompts.js';
import { createRuntime, isCancelled } from './runtime.js';
import type { PipelineDeps } from './runtime.js';
import { assembleCourse, chapterPath, chaptersPath, chatContext, coursePath, courseViewPath, lessonIdFor, lessonPath, lessonsPath, locateChapter, locateLesson, noteCourse, segmentsPath } from './store.js';

export type { PipelineConfig, PipelineDeps } from './runtime.js';

/**
 * Course → chapter → lesson → segment. A course runs structure, then chapters (CHAPTER_CONCURRENCY at once).
 * Only chapter 1 lesson 1 renders on its own; other lessons render when the learner asks.
 * Every step is stored as it finishes, so resumeCourse continues after a restart.
 */
export const createPipeline = (deps: PipelineDeps) => {
  const rt = createRuntime(deps);
  const { docs, config, log } = rt;
  const gemini = createGemini(config, log);
  const chapters = createChapterStages(rt);
  const lessons = createLessonStages(rt);
  const courseRuns = new Map<string, Promise<void>>();
  const chapterRuns = new Map<string, Promise<void>>();

  const runChapter = (uid: string, courseId: string, chapterId: string) => {
    let run = chapterRuns.get(chapterId);
    if (!run) {
      run = chapters.writeChapter(uid, courseId, chapterId).finally(() => chapterRuns.delete(chapterId));
      chapterRuns.set(chapterId, run);
    }
    return run;
  };

  /** Starts chapter 1 lesson 1 once, as soon as that chapter has lessons. */
  const autoRender = async (uid: string, courseId: string) => {
    const course = (await docs.get(coursePath(uid, courseId)));
    if (!course || course.data.autoRendered === true) return;
    const first = (await docs.list(chaptersPath(uid, courseId)))
      .filter((row) => row.data.skip !== true)
      .sort((a, b) => Number(a.data.index) - Number(b.data.index))[0];
    if (!first || first.data.status !== 'ready') return;
    const lessonId = lessonIdFor(first.id, 0);
    if (!(await docs.get(`${lessonsPath(uid, courseId)}/${lessonId}`))) return;
    await docs.set(coursePath(uid, courseId), { autoRendered: true }, { merge: true });
    await dispatch({
      kind: 'lesson.plan',
      queue: 'ai-auto',
      dedupeKey: taskName([uid, courseId, lessonId, 'plan', 'g0']),
      payload: { uid, courseId, lessonId, gen: 0, priority: { courseId, kind: 'auto', enqueuedAt: Date.now() } },
    });
  };

  /** Course is ready once every chapter has settled (ready or failed). */
  const settle = async (uid: string, courseId: string) => {
    const course = await assembleCourse(docs, uid, courseId);
    if (!course || course.stage === 'structure' || course.status === 'failed') return;
    const open = course.chapters.some((chapter) => chapter.status === 'pending' || chapter.status === 'writing');
    if (open) return;
    if (course.stage === 'done' && course.status === 'ready') return;
    await noteCourse(docs, uid, courseId, { stage: 'done', status: 'ready' });
    log.info('Course ready', {
      courseId,
      event: 'course.ready',
      chapters: course.chapters.length,
      failed_chapters: course.chapters.filter((chapter) => chapter.status === 'failed').length,
    });
    await rt.emit({ type: 'course.ready', courseId, flow: 'course', step: 'ready' });
  };

  const claimedChapters = new Set<string>();
  const inflight = new Map<string, Promise<void>>();

  const runTask = async (task: TaskRequest): Promise<void> => {
    const { uid, courseId, chapterId, lessonId, segmentId, prompt } = task.payload;
    if (task.kind === 'course.structure') {
      const course = (await docs.get(coursePath(uid, courseId)))?.data;
      if (!course) return;
      for (const row of await docs.list(lessonsPath(uid, courseId))) {
        if (row.data.status === 'queued' || row.data.status === 'rendering') {
          const gen = Number(row.data.renderGen ?? 0);
          await dispatch({
            kind: 'lesson.plan',
            queue: 'ai-auto',
            dedupeKey: taskName([uid, courseId, row.id, 'plan', `g${gen}`]),
            payload: { uid, courseId, lessonId: row.id, gen, priority: { courseId, kind: 'auto', enqueuedAt: Date.now() } },
          });
        }
      }
      if ((course.stage ?? 'structure') === 'structure') {
        const storedGen = Number(course.courseGen ?? 0);
        if (course.status === 'failed' && (task.payload.gen ?? 0) <= storedGen) return;
        if (!(await chapters.structure(uid, courseId))) return;
      }
      const pending = (await docs.list(chaptersPath(uid, courseId)))
        .filter((row) => row.data.skip !== true && (row.data.status === 'pending' || row.data.status === 'writing'))
        .sort((a, b) => Number(a.data.index) - Number(b.data.index));
      const width = Math.max(1, Math.min(config.chapterConcurrency, pending.length));
      await Promise.all(pending.slice(0, width).map((row) => dispatchChapter(uid, courseId, row.id)));
      await settle(uid, courseId);
      await autoRender(uid, courseId);
      return;
    }
    if (task.kind === 'chapter.write' && chapterId) {
      const chapterDoc = chapterPath(uid, courseId, chapterId);
      const owner = `${task.kind}:${task.dedupeKey ?? ''}:${randomUUID()}`;
      const claimed = await claimStage(
        docs,
        chapterDoc,
        owner,
        (data) => data.status === 'ready' || data.status === 'failed',
        { field: 'chapterGen', value: task.payload.gen ?? 0 },
      );
      if (claimed === 'skip') return;
      try {
        await runChapter(uid, courseId, chapterId);
      } finally {
        await clearLease(docs, chapterDoc);
      }
      await autoRender(uid, courseId);
      const pending = (await docs.list(chaptersPath(uid, courseId)))
        .filter((row) => row.data.skip !== true && (row.data.status === 'pending' || row.data.status === 'writing') && !claimedChapters.has(`${courseId}/${row.id}`))
        .sort((a, b) => Number(a.data.index) - Number(b.data.index));
      if (pending[0]) await dispatchChapter(uid, courseId, pending[0].id);
      await settle(uid, courseId);
      return;
    }
    if (task.kind === 'lesson.plan' && lessonId) {
      const found = await locateLesson(docs, uid, lessonId);
      if (!found) return;
      const owner = found.ownerUid;
      const priority = task.payload.priority ?? { courseId: found.courseId, kind: 'background' as const, enqueuedAt: Date.now() };
      const path = lessonPath(owner, found.courseId, lessonId);
      const lesson = found.doc.data;
      const gen = task.payload.gen ?? Number(lesson.renderGen ?? 0);
      if (lesson.status === 'ready' && !prompt && !task.payload.force) return;
      if (lesson.status === 'writing') return;
      const leaseOwner = `${task.kind}:${task.dedupeKey ?? ''}:${randomUUID()}`;
      await docs.set(path, {
        status: 'rendering',
        statusDetail: 'Planning the video',
        error: null,
        errorInfo: null,
        priority,
        renderGen: gen,
        leaseOwner,
        leaseUntil: Date.now() + 15 * 60 * 1000,
      }, { merge: true });
      await rt.emitLesson(owner, found.courseId, lessonId, 'lesson.rendering', { step: 'plan' });
      const existing = await docs.list(segmentsPath(owner, found.courseId, lessonId));
      if (task.payload.force || existing.length === 0) {
        await lessons.planSegments(owner, found.courseId, lessonId, lesson as never, priority, prompt);
      } else {
        for (const row of existing) {
          if (row.data.status === 'failed' || row.data.voice === 'failed') {
            await docs.set(`${segmentsPath(owner, found.courseId, lessonId)}/${row.id}`, {
              status: 'pending',
              voice: 'pending',
              error: null,
              errorInfo: null,
              audio: row.data.status === 'failed' ? null : row.data.audio ?? null,
            }, { merge: true });
          }
        }
      }
      await renewLease(docs, path, leaseOwner);
      const next = { uid: owner, courseId: found.courseId, lessonId, priority, gen };
      if (!config.ttsEnabled) {
        await dispatch({
          kind: 'lesson.retime',
          queue: 'ai-background',
          dedupeKey: taskName([owner, lessonId, 'retime', `g${gen}`]),
          payload: next,
        });
        return;
      }
      const rows = await docs.list(segmentsPath(owner, found.courseId, lessonId));
      await Promise.all(
        rows.map((row) =>
          dispatch({
            kind: 'segment.voice',
            queue: 'tts',
            dedupeKey: taskName([owner, lessonId, row.id, 'voice', `g${gen}`]),
            payload: { ...next, segmentId: row.id },
          }),
        ),
      );
      return;
    }
    if (task.kind === 'segment.voice' && lessonId && segmentId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      const segmentDoc = `${segmentsPath(uid, courseId, lessonId)}/${segmentId}`;
      const claimed = await claimStage(docs, segmentDoc, `${task.kind}:${task.dedupeKey ?? ''}:${randomUUID()}`, (data) => Boolean(data.audio) || data.status === 'ready' || data.voice === 'failed');
      if (claimed === 'skip') return;
      try {
        await lessons.voiceOne(uid, courseId, lessonId, segmentId, priority);
      } finally {
        await clearLease(docs, segmentDoc);
      }
      await recountSegments(docs, lessonPath(uid, courseId, lessonId), segmentsPath(uid, courseId, lessonId));
      const rows = await docs.list(segmentsPath(uid, courseId, lessonId));
      const pending = rows.filter((row) => !row.data.audio && row.data.voice !== 'failed' && row.data.status !== 'ready' && row.data.status !== 'failed');
      if (pending.length > 0) return;
      await dispatch({
        kind: 'lesson.retime',
        queue: await queueFor(priority, courseId),
        dedupeKey: taskName([uid, lessonId, 'retime', `g${task.payload.gen ?? 0}`]),
        payload: { uid, courseId, lessonId, priority, gen: task.payload.gen },
      });
      return;
    }
    if (task.kind === 'lesson.retime' && lessonId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      await lessons.retime(uid, courseId, lessonId);
      const rows = (await docs.list(segmentsPath(uid, courseId, lessonId))).filter((row) => row.data.status !== 'ready' && row.data.status !== 'failed');
      const buildQueue = await queueFor(priority, courseId);
      await Promise.all(
        rows.map((row) =>
          dispatch({
            kind: 'segment.build',
            queue: buildQueue,
            dedupeKey: taskName([uid, lessonId, row.id, 'build', `g${task.payload.gen ?? 0}`]),
            payload: { uid, courseId, lessonId, segmentId: row.id, priority, epoch: task.payload.epoch, gen: task.payload.gen },
          }),
        ),
      );
      if (rows.length === 0) {
        await dispatch({
          kind: 'lesson.finalize',
          queue: await queueFor(priority, courseId),
          dedupeKey: taskName([uid, lessonId, 'finalize', `g${task.payload.gen ?? 0}`]),
          payload: { uid, courseId, lessonId, priority, gen: task.payload.gen },
        });
      }
      return;
    }
    if (task.kind === 'segment.build' && lessonId && segmentId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      const segmentDoc = `${segmentsPath(uid, courseId, lessonId)}/${segmentId}`;
      const claimed = await claimStage(docs, segmentDoc, `${task.kind}:${task.dedupeKey ?? ''}:${randomUUID()}`, (data) => data.status === 'ready' || data.status === 'failed');
      if (claimed === 'skip') return;
      try {
        await lessons.buildSegment(uid, courseId, lessonId, segmentId, priority, task.payload.epoch ?? rt.currentEpoch());
      } finally {
        await clearLease(docs, segmentDoc);
      }
      await recountSegments(docs, lessonPath(uid, courseId, lessonId), segmentsPath(uid, courseId, lessonId));
      const rows = await docs.list(segmentsPath(uid, courseId, lessonId));
      const open = rows.filter((row) => row.data.status !== 'ready' && row.data.status !== 'failed');
      if (open.length > 0) return;
      await dispatch({
        kind: 'lesson.finalize',
        queue: await queueFor(priority, courseId),
        dedupeKey: taskName([uid, lessonId, 'finalize', `g${task.payload.gen ?? 0}`]),
        payload: { uid, courseId, lessonId, priority, gen: task.payload.gen },
      });
      return;
    }
    if (task.kind === 'lesson.finalize' && lessonId) {
      const path = lessonPath(uid, courseId, lessonId);
      const counts = await lessons.countReady(uid, courseId, lessonId);
      if (counts.ready === counts.total && counts.total > 0) {
        await docs.set(path, { status: 'ready', statusDetail: null, error: null, errorInfo: null }, { merge: true });
        await rt.emitLesson(uid, courseId, lessonId, 'lesson.ready', { ...counts, step: 'ready' });
        return;
      }
      const failed = counts.total - counts.ready;
      const failure = {
        code: 'SCHEMA_INVALID' as const,
        message: `${failed} of ${counts.total} segments could not be made.`,
        issues: (await docs.list(segmentsPath(uid, courseId, lessonId)))
          .filter((row) => row.data.status === 'failed')
          .map((row) => ({ path: `segments.${row.id}`, message: String(row.data.error ?? 'Failed') })),
        attempts: 1 + Math.max(0, config.segmentRetries),
      };
      await docs.set(path, { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.failed', { ...counts, error: failure.message, errorInfo: failure, step: 'failed' });
      return;
    }
    if (task.kind === 'segment.narrate' && lessonId && segmentId) {
      await lessons.regenerateSegment(uid, lessonId, segmentId, prompt);
    }
  };

  const queueFor = async (priority: { userClicked?: boolean; kind?: string }, viewedCourseId: string): Promise<'ai-user' | 'ai-auto' | 'ai-background'> => {
    if (priority.userClicked) return 'ai-user';
    const viewed = await docs.get(courseViewPath(viewedCourseId));
    const at = Number(viewed?.data.lastViewedAt ?? 0);
    if (at > 0 && Date.now() - at < 2 * 60 * 1000) return 'ai-user';
    if (priority.kind === 'auto') return 'ai-auto';
    return 'ai-background';
  };

  const dispatchLocal = async (task: TaskRequest) => {
    const key = task.dedupeKey;
    const existing = key ? inflight.get(key) : undefined;
    if (existing) return { taskId: key ?? task.kind, deduped: true };
    const run = runTask(task).finally(() => {
      if (key) inflight.delete(key);
    });
    if (key) inflight.set(key, run);
    await run;
    return { taskId: key ?? task.kind, deduped: false };
  };

  const dispatch = (task: TaskRequest) => (deps.dispatcher ? deps.dispatcher.dispatch(task) : dispatchLocal(task));

  const dispatchChapter = async (uid: string, courseId: string, chapterId: string) => {
    const claim = `${courseId}/${chapterId}`;
    if (claimedChapters.has(claim)) return;
    claimedChapters.add(claim);
    const gen = Number((await docs.get(chapterPath(uid, courseId, chapterId)))?.data.chapterGen ?? 0);
    return dispatch({
      kind: 'chapter.write',
      queue: 'ai-background',
      dedupeKey: taskName([uid, courseId, chapterId, 'write', `g${gen}`]),
      payload: { uid, courseId, chapterId, gen },
    }).finally(() => {
      claimedChapters.delete(claim);
    });
  };

  const handle = (task: TaskRequest) => dispatchLocal(task).then(() => undefined);

  /** Continues a course from its stored stage: structure, pending chapters, and queued lessons. */
  const resumeCourse = (uid: string, courseId: string) => {
    let run = courseRuns.get(courseId);
    if (run) return run;
    run = (async () => {
      const course = (await docs.get(coursePath(uid, courseId)))?.data;
      if (!course) return;
      await dispatch({
        kind: 'course.structure',
        queue: 'ai-auto',
        dedupeKey: taskName([uid, courseId, 'structure', `g${Number(course.courseGen ?? 0)}`]),
        payload: { uid, courseId, gen: Number(course.courseGen ?? 0) },
      });
    })()
      .catch((error: unknown) => {
        if (!isCancelled(error)) throw error;
      })
      .finally(() => courseRuns.delete(courseId));
    courseRuns.set(courseId, run);
    return run;
  };

  /** Course Retry: re-runs a failed structure pass, or puts failed chapters back on the list. */
  const retryCourse = async (uid: string, courseId: string) => {
    const course = await docs.get(coursePath(uid, courseId));
    if (!course) throw new Error('Course not found');
    const gen = Number(course.data.courseGen ?? 0) + 1;
    if ((course.data.stage ?? 'structure') === 'structure') {
      await noteCourse(docs, uid, courseId, { status: 'created', courseGen: gen, error: null, errorInfo: null });
    } else {
      for (const row of await docs.list(chaptersPath(uid, courseId))) {
        if (row.data.status !== 'failed') continue;
        const path = chapterPath(uid, courseId, row.id);
        await docs.transact(async (tx) => {
          const current = await tx.get(path);
          if (!current || current.data.status !== 'failed') return;
          tx.set(
            path,
            {
              status: 'pending',
              chapterGen: Number(current.data.chapterGen ?? 0) + 1,
              error: null,
              errorInfo: null,
              leaseOwner: null,
              leaseUntil: 0,
            },
            { merge: true },
          );
        });
      }
      await noteCourse(docs, uid, courseId, { stage: 'chapters', status: 'writing', courseGen: gen, error: null, errorInfo: null });
    }
    return resumeCourse(uid, courseId);
  };

  /** Chapter Retry: continues the chapter from its last stored step. */
  const retryChapter = async (uid: string, chapterId: string) => {
    const found = await locateChapter(docs, uid, chapterId);
    if (!found) throw new Error('Chapter not found');
    const { courseId } = found;
    const path = chapterPath(uid, courseId, chapterId);
    await docs.transact(async (tx) => {
      const current = await tx.get(path);
      if (!current) return;
      tx.set(
        path,
        {
          status: 'pending',
          chapterGen: Number(current.data.chapterGen ?? 0) + 1,
          error: null,
          errorInfo: null,
          leaseOwner: null,
          leaseUntil: 0,
        },
        { merge: true },
      );
    });
    for (const row of await docs.list(lessonsPath(uid, courseId))) {
      if (row.data.chapterId === chapterId && row.data.status === 'failed') {
        await docs.set(`${lessonsPath(uid, courseId)}/${row.id}`, { status: 'writing', error: null, errorInfo: null }, { merge: true });
      }
    }
    const course = (await docs.get(coursePath(uid, courseId)))?.data;
    if (course?.stage === 'done') await noteCourse(docs, uid, courseId, { stage: 'chapters', status: 'writing' });
    await rt.emitChapter(uid, courseId, chapterId, 'chapter.writing', { step: 'retry' });
    await dispatchChapter(uid, courseId, chapterId);
  };

  /** Render (or Retry) a lesson the learner clicked. Ready and in-flight lessons are left as they are. */
  const renderLesson = async (uid: string, lessonId: string) => {
    const found = await locateLesson(docs, uid, lessonId);
    const owner = found?.ownerUid ?? uid;
    const courseId = found?.courseId ?? '';
    const current = Number(found?.doc.data.renderGen ?? 0);
    const gen = found?.doc.data.status === 'failed' ? current + 1 : current;
    if (found && gen !== current) {
      await docs.set(lessonPath(owner, courseId, lessonId), { renderGen: gen }, { merge: true });
    }
    return dispatch({
      kind: 'lesson.plan',
      queue: 'ai-user',
      dedupeKey: taskName([owner, lessonId, 'plan', `g${gen}`]),
      payload: { uid: owner, courseId, lessonId, gen, priority: { userClicked: true, enqueuedAt: Date.now() } },
    });
  };

  /** Makes a ready lesson's video again from the script. Optional instructions are added to the beat plan. */
  const rerenderLesson = (uid: string, lessonId: string, instructions?: string) => {
    const gen = Date.now();
    return dispatch({
      kind: 'lesson.plan',
      queue: 'ai-user',
      dedupeKey: taskName([uid, lessonId, 'plan', `g${gen}`]),
      payload: { uid, courseId: '', lessonId, prompt: instructions, gen, force: true, priority: { userClicked: true, enqueuedAt: gen } },
    });
  };

  /** Last Cloud Tasks attempt: mark the entity failed and let the parent settle. */
  const failTask = async (task: TaskRequest) => {
    const { uid, courseId, chapterId, lessonId, segmentId } = task.payload;
    const message = 'Stopped after the last attempt.';
    if (segmentId && lessonId && courseId) {
      await docs.set(`${segmentsPath(uid, courseId, lessonId)}/${segmentId}`, { status: 'failed', error: message, errorInfo: { code: 'MODEL_ERROR', message, issues: [], attempts: 3 } }, { merge: true });
      await recountSegments(docs, lessonPath(uid, courseId, lessonId), segmentsPath(uid, courseId, lessonId));
      const rows = await docs.list(segmentsPath(uid, courseId, lessonId));
      if (rows.every((row) => row.data.status === 'ready' || row.data.status === 'failed')) {
        await docs.set(lessonPath(uid, courseId, lessonId), { status: 'failed', error: message }, { merge: true });
      }
      return;
    }
    if (lessonId && courseId) {
      await docs.set(lessonPath(uid, courseId, lessonId), { status: 'failed', error: message, leaseUntil: 0 }, { merge: true });
      return;
    }
    if (chapterId && courseId) {
      await docs.set(chapterPath(uid, courseId, chapterId), { status: 'failed', error: message, leaseUntil: 0 }, { merge: true });
      await settle(uid, courseId);
    }
  };

  /** Answers a learner question from the lesson context: current segment, script, study notes, chapter text. */
  const ask = async (uid: string, lessonId: string, question: string, frame: number) => {
    const context = await chatContext(docs, uid, lessonId, frame);
    if (!context) throw new Error('Lesson not found');
    const { courseId, segmentId, ...material } = context;
    const result = await rt.modelJson({
      name: 'chat',
      schema: chatSchema,
      responseSchema: modelResponseSchemas.chat,
      prompt: chatPrompt({ question, ...material }),
      priority: { courseId, userClicked: true, enqueuedAt: 0 },
      fields: { courseId, lessonId, segmentId: segmentId ?? undefined, frame },
    });
    return { answer: result.value.answer, segmentId };
  };

  /** Reset: drops cached slices and page text, empties both queues, and stops runs in flight. */
  const clearCaches = () => {
    rt.clear();
    lessons.clear();
    courseRuns.clear();
    chapterRuns.clear();
  };

  return {
    gemini,
    warmup: rt.renderer.warmup,
    rendererHealth: rt.renderer.health,
    closeRenderer: rt.renderer.close,
    runCourse: resumeCourse,
    handle,
    resumeCourse,
    retryCourse,
    retryChapter,
    renderLesson,
    rerenderLesson,
    failTask,
    retryLesson: renderLesson,
    regenerateSegment: lessons.regenerateSegment,
    ask,
    clearCaches,
    ttsHealth: () => rt.tts.health(),
  };
};

export type Pipeline = ReturnType<typeof createPipeline>;
