import { LESSON_WORDS, wordCount } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { planLessonSizes, splitScript, truncateScript } from '../src/scriptLength.js';
import type { DraftLesson } from '../src/scriptLength.js';
import { script } from './helpers.js';

const draft = (title: string, text: string, pageStart = 0, pageEnd = 9): DraftLesson => ({ title, focus: title, pageStart, pageEnd, script: text });

describe('splitScript', () => {
  it('splits only when both halves keep LESSON_WORDS.min', () => {
    expect(splitScript(script(41, 20))).toBeNull();
    const halves = splitScript(script(44, 20));
    expect(halves).not.toBeNull();
    const [first, second] = halves!;
    expect(wordCount(first)).toBeGreaterThanOrEqual(LESSON_WORDS.min);
    expect(wordCount(second)).toBeGreaterThanOrEqual(LESSON_WORDS.min);
    expect(`${first} ${second}`).toBe(script(44, 20));
  });
});

describe('planLessonSizes', () => {
  it('keeps lessons already in range', () => {
    const lessons = [draft('a', script(25, 20)), draft('b', script(30, 20))];
    expect(planLessonSizes(lessons).map((lesson) => lesson.title)).toEqual(['a', 'b']);
  });

  it('merges a short lesson into its smaller neighbour', () => {
    const planned = planLessonSizes([draft('a', script(30, 20), 0, 4), draft('short', script(10, 20), 5, 6), draft('c', script(22, 20), 7, 9)]);
    expect(planned.map((lesson) => lesson.title)).toEqual(['a', 'short']);
    expect(planned[1]).toMatchObject({ pageStart: 5, pageEnd: 9 });
    expect(planned.every((lesson) => wordCount(lesson.script) >= LESSON_WORDS.min && wordCount(lesson.script) <= LESSON_WORDS.max)).toBe(true);
  });

  it('splits a long lesson into two parts and halves its pages', () => {
    const planned = planLessonSizes([draft('long', script(50, 20), 10, 19)]);
    expect(planned.map((lesson) => lesson.title)).toEqual(['long (part 1)', 'long (part 2)']);
    expect(planned[0]).toMatchObject({ pageStart: 10, pageEnd: 14 });
    expect(planned[1]).toMatchObject({ pageStart: 14, pageEnd: 19 });
  });

  it('marks a long lesson that cannot split for tightening', () => {
    const planned = planLessonSizes([draft('a', script(25, 20)), draft('over', script(36, 20))]);
    expect(planned[1]).toMatchObject({ title: 'over', needsTighten: true });
    expect(planned[0]?.needsTighten).toBe(false);
  });

  it('flags a lone short lesson as short source', () => {
    const planned = planLessonSizes([draft('only', script(8, 20))]);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.shortSource).toBe(true);
  });

  it('merges every short lesson of a chapter into one', () => {
    const planned = planLessonSizes([draft('a', script(5, 20)), draft('b', script(5, 20)), draft('c', script(5, 20))]);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.shortSource).toBe(true);
    expect(wordCount(planned[0]!.script)).toBe(300);
  });
});

describe('truncateScript', () => {
  it('keeps whole sentences up to LESSON_WORDS.max', () => {
    const cut = truncateScript(script(40, 20));
    expect(wordCount(cut)).toBe(660);
    expect(cut.endsWith('end.')).toBe(true);
  });
});
