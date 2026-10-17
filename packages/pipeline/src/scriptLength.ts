import { LESSON_WORDS, wordCount } from '@krayon/shared';
import { splitSentences } from './beats.js';

/** A lesson before its study notes: title, focus, 0-based PDF pages, and spoken script. */
export type DraftLesson = {
  title: string;
  focus: string;
  pageStart: number;
  pageEnd: number;
  script: string;
  /** Chapter material cannot support LESSON_WORDS.min. Information only; it does not trigger another model call. */
  shortSource?: boolean;
};

const words = (lesson: DraftLesson) => wordCount(lesson.script);

/** A lesson this far under the target is merged into a neighbour. */
const CLEARLY_SHORT = LESSON_WORDS.min * 0.5;
/** A lesson this far over the target is split, when both halves still meet the minimum. */
const CLEARLY_LONG = LESSON_WORDS.max * 1.5;

/** Splits a script at the sentence boundary nearest its middle where both halves keep LESSON_WORDS.min. */
export const splitScript = (script: string): [string, string] | null => {
  const sentences = splitSentences(script);
  const total = wordCount(script);
  let best: { cut: number; gap: number } | null = null;
  let running = 0;
  for (let index = 0; index < sentences.length - 1; index += 1) {
    running += wordCount(sentences[index] ?? '');
    if (running < LESSON_WORDS.min || total - running < LESSON_WORDS.min) continue;
    const gap = Math.abs(total / 2 - running);
    if (!best || gap < best.gap) best = { cut: index + 1, gap };
  }
  if (!best) return null;
  return [sentences.slice(0, best.cut).join(' '), sentences.slice(best.cut).join(' ')];
};

const merge = (a: DraftLesson, b: DraftLesson): DraftLesson => ({
  title: a.title,
  focus: `${a.focus} ${b.focus}`.trim(),
  pageStart: Math.min(a.pageStart, b.pageStart),
  pageEnd: Math.max(a.pageEnd, b.pageEnd),
  script: `${a.script.trim()} ${b.script.trim()}`,
});

type Working = DraftLesson & { keep?: boolean };

/**
 * Adjusts only clear outliers, with no model calls:
 * - under half of LESSON_WORDS.min: merge into the smaller neighbour;
 * - over 1.5× LESSON_WORDS.max: split at a sentence when both halves keep LESSON_WORDS.min;
 * - anything else is kept as written.
 * A lone lesson still under LESSON_WORDS.min is flagged shortSource.
 */
export const planLessonSizes = (input: DraftLesson[]): DraftLesson[] => {
  let lessons: Working[] = input.map((lesson) => ({ ...lesson }));
  for (let guard = 0; guard < 50; guard += 1) {
    const short = lessons.findIndex((lesson) => words(lesson) < CLEARLY_SHORT);
    if (short >= 0 && lessons.length > 1) {
      const before = short > 0 ? words(lessons[short - 1]!) : Number.POSITIVE_INFINITY;
      const after = short < lessons.length - 1 ? words(lessons[short + 1]!) : Number.POSITIVE_INFINITY;
      const at = before <= after ? short - 1 : short;
      lessons = [...lessons.slice(0, at), merge(lessons[at]!, lessons[at + 1]!), ...lessons.slice(at + 2)];
      continue;
    }
    const long = lessons.findIndex((lesson) => words(lesson) > CLEARLY_LONG && !lesson.keep);
    if (long < 0) break;
    const lesson = lessons[long]!;
    const halves = splitScript(lesson.script);
    if (!halves) {
      lessons[long] = { ...lesson, keep: true };
      continue;
    }
    const middle = Math.floor((lesson.pageStart + lesson.pageEnd) / 2);
    const first: Working = { ...lesson, title: `${lesson.title} (part 1)`, script: halves[0], pageEnd: Math.max(lesson.pageStart, middle), keep: false };
    const second: Working = { ...lesson, title: `${lesson.title} (part 2)`, script: halves[1], pageStart: Math.min(lesson.pageEnd, middle), keep: false };
    lessons = [...lessons.slice(0, long), first, second, ...lessons.slice(long + 1)];
  }
  const planned = lessons.map(({ keep: _keep, ...lesson }) => lesson);
  if (planned.length === 1 && words(planned[0]!) < LESSON_WORDS.min) planned[0] = { ...planned[0]!, shortSource: true };
  return planned;
};
