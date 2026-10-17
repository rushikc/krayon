import { chatSchema, modelResponseSchemas } from '@krayon/shared';
import type { z } from 'zod';
import { createChapterStages } from './chapters.js';
import { GeminiNotConfigured, createGemini } from './gemini.js';
import type { GeminiFile } from './gemini.js';
import { generateValidated } from './generate.js';
import { createLessonStages } from './lessonRender.js';
import { chatPrompt } from './prompts.js';
import { createRuntime, isCancelled } from './runtime.js';
import type { PipelineDeps } from './runtime.js';
import { assembleCourse, chapterPath, chaptersPath, chatContext, coursePath, lessonIdFor, lessonsPath, locateChapter } from './store.js';

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
  const autoRender = (uid: string, courseId: string) => {
    const course = docs.get(coursePath(uid, courseId));
    if (!course || course.data.autoRendered === true) return;
    const first = docs
      .list(chaptersPath(uid, courseId))
      .filter((row) => row.data.skip !== true)
      .sort((a, b) => Number(a.data.index) - Number(b.data.index))[0];
    if (!first || first.data.status !== 'ready') return;
    const lessonId = lessonIdFor(first.id, 0);
    if (!docs.get(`${lessonsPath(uid, courseId)}/${lessonId}`)) return;
    docs.set(coursePath(uid, courseId), { autoRendered: true }, true);
    void quiet(lessons.renderLesson(uid, lessonId, { auto: true }), { courseId, lessonId });
  };

  /** Course is ready once every chapter has settled (ready or failed). */
  const settle = (uid: string, courseId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    if (!course || course.stage === 'structure' || course.status === 'failed') return;
    const open = course.chapters.some((chapter) => chapter.status === 'pending' || chapter.status === 'writing');
    if (open) return;
    if (course.stage === 'done' && course.status === 'ready') return;
    docs.set(coursePath(uid, courseId), { stage: 'done', status: 'ready' }, true);
    log.info('Course ready', {
      courseId,
      event: 'course.ready',
      chapters: course.chapters.length,
      failed_chapters: course.chapters.filter((chapter) => chapter.status === 'failed').length,
    });
    rt.emit({ type: 'course.ready', courseId, flow: 'course', step: 'ready' });
  };

  const runChapters = async (uid: string, courseId: string) => {
    const waiting = docs
      .list(chaptersPath(uid, courseId))
      .filter((row) => row.data.skip !== true && (row.data.status === 'pending' || row.data.status === 'writing'))
      .sort((a, b) => Number(a.data.index) - Number(b.data.index));
    const workers = Array.from({ length: Math.max(1, Math.min(config.chapterConcurrency, waiting.length)) }, async () => {
      for (let next = waiting.shift(); next; next = waiting.shift()) {
        await runChapter(uid, courseId, next.id);
        autoRender(uid, courseId);
      }
    });
    await Promise.all(workers);
    settle(uid, courseId);
  };

  /** Continues a course from its stored stage: structure, pending chapters, and queued lessons. */
  const resumeCourse = (uid: string, courseId: string) => {
    let run = courseRuns.get(courseId);
    if (run) return run;
    run = (async () => {
      const course = docs.get(coursePath(uid, courseId))?.data;
      if (!course) return;
      for (const row of docs.list(lessonsPath(uid, courseId))) {
        if (row.data.status === 'queued' || row.data.status === 'rendering') {
          void quiet(lessons.renderLesson(uid, row.id), { courseId, lessonId: row.id });
        }
      }
      if ((course.stage ?? 'structure') === 'structure') {
        if (course.status === 'failed') return;
        if (!(await chapters.structure(uid, courseId))) return;
      }
      await runChapters(uid, courseId);
      autoRender(uid, courseId);
    })()
      .catch((error: unknown) => {
        if (!isCancelled(error)) throw error;
      })
      .finally(() => courseRuns.delete(courseId));
    courseRuns.set(courseId, run);
    return run;
  };

  /** Course Retry: re-runs a failed structure pass, or puts failed chapters back on the list. */
  const retryCourse = (uid: string, courseId: string) => {
    const course = docs.get(coursePath(uid, courseId));
    if (!course) throw new Error('Course not found');
    if ((course.data.stage ?? 'structure') === 'structure') {
      docs.set(coursePath(uid, courseId), { status: 'created', error: null, errorInfo: null }, true);
    } else {
      for (const row of docs.list(chaptersPath(uid, courseId))) {
        if (row.data.status === 'failed') docs.set(chapterPath(uid, courseId, row.id), { status: 'pending', error: null, errorInfo: null }, true);
      }
      docs.set(coursePath(uid, courseId), { stage: 'chapters', status: 'writing', error: null, errorInfo: null }, true);
    }
    return resumeCourse(uid, courseId);
  };

  /** Chapter Retry: continues the chapter from its last stored step. */
  const retryChapter = async (uid: string, chapterId: string) => {
    const found = locateChapter(docs, uid, chapterId);
    if (!found) throw new Error('Chapter not found');
    const { courseId } = found;
    docs.set(chapterPath(uid, courseId, chapterId), { status: 'pending', error: null, errorInfo: null }, true);
    const course = docs.get(coursePath(uid, courseId))?.data;
    if (course?.stage === 'done') docs.set(coursePath(uid, courseId), { stage: 'chapters', status: 'writing' }, true);
    rt.emitChapter(uid, courseId, chapterId, 'chapter.writing', { step: 'retry' });
    await runChapter(uid, courseId, chapterId);
    autoRender(uid, courseId);
    settle(uid, courseId);
  };

  /** Render (or Retry) a lesson the learner clicked. Ready and in-flight lessons are left as they are. */
  const renderLesson = (uid: string, lessonId: string) => lessons.renderLesson(uid, lessonId, { userClicked: true });

  /** Makes a ready lesson's video again from the script. Optional instructions are added to the beat plan. */
  const rerenderLesson = (uid: string, lessonId: string, instructions?: string) =>
    lessons.renderLesson(uid, lessonId, { userClicked: true, force: true, instructions });

  /** Answers a learner question from the lesson context: current segment, script, study notes, chapter text. */
  const ask = async (uid: string, lessonId: string, question: string, frame: number) => {
    const context = chatContext(docs, uid, lessonId, frame);
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
