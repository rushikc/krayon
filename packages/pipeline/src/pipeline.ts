import { chatSchema, modelResponseSchemas } from '@krayon/shared';
import type { TaskRequest } from '@krayon/shared';
import type { z } from 'zod';
import { createChapterStages } from './chapters.js';
import { claimStage, clearLease } from './handlers/claim.js';
import { recountSegments } from './handlers/fanIn.js';
import { GeminiNotConfigured, createGemini } from './gemini.js';
import type { GeminiFile } from './gemini.js';
import { generateValidated } from './generate.js';
import { createLessonStages } from './lessonRender.js';
import { chatPrompt } from './prompts.js';
import { createRuntime, isCancelled } from './runtime.js';
import type { PipelineDeps } from './runtime.js';
import { assembleCourse, chapterPath, chaptersPath, chatContext, coursePath, lessonIdFor, lessonPath, lessonsPath, locateChapter, locateLesson, segmentsPath } from './store.js';

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

  const quiet = (work: Promise<unknown>, fields: Record<string, unknown>) =>
    work.catch((error: unknown) => {
      if (isCancelled(error)) return;
      log.error('Background work failed', { ...fields, event: 'pipeline.background' }, error);
    });

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
    void quiet(
      handle({
        kind: 'lesson.plan',
        queue: 'ai-auto',
        dedupeKey: `lesson-${lessonId}-plan-g0`,
        payload: { uid, courseId, lessonId, priority: { courseId, kind: 'auto', enqueuedAt: Date.now() } },
      }),
      { courseId, lessonId },
    );
  };

  /** Course is ready once every chapter has settled (ready or failed). */
  const settle = async (uid: string, courseId: string) => {
    const course = await assembleCourse(docs, uid, courseId);
    if (!course || course.stage === 'structure' || course.status === 'failed') return;
    const open = course.chapters.some((chapter) => chapter.status === 'pending' || chapter.status === 'writing');
    if (open) return;
    if (course.stage === 'done' && course.status === 'ready') return;
    await docs.set(coursePath(uid, courseId), { stage: 'done', status: 'ready' }, { merge: true });
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
          void quiet(lessons.renderLesson(uid, row.id), { courseId, lessonId: row.id });
        }
      }
      if ((course.stage ?? 'structure') === 'structure') {
        if (course.status === 'failed') return;
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
      const claimed = await claimStage(docs, chapterDoc, `chapter-${chapterId}`, (data) => data.status === 'ready' || data.status === 'failed');
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
      const priority = task.payload.priority ?? { courseId: found.courseId, kind: 'background' as const, enqueuedAt: Date.now() };
      const path = lessonPath(uid, found.courseId, lessonId);
      const lesson = found.doc.data;
      if (lesson.status === 'ready' && !prompt && task.payload.gen == null) return;
      if (lesson.status === 'writing') return;
      await docs.set(path, { status: 'rendering', statusDetail: 'Planning the video', error: null, errorInfo: null, priority }, { merge: true });
      await rt.emitLesson(uid, found.courseId, lessonId, 'lesson.rendering', { step: 'plan' });
      const existing = await docs.list(segmentsPath(uid, found.courseId, lessonId));
      if (existing.length === 0 || prompt || task.payload.gen != null) {
        await lessons.planSegments(uid, found.courseId, lessonId, lesson as never, priority, prompt);
      }
      if (!config.ttsEnabled) {
        await dispatch({
          kind: 'lesson.retime',
          queue: 'ai-background',
          dedupeKey: `lesson-${lessonId}-retime-g${task.payload.gen ?? 0}`,
          payload: { uid, courseId: found.courseId, lessonId, priority, gen: task.payload.gen },
        });
        return;
      }
      const rows = await docs.list(segmentsPath(uid, found.courseId, lessonId));
      await Promise.all(
        rows.map((row) =>
          dispatch({
            kind: 'segment.voice',
            queue: 'tts',
            dedupeKey: `seg-${row.id}-voice-g${task.payload.gen ?? 0}`,
            payload: { uid, courseId: found.courseId, lessonId, segmentId: row.id, priority, gen: task.payload.gen },
          }),
        ),
      );
      return;
    }
    if (task.kind === 'segment.voice' && lessonId && segmentId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      const segmentDoc = `${segmentsPath(uid, courseId, lessonId)}/${segmentId}`;
      const claimed = await claimStage(docs, segmentDoc, `voice-${segmentId}`, (data) => Boolean(data.audio) || data.status === 'ready' || data.voice === 'failed');
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
        queue: queueFor(priority),
        dedupeKey: `lesson-${lessonId}-retime-g${task.payload.gen ?? 0}`,
        payload: { uid, courseId, lessonId, priority, gen: task.payload.gen },
      });
      return;
    }
    if (task.kind === 'lesson.retime' && lessonId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      await lessons.retime(uid, courseId, lessonId);
      const rows = (await docs.list(segmentsPath(uid, courseId, lessonId))).filter((row) => row.data.status !== 'ready' && row.data.status !== 'failed');
      await Promise.all(
        rows.map((row) =>
          dispatch({
            kind: 'segment.build',
            queue: queueFor(priority),
            dedupeKey: `seg-${row.id}-build-g${task.payload.gen ?? 0}`,
            payload: { uid, courseId, lessonId, segmentId: row.id, priority, epoch: task.payload.epoch, gen: task.payload.gen },
          }),
        ),
      );
      if (rows.length === 0) {
        await dispatch({
          kind: 'lesson.finalize',
          queue: queueFor(priority),
          dedupeKey: `lesson-${lessonId}-finalize-g${task.payload.gen ?? 0}`,
          payload: { uid, courseId, lessonId, priority, gen: task.payload.gen },
        });
      }
      return;
    }
    if (task.kind === 'segment.build' && lessonId && segmentId) {
      const priority = task.payload.priority ?? { courseId, kind: 'background' as const };
      const segmentDoc = `${segmentsPath(uid, courseId, lessonId)}/${segmentId}`;
      const claimed = await claimStage(docs, segmentDoc, `build-${segmentId}`, (data) => data.status === 'ready' || data.status === 'failed');
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
        queue: queueFor(priority),
        dedupeKey: `lesson-${lessonId}-finalize-g${task.payload.gen ?? 0}`,
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

  const queueFor = (priority: { userClicked?: boolean; kind?: string }): 'ai-user' | 'ai-auto' | 'ai-background' => {
    if (priority.userClicked || priority.kind === 'auto') return priority.userClicked ? 'ai-user' : 'ai-auto';
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

  const dispatchChapter = (uid: string, courseId: string, chapterId: string) => {
    const claim = `${courseId}/${chapterId}`;
    if (claimedChapters.has(claim)) return Promise.resolve();
    claimedChapters.add(claim);
    return dispatch({
      kind: 'chapter.write',
      queue: 'ai-background',
      dedupeKey: `chapter-${courseId}-${chapterId}`,
      payload: { uid, courseId, chapterId },
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
      for (const row of (await docs.list(lessonsPath(uid, courseId)))) {
        if (row.data.status === 'queued' || row.data.status === 'rendering') {
          void quiet(lessons.renderLesson(uid, row.id), { courseId, lessonId: row.id });
        }
      }
      await handle({
        kind: 'course.structure',
        queue: 'ai-auto',
        dedupeKey: `course-${courseId}`,
        payload: { uid, courseId },
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
    const course = (await docs.get(coursePath(uid, courseId)));
    if (!course) throw new Error('Course not found');
    if ((course.data.stage ?? 'structure') === 'structure') {
      await docs.set(coursePath(uid, courseId), { status: 'created', error: null, errorInfo: null }, { merge: true });
    } else {
      for (const row of (await docs.list(chaptersPath(uid, courseId)))) {
        if (row.data.status === 'failed') await docs.set(chapterPath(uid, courseId, row.id), { status: 'pending', error: null, errorInfo: null }, { merge: true });
      }
      await docs.set(coursePath(uid, courseId), { stage: 'chapters', status: 'writing', error: null, errorInfo: null }, { merge: true });
    }
    return resumeCourse(uid, courseId);
  };

  /** Chapter Retry: continues the chapter from its last stored step. */
  const retryChapter = async (uid: string, chapterId: string) => {
    const found = await locateChapter(docs, uid, chapterId);
    if (!found) throw new Error('Chapter not found');
    const { courseId } = found;
    await docs.set(chapterPath(uid, courseId, chapterId), { status: 'pending', error: null, errorInfo: null, leaseOwner: null, leaseUntil: 0 }, { merge: true });
    for (const row of await docs.list(lessonsPath(uid, courseId))) {
      if (row.data.chapterId === chapterId && row.data.status === 'failed') {
        await docs.set(`${lessonsPath(uid, courseId)}/${row.id}`, { status: 'writing', error: null, errorInfo: null }, { merge: true });
      }
    }
    const course = (await docs.get(coursePath(uid, courseId)))?.data;
    if (course?.stage === 'done') await docs.set(coursePath(uid, courseId), { stage: 'chapters', status: 'writing' }, { merge: true });
    await rt.emitChapter(uid, courseId, chapterId, 'chapter.writing', { step: 'retry' });
    await runChapter(uid, courseId, chapterId);
    await autoRender(uid, courseId);
    await settle(uid, courseId);
  };

  /** Render (or Retry) a lesson the learner clicked. Ready and in-flight lessons are left as they are. */
  const renderLesson = (uid: string, lessonId: string) =>
    handle({
      kind: 'lesson.plan',
      queue: 'ai-user',
      dedupeKey: `lesson-${lessonId}-plan-g0`,
      payload: { uid, courseId: '', lessonId, priority: { userClicked: true, enqueuedAt: Date.now() } },
    });

  /** Makes a ready lesson's video again from the script. Optional instructions are added to the beat plan. */
  const rerenderLesson = (uid: string, lessonId: string, instructions?: string) => {
    const gen = Date.now();
    return handle({
      kind: 'lesson.plan',
      queue: 'ai-user',
      dedupeKey: `lesson-${lessonId}-plan-g${gen}`,
      payload: { uid, courseId: '', lessonId, prompt: instructions, gen, priority: { userClicked: true, enqueuedAt: gen } },
    });
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

  /**
   * POST /api/ai/generate with a named schema: validated like the pipeline (zod + retries),
   * through the @google/genai client. Throws GenerationError.
   */
  const generateNamed = async <T>(
    name: string,
    schema: z.ZodType<T>,
    responseSchema: Record<string, unknown>,
    prompt: string,
    files: GeminiFile[],
    model?: string | null,
  ) => {
    if (gemini.backend() === 'none') throw new GeminiNotConfigured('No AI backend configured');
    return generateValidated({
      name,
      prompt,
      schema,
      attempts: 2,
      generate: (text) => gemini.generateJson(text, responseSchema, files, model),
      log,
      fields: { schema_name: name },
    });
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
    retryLesson: renderLesson,
    regenerateSegment: lessons.regenerateSegment,
    ask,
    generateNamed,
    clearCaches,
    ttsHealth: () => rt.tts.health(),
  };
};

export type Pipeline = ReturnType<typeof createPipeline>;
