import { LESSON_WORDS, wordCount } from '@krayon/shared';
import { splitSentences } from './beats.js';

/** A lesson before its study notes: title, focus, 0-based PDF pages, and spoken script. */
export type DraftLesson = {
  title: string;
  focus: string;
  pageStart: number;
  pageEnd: number;
  script: string;
  /** Chapter material cannot support LESSON_WORDS.min (single-lesson chapter, still short after expanding). */
  shortSource?: boolean;
  /** Over LESSON_WORDS.max but too short to split into two full lessons: ask the model to tighten it. */
  needsTighten?: boolean;
};

const words = (lesson: DraftLesson) => wordCount(lesson.script);

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

/**
 * Fits drafted lessons to LESSON_WORDS without new model calls:
 * - over the max: split at a sentence boundary when both halves keep the min, else mark needsTighten;
 * - under the min: merge into the smaller neighbour (the result is checked again);
 * - a lone lesson that is still short is kept and flagged shortSource.
 */
export const planLessonSizes = (input: DraftLesson[]): DraftLesson[] => {
  let lessons: DraftLesson[] = input.map((lesson) => ({ ...lesson, needsTighten: false }));
  for (let guard = 0; guard < 50; guard += 1) {
    const short = lessons.findIndex((lesson) => words(lesson) < LESSON_WORDS.min);
    if (short >= 0 && lessons.length > 1) {
      const before = short > 0 ? words(lessons[short - 1]!) : Number.POSITIVE_INFINITY;
      const after = short < lessons.length - 1 ? words(lessons[short + 1]!) : Number.POSITIVE_INFINITY;
      const at = before <= after ? short - 1 : short;
      lessons = [...lessons.slice(0, at), merge(lessons[at]!, lessons[at + 1]!), ...lessons.slice(at + 2)];
      continue;
    }
    const long = lessons.findIndex((lesson) => words(lesson) > LESSON_WORDS.max && !lesson.needsTighten);
    if (long < 0) break;
    const lesson = lessons[long]!;
    const halves = splitScript(lesson.script);
    if (!halves) {
      lessons[long] = { ...lesson, needsTighten: true };
      continue;
    }
    const middle = Math.floor((lesson.pageStart + lesson.pageEnd) / 2);
    const first: DraftLesson = { ...lesson, title: `${lesson.title} (part 1)`, script: halves[0], pageEnd: Math.max(lesson.pageStart, middle) };
    const second: DraftLesson = { ...lesson, title: `${lesson.title} (part 2)`, script: halves[1], pageStart: Math.min(lesson.pageEnd, middle) };
    lessons = [...lessons.slice(0, long), first, second, ...lessons.slice(long + 1)];
  }
  if (lessons.length === 1 && words(lessons[0]!) < LESSON_WORDS.min) lessons[0] = { ...lessons[0]!, shortSource: true };
  return lessons;
};

/** Last resort after tightening failed: keep whole sentences up to LESSON_WORDS.max. */
export const truncateScript = (script: string) => {
  const kept: string[] = [];
  let total = 0;
  for (const sentence of splitSentences(script)) {
    const count = wordCount(sentence);
    if (total + count > LESSON_WORDS.max) break;
    kept.push(sentence);
    total += count;
  }
  return kept.join(' ');
};
