import {
  GenerationError,
  LESSON_WORDS,
  chapterTextSchema,
  lessonOutlineSchema,
  lessonScriptSchema,
  modelResponseSchemas,
  storedLessonSchema,
  structureSchema,
  studyDocSchema,
  wordCount,
  zodIssues,
} from '@krayon/shared';
import type { ParsedStructure } from '@krayon/shared';
import { coverageIssues, shiftCitations } from './citations.js';
import { isPdf } from './pdf.js';
import { detectOffset, normalizeRanges, subRanges, toPdfRanges, validateRanges } from './pageRanges.js';
import type { PdfRange } from './pageRanges.js';
import {
  chapterTextPrompt,
  lessonOutlinePrompt,
  lessonScriptPrompt,
  structurePrompt,
  studyDocPrompt,
} from './prompts.js';
import type { Priority } from './queue.js';
import { isCancelled } from './runtime.js';
import type { Runtime } from './runtime.js';
import { planLessonSizes } from './scriptLength.js';
import type { DraftLesson } from './scriptLength.js';
import {
  assembleCourse,
  chapterIdFor,
  chapterIndexPath,
  chapterPath,
  chaptersPath,
  coursePath,
  lessonIdFor,
  lessonIndexPath,
  lessonPath,
  lessonsPath,
} from './store.js';

/** Pages sent per chapter-text call; halved when the output hits MAX_TOKENS. */
const CHAPTER_TEXT_PAGES = 30;
/** Midpoint of LESSON_WORDS: chapter text of about this many words is one lesson. */
const WORDS_PER_LESSON = Math.round((LESSON_WORDS.min + LESSON_WORDS.max) / 2);
const MAX_LESSONS = 8;

/** Lessons to ask for. Uses the chapter text when it has words, otherwise about one lesson per six pages. */
export const lessonTarget = ({ words, pages }: { words?: number; pages: number }) => {
  const raw = words && words > 0 ? Math.round(words / WORDS_PER_LESSON) : Math.round(pages / 6);
  const suggested = Math.max(1, Math.min(MAX_LESSONS, raw));
  return { suggested, fewest: Math.max(1, Math.floor(suggested / 2)) };
};

/** One shorter retry when the doc hits MAX_TOKENS. Any other error is rethrown, including a second MAX_TOKENS. */
export const withShorterRetry = async <T>(write: (short: boolean) => Promise<T>): Promise<T> => {
  try {
    return await write(false);
  } catch (error) {
    if (!(error instanceof GenerationError) || error.code !== 'MAX_TOKENS') throw error;
    return write(true);
  }
};

const FINISHED_LINE = /[.!?)\]`*_|"”]\s*$/;

/** Drops a cut-off last line. */
export const trimUnfinished = (doc: string) => {
  const lines = doc.trimEnd().split('\n');
  if (lines.length < 2 || FINISHED_LINE.test(lines[lines.length - 1])) return doc;
  return lines.slice(0, -1).join('\n').trimEnd();
};

/** Clamps lesson pages into 1..pages, swaps a reversed range, and sorts by start page. An empty list stays empty. */
export const normalizeOutline = <T extends { pageStart: number; pageEnd: number }>(lessons: T[], pages: number): T[] => {
  const span = Math.max(1, pages);
  return lessons
    .map((lesson) => {
      let start = Math.min(span, Math.max(1, Math.round(lesson.pageStart)));
      let end = Math.min(span, Math.max(1, Math.round(lesson.pageEnd)));
      if (end < start) [start, end] = [end, start];
      return { ...lesson, pageStart: start, pageEnd: end };
    })
    .sort((a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd);
};

type ChapterDoc = {
  index: number;
  sourceId: string;
  title: string;
  pdfPageStart: number;
  pdfPageEnd: number;
  skip: boolean;
  status: string;
  chapterText?: string;
  outline?: OutlineEntry[];
  drafts?: Array<string | null>;
  planned?: PlannedLesson[];
};

type OutlineEntry = { title: string; focus: string; pageStart: number; pageEnd: number };
type PlannedLesson = DraftLesson & { studyDoc?: string };

const sameChapterPriority = (courseId: string, index: number): Priority => ({ courseId, kind: 'chapter', index });

/** Structure, chapter text, lesson split, scripts, and study docs. */
export const createChapterStages = (rt: Runtime) => {
  const { docs, log } = rt;

  const structure = async (uid: string, courseId: string) => {
    const course = (await docs.get(coursePath(uid, courseId)));
    if (!course) throw new Error('Course not found');
    const sources = (course.data.sources as Array<{ id: string; content_type: string }>) ?? [];
    const startedAt = Date.now();
    await docs.set(coursePath(uid, courseId), { status: 'structure', stage: 'structure', error: null, errorInfo: null }, { merge: true });
    await rt.emit({ type: 'structure.started', courseId, flow: 'structure', step: 'started' });
    const fields = { courseId };
    try {
      const ranges: Array<PdfRange & { sourceId: string }> = [];
      let title: string | null = null;
      let category: string | null = null;
      let pageTotal = 0;
      for (const source of sources) {
        const info = await rt.sources.info(uid, source.id);
        const photo = !isPdf(source.content_type);
        pageTotal += info.pageCount;
        let converted: PdfRange[] = [];
        let method: string | null = null;
        const result = await rt.modelJson<ParsedStructure>({
          name: 'structure',
          schema: structureSchema,
          responseSchema: modelResponseSchemas.structure,
          prompt: structurePrompt(info.pageCount, photo),
          files: [await rt.sources.full(uid, source.id)],
          long: true,
          attempts: 3,
          priority: { courseId, kind: 'auto', index: -1 },
          fields: { ...fields, sourceId: source.id, pages: info.pageCount },
          check: (value) => {
            if (photo) {
              converted = [{ title: value.chapters[0]?.title ?? value.title, pdfPageStart: 0, pdfPageEnd: 0, skip: false }];
              return [];
            }
            const resolver = detectOffset(value.chapters, info.pageTexts, info.labels, value.pageLabelSamples);
            method = resolver?.method ?? null;
            converted = normalizeRanges(toPdfRanges(value.chapters, info.pageCount, info.pageTexts, resolver), info.pageCount);
            return validateRanges(converted, info.pageCount);
          },
        });
        title ??= result.value.title;
        category ??= result.value.category;
        log.info(`Structure: ${converted.filter((range) => !range.skip).length} chapters`, {
          ...fields,
          event: 'structure.ranges',
          sourceId: source.id,
          offset_method: method,
          ranges: converted.map((range) => `${range.skip ? '~' : ''}${range.pdfPageStart + 1}-${range.pdfPageEnd + 1} ${range.title}`),
        });
        ranges.push(...converted.map((range) => ({ ...range, sourceId: source.id })));
      }
      for (const old of (await docs.list(chaptersPath(uid, courseId)))) await docs.delete(chapterPath(uid, courseId, old.id));
      for (const [index, range] of ranges.entries()) {
        const chapterId = chapterIdFor(courseId, index);
        await docs.set(chapterPath(uid, courseId, chapterId), {
          index,
          sourceId: range.sourceId,
          title: range.title,
          pdfPageStart: range.pdfPageStart,
          pdfPageEnd: range.pdfPageEnd,
          skip: range.skip,
          status: range.skip ? 'ready' : 'pending',
          statusDetail: null,
          error: null,
          errorInfo: null,
        });
        await docs.set(chapterIndexPath(uid, chapterId), { courseId });
      }
      await docs.set(coursePath(uid, courseId), { title, category, pageCount: pageTotal, stage: 'chapters', status: 'writing' }, { merge: true });
      log.info('Structure ready', { ...fields, event: 'structure.ready', duration_ms: Date.now() - startedAt, chapters: ranges.length });
      await rt.emit({
        type: 'structure.ready',
        courseId,
        title: title ?? undefined,
        category: category ?? undefined,
        chapters: (await assembleCourse(docs, uid, courseId))?.chapters ?? [],
        flow: 'structure',
        step: 'ready',
      });
      return true;
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, fields);
      log.error(`Structure failed: ${failure.code} ${failure.message}`, { ...fields, event: 'structure.failed', code: failure.code });
      await docs.set(coursePath(uid, courseId), { status: 'failed', error: failure.message, errorInfo: failure }, { merge: true });
      await rt.emit({ type: 'structure.failed', courseId, error: failure.message, errorInfo: failure, flow: 'structure', step: 'failed' });
      return false;
    }
  };

  /** Explains one page range; on MAX_TOKENS the range is halved and each half explained on its own. */
  const explainPages = async (
    uid: string,
    courseId: string,
    chapter: ChapterDoc & { id: string },
    start: number,
    end: number,
    part: number,
    parts: number,
  ): Promise<string> => {
    const priority = sameChapterPriority(courseId, chapter.index);
    try {
      const result = await rt.modelJson({
        name: 'chapterText',
        schema: chapterTextSchema,
        responseSchema: modelResponseSchemas.chapterText,
        prompt: chapterTextPrompt(chapter.title, start, end, part, parts),
        files: [await rt.sources.slice(uid, chapter.sourceId, start, end)],
        attempts: 3,
        long: true,
        priority,
        fields: { courseId, chapterId: chapter.id, pages: `${start + 1}-${end + 1}` },
      });
      const advice = coverageIssues(result.value.chapterText, end - start + 1);
      if (advice.length > 0) {
        log.info('Chapter text coverage is partial', {
          courseId,
          chapterId: chapter.id,
          event: 'chapter.coverage',
          issues: advice.slice(0, 5),
        });
      }
      return shiftCitations(result.value.chapterText, start - chapter.pdfPageStart);
    } catch (error) {
      if (error instanceof GenerationError && error.code === 'MAX_TOKENS' && end - start >= 3) {
        const middle = Math.floor((start + end) / 2);
        log.info('Chapter text too long; halving the page range', {
          courseId,
          chapterId: chapter.id,
          event: 'chapter.split_range',
          pages: `${start + 1}-${end + 1}`,
        });
        const first = await explainPages(uid, courseId, chapter, start, middle, part, parts);
        const second = await explainPages(uid, courseId, chapter, middle + 1, end, part, parts);
        return `${first}\n\n${second}`;
      }
      throw error;
    }
  };

  const writeScript = async (
    uid: string,
    courseId: string,
    chapter: ChapterDoc & { id: string },
    lesson: OutlineEntry,
    neighbours: { previousTitle?: string; nextTitle?: string },
  ) => {
    const result = await rt.modelJson({
      name: 'lessonScript',
      schema: lessonScriptSchema,
      responseSchema: modelResponseSchemas.lessonScript,
      prompt: lessonScriptPrompt({
        chapterTitle: chapter.title,
        title: lesson.title,
        focus: lesson.focus,
        start: lesson.pageStart,
        end: lesson.pageEnd,
        notes: chapter.chapterText ?? '',
        ...neighbours,
      }),
      files: [await rt.sources.slice(uid, chapter.sourceId, lesson.pageStart, lesson.pageEnd)],
      attempts: 3,
      long: true,
      priority: sameChapterPriority(courseId, chapter.index),
      fields: { courseId, chapterId: chapter.id, lesson: lesson.title },
    });
    return result.value.explanationSummary;
  };

  const writeStudyDoc = async (uid: string, courseId: string, chapter: ChapterDoc & { id: string }, lesson: DraftLesson) => {
    const doc = await withShorterRetry(async (short) => {
      const result = await rt.modelJson({
        name: 'studyDoc',
        schema: studyDocSchema,
        responseSchema: modelResponseSchemas.studyDoc,
        prompt: studyDocPrompt({
          chapterTitle: chapter.title,
          title: lesson.title,
          start: lesson.pageStart,
          end: lesson.pageEnd,
          script: lesson.script,
          notes: chapter.chapterText ?? '',
          short,
        }),
        files: [await rt.sources.slice(uid, chapter.sourceId, lesson.pageStart, lesson.pageEnd)],
        attempts: 3,
        long: true,
        priority: sameChapterPriority(courseId, chapter.index),
        fields: { courseId, chapterId: chapter.id, lesson: lesson.title },
      });
      return result.value.studyDoc;
    });
    return trimUnfinished(doc);
  };

  /**
   * Writes one chapter: chapter text (sub-ranges of 30 pages), lesson outline, scripts, length fitting,
   * and study docs, then stores its lessons as `outlined`. Partial work is saved on the chapter doc, so
   * a restart or Retry continues from the last finished step.
   */
  const writeChapter = async (uid: string, courseId: string, chapterId: string) => {
    const path = chapterPath(uid, courseId, chapterId);
    const found = (await docs.get(path));
    if (!found || found.data.skip === true || found.data.status === 'ready') return;
    const startedAt = Date.now();
    const fields = { courseId, chapterId };
    const chapter = { id: chapterId, ...(found.data as unknown as ChapterDoc) };
    const detail = async (statusDetail: string) => {
      await docs.set(path, { status: 'writing', statusDetail, leaseUntil: Date.now() + 15 * 60 * 1000 }, { merge: true });
      await rt.emitChapter(uid, courseId, chapterId, 'chapter.writing', { detail: statusDetail, step: 'writing' });
    };
    /** One roadmap row per lesson, as soon as its title is known and again as its script or notes finish. */
    const publishWriting = async (
      index: number,
      lesson: { title: string; focus: string; pageStart: number; pageEnd: number },
      statusDetail: string,
    ) => {
      const lessonId = lessonIdFor(chapterId, index);
      const lessonDoc = lessonPath(uid, courseId, lessonId);
      const existing = (await docs.get(lessonDoc));
      if (existing && existing.data.status !== 'writing') return;
      const pages: number[] = [];
      for (let page = lesson.pageStart; page <= lesson.pageEnd; page += 1) pages.push(page + 1);
      await docs.set(
        lessonDoc,
        {
          courseId,
          chapterId,
          sourceId: chapter.sourceId,
          index,
          title: lesson.title,
          focus: lesson.focus,
          pdfPageStart: lesson.pageStart,
          pdfPageEnd: lesson.pageEnd,
          sourcePages: pages,
          status: 'writing',
          statusDetail,
          durationFrames: 0,
          segmentCount: 0,
          segmentsReady: 0,
          wordCount: 0,
          shortSource: false,
          error: null,
          errorInfo: null,
        },
        { merge: true },
      );
      await docs.set(lessonIndexPath(uid, lessonId), { courseId, chapterId });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.writing', { step: 'writing' });
    };
    const dropExtraWriting = async (count: number) => {
      for (const row of (await docs.list(lessonsPath(uid, courseId)))) {
        if (row.data.chapterId !== chapterId || row.data.status !== 'writing') continue;
        if (Number(row.data.index) < count) continue;
        await docs.delete(lessonPath(uid, courseId, row.id));
        await docs.delete(lessonIndexPath(uid, row.id));
      }
    };
    await docs.set(path, { error: null, errorInfo: null }, { merge: true });
    try {
      if (!chapter.chapterText) {
        await detail('Reading the chapter');
        const parts = subRanges(chapter.pdfPageStart, chapter.pdfPageEnd, CHAPTER_TEXT_PAGES);
        const texts = await Promise.all(
          parts.map((part, index) => explainPages(uid, courseId, chapter, part.start, part.end, index + 1, parts.length)),
        );
        chapter.chapterText = texts.join('\n\n');
        await docs.set(path, { chapterText: chapter.chapterText }, { merge: true });
        log.info('Chapter text written', { ...fields, event: 'chapter.text', duration_ms: Date.now() - startedAt, words: wordCount(chapter.chapterText), parts: parts.length });
      }

      if (!chapter.outline) {
        await detail('Splitting into lessons');
        const pages = chapter.pdfPageEnd - chapter.pdfPageStart + 1;
        const { suggested } = lessonTarget({ words: wordCount(chapter.chapterText ?? ''), pages });
        const result = await rt.modelJson({
          name: 'lessonOutline',
          schema: lessonOutlineSchema,
          responseSchema: modelResponseSchemas.lessonOutline,
          prompt: lessonOutlinePrompt(chapter.title, chapter.pdfPageStart, chapter.pdfPageEnd, chapter.chapterText, suggested),
          files: [await rt.sources.slice(uid, chapter.sourceId, chapter.pdfPageStart, chapter.pdfPageEnd)],
          attempts: 3,
          long: true,
          priority: sameChapterPriority(courseId, chapter.index),
          fields,
        });
        chapter.outline = normalizeOutline(result.value.lessons, pages).map((lesson) => ({
          title: lesson.title,
          focus: lesson.focus,
          pageStart: chapter.pdfPageStart + lesson.pageStart - 1,
          pageEnd: chapter.pdfPageStart + lesson.pageEnd - 1,
        }));
        await docs.set(path, { outline: chapter.outline, drafts: chapter.outline.map(() => null) }, { merge: true });
      }

      if (!chapter.planned) {
        const outline = chapter.outline ?? [];
        const drafts = chapter.drafts?.length === outline.length ? [...chapter.drafts] : outline.map(() => null);
        for (const [index, lesson] of outline.entries()) {
          await publishWriting(index, lesson, drafts[index] ? 'Script written' : 'Writing the script');
        }
        await detail(`Writing ${outline.length} lesson script${outline.length === 1 ? '' : 's'}`);
        const scripts = await Promise.allSettled(
          outline.map(async (lesson, index) => {
            if (drafts[index]) return;
            drafts[index] = await writeScript(uid, courseId, chapter, lesson, {
              previousTitle: outline[index - 1]?.title,
              nextTitle: outline[index + 1]?.title,
            });
            await docs.set(path, { drafts }, { merge: true });
            await publishWriting(index, lesson, 'Script written');
          }),
        );
        const scriptError = scripts.find((result) => result.status === 'rejected');
        if (scriptError?.status === 'rejected') throw scriptError.reason;
        const planned: DraftLesson[] = planLessonSizes(
          outline.map((lesson, index) => ({ ...lesson, script: drafts[index] ?? '' })),
        );
        chapter.planned = planned;
        await docs.set(path, { planned }, { merge: true });
        log.info(`Chapter split into ${planned.length} lessons`, {
          ...fields,
          event: 'chapter.lessons',
          words: planned.map((lesson) => wordCount(lesson.script)),
          short_source: planned.filter((lesson) => lesson.shortSource).length,
        });
      }

      const planned = chapter.planned ?? [];
      await dropExtraWriting(planned.length);
      for (const [index, lesson] of planned.entries()) {
        await publishWriting(index, lesson, lesson.studyDoc ? 'Study notes written' : 'Writing study notes');
      }
      await detail('Writing study notes');
      const notes = await Promise.allSettled(
        planned.map(async (lesson, index) => {
          if (lesson.studyDoc) return;
          const written = { ...lesson, studyDoc: await writeStudyDoc(uid, courseId, chapter, lesson) };
          planned[index] = written;
          await docs.set(path, { planned }, { merge: true });
          await publishWriting(index, written, 'Study notes written');
        }),
      );
      const noteError = notes.find((result) => result.status === 'rejected');
      if (noteError?.status === 'rejected') throw noteError.reason;

      for (const [index, lesson] of planned.entries()) {
        const stored = storedLessonSchema.safeParse({
          title: lesson.title,
          explanationSummary: lesson.script,
          studyDoc: lesson.studyDoc ?? '',
          shortSource: lesson.shortSource === true,
        });
        if (!stored.success) throw new GenerationError('SCHEMA_INVALID', zodIssues(stored.error).map((issue) => ({ ...issue, path: `lessons[${index}].${issue.path}` })), 1);
        const lessonId = lessonIdFor(chapterId, index);
        const pages: number[] = [];
        for (let page = lesson.pageStart; page <= lesson.pageEnd; page += 1) pages.push(page + 1);
        await docs.set(lessonPath(uid, courseId, lessonId), {
          courseId,
          chapterId,
          sourceId: chapter.sourceId,
          index,
          title: lesson.title,
          focus: lesson.focus,
          pdfPageStart: lesson.pageStart,
          pdfPageEnd: lesson.pageEnd,
          sourcePages: pages,
          explanationSummary: lesson.script,
          studyDoc: lesson.studyDoc ?? '',
          wordCount: wordCount(lesson.script),
          shortSource: lesson.shortSource === true,
          status: 'outlined',
          statusDetail: null,
          durationFrames: 0,
          segmentCount: 0,
          segmentsReady: 0,
          error: null,
          errorInfo: null,
        });
        await docs.set(lessonIndexPath(uid, lessonId), { courseId, chapterId });
        await rt.emitLesson(uid, courseId, lessonId, 'lesson.outlined', { step: 'outlined' });
      }

      await docs.set(path, { status: 'ready', statusDetail: null }, { merge: true });
      log.info('Chapter ready', { ...fields, event: 'chapter.ready', duration_ms: Date.now() - startedAt, lessons: planned.length });
      await rt.emitChapter(uid, courseId, chapterId, 'chapter.ready', { step: 'ready' });
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, fields);
      log.error(`Chapter failed: ${failure.code} ${failure.message}`, { ...fields, event: 'chapter.failed', code: failure.code, issues: failure.issues.slice(0, 10) });
      await docs.set(path, { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
      for (const row of (await docs.list(lessonsPath(uid, courseId)))) {
        if (row.data.chapterId !== chapterId || row.data.status !== 'writing') continue;
        await docs.set(lessonPath(uid, courseId, row.id), { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
        await rt.emitLesson(uid, courseId, row.id, 'lesson.failed', { error: failure.message, errorInfo: failure, step: 'failed' });
      }
      await rt.emitChapter(uid, courseId, chapterId, 'chapter.failed', { error: failure.message, errorInfo: failure, step: 'failed' });
    }
  };

  return { structure, writeChapter };
};
