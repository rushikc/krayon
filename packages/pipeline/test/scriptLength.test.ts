import { LESSON_WORDS, wordCount } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { planLessonSizes, splitScript } from '../src/scriptLength.js';
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

  it('keeps a script that is merely near the target', () => {
    const nearMin = Array.from({ length: 412 }, () => 'word').join(' ');
    const nearMax = Array.from({ length: 680 }, () => 'word').join(' ');
    const under = planLessonSizes([draft('near', nearMin)]);
    expect(under).toHaveLength(1);
    expect(under[0]?.script).toBe(nearMin);
    expect(under[0]?.shortSource).toBe(true);
    const over = planLessonSizes([draft('near', nearMax)]);
    expect(over[0]?.script).toBe(nearMax);
    expect(over[0]?.shortSource).toBeFalsy();
  });

  it('merges a lesson under half the minimum into its smaller neighbour', () => {
    const planned = planLessonSizes([draft('a', script(30, 20), 0, 4), draft('short', script(10, 20), 5, 6), draft('c', script(22, 20), 7, 9)]);
    expect(planned.map((lesson) => lesson.title)).toEqual(['a', 'short']);
    expect(planned[1]).toMatchObject({ pageStart: 5, pageEnd: 9 });
  });

  it('splits a lesson over 1.5× the maximum when both halves stay long enough', () => {
    const planned = planLessonSizes([draft('long', script(50, 20), 10, 19)]);
    expect(planned.map((lesson) => lesson.title)).toEqual(['long (part 1)', 'long (part 2)']);
    expect(planned[0]).toMatchObject({ pageStart: 10, pageEnd: 14 });
    expect(planned[1]).toMatchObject({ pageStart: 14, pageEnd: 19 });
    expect(planned.every((lesson) => wordCount(lesson.script) >= LESSON_WORDS.min)).toBe(true);
  });

  it('keeps a long lesson that cannot be split into two full lessons', () => {
    const planned = planLessonSizes([draft('a', script(25, 20)), draft('over', script(36, 20))]);
    expect(planned.map((lesson) => lesson.title)).toEqual(['a', 'over']);
    expect(planned[1]?.script.startsWith('Sentence 1')).toBe(true);
  });

  it('flags a lone short lesson as short source and does not drop words', () => {
    const text = script(8, 20);
    const planned = planLessonSizes([draft('only', text)]);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.shortSource).toBe(true);
    expect(planned[0]?.script).toBe(text);
  });

  it('merges every clearly short lesson of a chapter into one', () => {
    const planned = planLessonSizes([draft('a', script(5, 20)), draft('b', script(5, 20)), draft('c', script(5, 20))]);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.shortSource).toBe(true);
    expect(wordCount(planned[0]!.script)).toBe(300);
  });
});
