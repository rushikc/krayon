import { wordCount } from '@krayon/shared';
import type { PipelineEmit } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { createChapterStages } from '../src/chapters.js';
import type { ModelRequest, Runtime } from '../src/runtime.js';
import { chapterPath, lessonPath } from '../src/store.js';
import { memoryDocs, quietLog, script } from './helpers.js';

const UID = 'u';
const COURSE = 'c';
const CHAPTER = 'c-c1';

it('accepts a long script, a messy outline, and an unfinished study doc without extra calls', async () => {
  const { docs } = memoryDocs();
  const names: string[] = [];
  await docs.set(chapterPath(UID, COURSE, CHAPTER), {
    index: 0,
    sourceId: 'src',
    title: 'Sorting',
    pdfPageStart: 10,
    pdfPageEnd: 12,
    skip: false,
    status: 'pending',
  });
  const longScript = script(40, 20);
  const modelJson = async (request: ModelRequest<unknown>) => {
    names.push(request.name);
    if (request.name === 'chapterText') return { value: { chapterText: 'Only the middle [p. 2].' }, attempts: 1 };
    if (request.name === 'lessonOutline') {
      return {
        value: {
          lessons: [
            { title: 'Later', focus: 'Second idea.', pageStart: 9, pageEnd: 2 },
            { title: 'Earlier', focus: 'First idea.', pageStart: 3, pageEnd: 1 },
          ],
        },
        attempts: 1,
      };
    }
    if (request.name === 'lessonScript') return { value: { explanationSummary: longScript }, attempts: 1 };
    if (request.name === 'studyDoc') return { value: { studyDoc: '## Notes\nA half sentence' }, attempts: 1 };
    throw new Error(request.name);
  };
  const events: PipelineEmit[] = [];
  const rt = {
    docs,
    log: quietLog,
    sources: {
      slice: async () => ({ data: new Uint8Array(), mimeType: 'application/pdf', pages: { start: 10, end: 12, total: 40 } }),
      text: async () => '',
    },
    modelJson,
    failureOf: (error: unknown) => ({ code: 'UPSTREAM', message: String(error), issues: [], attempts: 1 }),
    emit: (event: PipelineEmit) => events.push(event),
    emitChapter: (_uid: string, courseId: string, chapterId: string, type: PipelineEmit['type']) => events.push({ type, courseId, chapterId }),
    emitLesson: () => undefined,
  } as unknown as Runtime;

  await createChapterStages(rt).writeChapter(UID, COURSE, CHAPTER);
  expect(names.filter((name) => name === 'lessonScript')).toHaveLength(2);
  expect(names.filter((name) => name === 'studyDoc')).toHaveLength(2);
  expect(names.filter((name) => name === 'lessonOutline')).toHaveLength(1);
  expect(names).not.toContain('tighten');
  const chapter = (await docs.get(chapterPath(UID, COURSE, CHAPTER)))?.data;
  expect(chapter?.status).toBe('ready');
  const outline = chapter?.outline as Array<{ title: string; pageStart: number; pageEnd: number }>;
  expect(outline.map((lesson) => [lesson.title, lesson.pageStart, lesson.pageEnd])).toEqual([
    ['Earlier', 10, 12],
    ['Later', 11, 12],
  ]);
  const stored = (await docs.get(lessonPath(UID, COURSE, `${CHAPTER}-l1`)))?.data;
  expect(wordCount(String(stored?.explanationSummary))).toBe(wordCount(longScript));
  expect(String(stored?.studyDoc)).toBe('## Notes');
});
