import {
  GenerationError,
  LESSON_WORDS,
  LESSON_WORDS_ACCEPTED,
  chapterTextSchema,
  lessonOutlineSchema,
  lessonScriptSchema,
  modelResponseSchemas,
  scriptWordIssue,
  storedLessonSchema,
  structureSchema,
  studyDocSchema,
  wordCount,
  zodIssues,
} from '@krayon/shared';
import type { GenerationIssue, ParsedStructure } from '@krayon/shared';
import { coverageIssues, shiftCitations } from './citations.js';
import { isPdf } from './pdf.js';
import { detectOffset, subRanges, toPdfRanges, validateRanges } from './pageRanges.js';
import type { PdfRange } from './pageRanges.js';
import {
  chapterTextPrompt,
  lessonOutlinePrompt,
  lessonScriptPrompt,
  structurePrompt,
  studyDocPrompt,
  tightenPrompt,
} from './prompts.js';
import type { Priority } from './queue.js';
import { isCancelled } from './runtime.js';
import type { Runtime } from './runtime.js';
import { planLessonSizes, truncateScript } from './scriptLength.js';
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

/** The model sometimes closes the JSON string mid-sentence while reporting a normal stop. */
export const studyDocFinished = (doc: string) => /key takeaways/i.test(doc) && FINISHED_LINE.test(doc.trimEnd());

/** Drops a cut-off last line. */
export const trimUnfinished = (doc: string) => {
  const lines = doc.trimEnd().split('\n');
  if (lines.length < 2 || FINISHED_LINE.test(lines[lines.length - 1])) return doc;
  return lines.slice(0, -1).join('\n').trimEnd();
};

/** Soft outline issues: too few lessons, or pages at the start, end, or between lessons left out. */
export const outlineAdvice = (
  value: { lessons: Array<{ pageStart: number; pageEnd: number }> },
  pages: number,
  fewest: number,
  suggested: number,
): GenerationIssue[] => {
  const issues: GenerationIssue[] = [];
  const { lessons } = value;
  if (lessons.length < fewest) issues.push({ path: 'lessons', message: `Has ${lessons.length} lessons for ${pages} pages; split it into about ${suggested}.` });
  if (lessons.length > Math.ceil(suggested * 1.5)) {
    issues.push({ path: 'lessons', message: `Has ${lessons.length} lessons; about ${suggested} fit, combine related ones.` });
  }
  if (lessons.length === 0) return issues;
  if (lessons[0].pageStart > 2) issues.push({ path: 'lessons[0].pageStart', message: `Pages 1 to ${lessons[0].pageStart - 1} are not in any lesson.` });
  const last = lessons.length - 1;
  if (lessons[last].pageEnd < pages - 1) {
    issues.push({ path: `lessons[${last}].pageEnd`, message: `Pages ${lessons[last].pageEnd + 1} to ${pages} are not in any lesson.` });
  }
  lessons.slice(1).forEach((lesson, index) => {
    const gap = lesson.pageStart - lessons[index].pageEnd - 1;
    if (gap > 2) issues.push({ path: `lessons[${index + 1}].pageStart`, message: `Pages ${lessons[index].pageEnd + 1} to ${lesson.pageStart - 1} are not in any lesson.` });
  });
  return issues;
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
    const course = docs.get(coursePath(uid, courseId));
    if (!course) throw new Error('Course not found');
    const sources = (course.data.sources as Array<{ id: string; content_type: string }>) ?? [];
    const startedAt = Date.now();
    docs.set(coursePath(uid, courseId), { status: 'structure', stage: 'structure', error: null, errorInfo: null }, true);
    rt.emit({ type: 'structure.started', courseId, flow: 'structure', step: 'started' });
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
            converted = toPdfRanges(value.chapters, info.pageCount, info.pageTexts, resolver);
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
      for (const old of docs.list(chaptersPath(uid, courseId))) docs.delete(chapterPath(uid, courseId, old.id));
      ranges.forEach((range, index) => {
        const chapterId = chapterIdFor(courseId, index);
        docs.set(chapterPath(uid, courseId, chapterId), {
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
        docs.set(chapterIndexPath(uid, chapterId), { courseId });
      });
      docs.set(coursePath(uid, courseId), { title, category, pageCount: pageTotal, stage: 'chapters', status: 'writing' }, true);
      log.info('Structure ready', { ...fields, event: 'structure.ready', duration_ms: Date.now() - startedAt, chapters: ranges.length });
      rt.emit({
        type: 'structure.ready',
        courseId,
        title: title ?? undefined,
        category: category ?? undefined,
        chapters: assembleCourse(docs, uid, courseId)?.chapters ?? [],
        flow: 'structure',
        step: 'ready',
      });
      return true;
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, fields);
      log.error(`Structure failed: ${failure.code} ${failure.message}`, { ...fields, event: 'structure.failed', code: failure.code });
      docs.set(coursePath(uid, courseId), { status: 'failed', error: failure.message, errorInfo: failure }, true);
      rt.emit({ type: 'structure.failed', courseId, error: failure.message, errorInfo: failure, flow: 'structure', step: 'failed' });
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
        check: (value) => coverageIssues(value.chapterText, end - start + 1),
        acceptBest: true,
        attempts: 3,
        long: true,
        priority,
        fields: { courseId, chapterId: chapter.id, pages: `${start + 1}-${end + 1}` },
      });
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

  const outlineIssues = (value: { lessons: Array<{ pageStart: number; pageEnd: number }> }, pages: number): GenerationIssue[] => {
    const issues: GenerationIssue[] = [];
    let previousStart = 1;
    value.lessons.forEach((lesson, index) => {
      if (lesson.pageStart > pages) issues.push({ path: `lessons[${index}].pageStart`, message: `Must be 1 to ${pages}.` });
      if (lesson.pageEnd > pages) issues.push({ path: `lessons[${index}].pageEnd`, message: `Must be 1 to ${pages}.` });
      if (lesson.pageEnd < lesson.pageStart) issues.push({ path: `lessons[${index}].pageEnd`, message: 'Ends before it starts.' });
      if (lesson.pageStart < previousStart) issues.push({ path: `lessons[${index}].pageStart`, message: 'Lessons must follow the pages in order.' });
      previousStart = lesson.pageStart;
    });
    return issues;
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
      check: (value) => {
        const issue = scriptWordIssue(value.explanationSummary);
        return issue ? [issue] : [];
      },
      acceptBest: true,
      attempts: 3,
      long: true,
      priority: sameChapterPriority(courseId, chapter.index),
      fields: { courseId, chapterId: chapter.id, lesson: lesson.title },
    });
    return result.value.explanationSummary;
  };

  /** Brings an over-long script under LESSON_WORDS.max; whole-sentence truncation is the last resort. */
  const tighten = async (courseId: string, chapter: ChapterDoc & { id: string }, lesson: DraftLesson) => {
    try {
      const result = await rt.modelJson({
        name: 'tighten',
        schema: lessonScriptSchema,
        responseSchema: modelResponseSchemas.lessonScript,
        prompt: tightenPrompt(lesson.script, Math.round((LESSON_WORDS.min + LESSON_WORDS.max) / 2)),
        check: (value) => {
          const issue = scriptWordIssue(value.explanationSummary);
          return issue ? [issue] : [];
        },
        acceptBest: true,
        attempts: 2,
        long: true,
        priority: sameChapterPriority(courseId, chapter.index),
        fields: { courseId, chapterId: chapter.id, lesson: lesson.title },
      });
      const script = result.value.explanationSummary;
      if (wordCount(script) <= LESSON_WORDS_ACCEPTED.max && wordCount(script) >= LESSON_WORDS_ACCEPTED.min) return script;
      return wordCount(script) > LESSON_WORDS_ACCEPTED.max ? truncateScript(script) : truncateScript(lesson.script);
    } catch (error) {
      if (isCancelled(error)) throw error;
      return truncateScript(lesson.script);
    }
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
        check: (value) =>
          studyDocFinished(value.studyDoc)
            ? []
            : [{ path: 'studyDoc', message: 'Stops before the end; finish every section and end with a "Key takeaways" list.' }],
        acceptBest: true,
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
    const found = docs.get(path);
    if (!found || found.data.skip === true || found.data.status === 'ready') return;
    const startedAt = Date.now();
    const fields = { courseId, chapterId };
    const chapter = { id: chapterId, ...(found.data as unknown as ChapterDoc) };
    const detail = (statusDetail: string) => {
      docs.set(path, { status: 'writing', statusDetail }, true);
      rt.emitChapter(uid, courseId, chapterId, 'chapter.writing', { detail: statusDetail, step: 'writing' });
    };
    /** One roadmap row per lesson, as soon as its title is known and again as its script or notes finish. */
    const publishWriting = (
      index: number,
      lesson: { title: string; focus: string; pageStart: number; pageEnd: number },
      statusDetail: string,
    ) => {
      const lessonId = lessonIdFor(chapterId, index);
      const lessonDoc = lessonPath(uid, courseId, lessonId);
      const existing = docs.get(lessonDoc);
      if (existing && existing.data.status !== 'writing') return;
      const pages: number[] = [];
      for (let page = lesson.pageStart; page <= lesson.pageEnd; page += 1) pages.push(page + 1);
      docs.set(
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
        true,
      );
      docs.set(lessonIndexPath(uid, lessonId), { courseId, chapterId });
      rt.emitLesson(uid, courseId, lessonId, 'lesson.writing', { step: 'writing' });
    };
    const dropExtraWriting = (count: number) => {
      for (const row of docs.list(lessonsPath(uid, courseId))) {
        if (row.data.chapterId !== chapterId || row.data.status !== 'writing') continue;
        if (Number(row.data.index) < count) continue;
        docs.delete(lessonPath(uid, courseId, row.id));
        docs.delete(lessonIndexPath(uid, row.id));
      }
    };
    docs.set(path, { error: null, errorInfo: null }, true);
    try {
      if (!chapter.chapterText) {
        detail('Reading the chapter');
        const parts = subRanges(chapter.pdfPageStart, chapter.pdfPageEnd, CHAPTER_TEXT_PAGES);
        const texts = await Promise.all(
          parts.map((part, index) => explainPages(uid, courseId, chapter, part.start, part.end, index + 1, parts.length)),
        );
        chapter.chapterText = texts.join('\n\n');
        docs.set(path, { chapterText: chapter.chapterText }, true);
        log.info('Chapter text written', { ...fields, event: 'chapter.text', duration_ms: Date.now() - startedAt, words: wordCount(chapter.chapterText), parts: parts.length });
      }

      if (!chapter.outline) {
        detail('Splitting into lessons');
        const pages = chapter.pdfPageEnd - chapter.pdfPageStart + 1;
        const { suggested, fewest } = lessonTarget({ words: wordCount(chapter.chapterText ?? ''), pages });
        const result = await rt.modelJson({
          name: 'lessonOutline',
          schema: lessonOutlineSchema,
          responseSchema: modelResponseSchemas.lessonOutline,
          prompt: lessonOutlinePrompt(chapter.title, chapter.pdfPageStart, chapter.pdfPageEnd, chapter.chapterText, suggested),
          files: [await rt.sources.slice(uid, chapter.sourceId, chapter.pdfPageStart, chapter.pdfPageEnd)],
          check: (value, attempt, attempts) => {
            // Count and coverage are only advisory on the last attempt, so thin chapters still get an outline.
            const advice = attempt < attempts ? outlineAdvice(value, pages, fewest, suggested) : [];
            return [...outlineIssues(value, pages), ...advice];
          },
          attempts: 3,
          long: true,
          priority: sameChapterPriority(courseId, chapter.index),
          fields,
        });
        chapter.outline = result.value.lessons.map((lesson) => ({
          title: lesson.title,
          focus: lesson.focus,
          pageStart: chapter.pdfPageStart + lesson.pageStart - 1,
          pageEnd: chapter.pdfPageStart + lesson.pageEnd - 1,
        }));
        docs.set(path, { outline: chapter.outline, drafts: chapter.outline.map(() => null) }, true);
      }

      if (!chapter.planned) {
        const outline = chapter.outline ?? [];
        const drafts = chapter.drafts?.length === outline.length ? [...chapter.drafts] : outline.map(() => null);
        outline.forEach((lesson, index) => publishWriting(index, lesson, drafts[index] ? 'Script written' : 'Writing the script'));
        detail(`Writing ${outline.length} lesson script${outline.length === 1 ? '' : 's'}`);
        await Promise.all(
          outline.map(async (lesson, index) => {
            if (drafts[index]) return;
            drafts[index] = await writeScript(uid, courseId, chapter, lesson, {
              previousTitle: outline[index - 1]?.title,
              nextTitle: outline[index + 1]?.title,
            });
            docs.set(path, { drafts }, true);
            publishWriting(index, lesson, 'Script written');
          }),
        );
        let planned: DraftLesson[] = planLessonSizes(
          outline.map((lesson, index) => ({ ...lesson, script: drafts[index] ?? '' })),
        );
        // A lone lesson that came back short gets one more script call before it is accepted as short.
        if (planned.length === 1 && planned[0]!.shortSource && outline.length === 1) {
          const again = await writeScript(uid, courseId, chapter, outline[0]!, {});
          if (wordCount(again) > wordCount(planned[0]!.script)) planned = planLessonSizes([{ ...outline[0]!, script: again }]);
        }
        planned = await Promise.all(
          planned.map(async (lesson) => (lesson.needsTighten ? { ...lesson, script: await tighten(courseId, chapter, lesson), needsTighten: false } : lesson)),
        );
        chapter.planned = planned;
        docs.set(path, { planned }, true);
        log.info(`Chapter split into ${planned.length} lessons`, {
          ...fields,
          event: 'chapter.lessons',
          words: planned.map((lesson) => wordCount(lesson.script)),
          short_source: planned.filter((lesson) => lesson.shortSource).length,
        });
      }

      const planned = chapter.planned ?? [];
      dropExtraWriting(planned.length);
      planned.forEach((lesson, index) => publishWriting(index, lesson, lesson.studyDoc ? 'Study notes written' : 'Writing study notes'));
      detail('Writing study notes');
      await Promise.all(
        planned.map(async (lesson, index) => {
          if (lesson.studyDoc) return;
          const written = { ...lesson, studyDoc: await writeStudyDoc(uid, courseId, chapter, lesson) };
          planned[index] = written;
          docs.set(path, { planned }, true);
          publishWriting(index, written, 'Study notes written');
        }),
      );

      planned.forEach((lesson, index) => {
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
        docs.set(lessonPath(uid, courseId, lessonId), {
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
        docs.set(lessonIndexPath(uid, lessonId), { courseId, chapterId });
        rt.emitLesson(uid, courseId, lessonId, 'lesson.outlined', { step: 'outlined' });
      });

      docs.set(path, { status: 'ready', statusDetail: null }, true);
      log.info('Chapter ready', { ...fields, event: 'chapter.ready', duration_ms: Date.now() - startedAt, lessons: planned.length });
      rt.emitChapter(uid, courseId, chapterId, 'chapter.ready', { step: 'ready' });
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, fields);
      log.error(`Chapter failed: ${failure.code} ${failure.message}`, { ...fields, event: 'chapter.failed', code: failure.code, issues: failure.issues.slice(0, 10) });
      docs.set(path, { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, true);
      rt.emitChapter(uid, courseId, chapterId, 'chapter.failed', { error: failure.message, errorInfo: failure, step: 'failed' });
    }
  };

  return { structure, writeChapter };
};
