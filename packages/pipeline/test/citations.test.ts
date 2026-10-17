import { describe, expect, it } from 'vitest';
import { citedPages, coverageIssues, shiftCitations } from '../src/citations.js';
import { outlineAdvice, studyDocFinished, trimUnfinished } from '../src/chapters.js';

describe('study doc endings', () => {
  it('needs key takeaways and a finished last line', () => {
    expect(studyDocFinished('## A\ntext.\n## Key takeaways\n- One.')).toBe(true);
    expect(studyDocFinished('## A\ntext.\n## Key takeaways\n- Flow by effectively ')).toBe(false);
    expect(studyDocFinished('## A\n*   The judge will provide a ')).toBe(false);
  });

  it('drops only a cut-off last line', () => {
    expect(trimUnfinished('## A\ntext.\n*   The judge will provide a ')).toBe('## A\ntext.');
    expect(trimUnfinished('## A\n- item')).toBe('## A');
    expect(trimUnfinished('## A\ntext.')).toBe('## A\ntext.');
  });
});

describe('citations', () => {
  it('reads single pages and ranges', () => {
    expect(citedPages('## A [p. 1]\n## B [pp. 3-4]\n## C [p. 6–7]')).toEqual([1, 3, 4, 6, 7]);
  });

  it('shifts citations to chapter pages', () => {
    expect(shiftCitations('## A [p. 1] and [pp. 2-3]', 30)).toBe('## A [p. 31] and [pp. 32-33]');
  });

  it('accepts text that cites the whole file', () => {
    expect(coverageIssues('## A [p. 1]\n## B [pp. 2-28]\n## C [p. 29]', 29)).toEqual([]);
  });

  it('rejects text that skips the start or uses printed page numbers', () => {
    const issues = coverageIssues('## Crypt Kicker [p. 47]\n## Stack em Up [p. 48]\n## Hints [p. 29]', 29).map((issue) => issue.message);
    expect(issues.some((message) => message.includes('Cites page 47'))).toBe(true);
    expect(issues.some((message) => message.includes('Starts at page 29'))).toBe(true);
  });

  it('asks for citations when there are none', () => {
    expect(coverageIssues('## A\ntext', 5)).toHaveLength(1);
  });
});

describe('outlineAdvice', () => {
  const lessons = (ranges: Array<[number, number]>) => ({ lessons: ranges.map(([pageStart, pageEnd]) => ({ pageStart, pageEnd })) });

  it('accepts an outline that covers the chapter', () => {
    expect(outlineAdvice(lessons([[1, 5], [5, 10], [11, 15]]), 15, 2, 5)).toEqual([]);
  });

  it('flags uncovered pages at the start, end, and between lessons', () => {
    const messages = outlineAdvice(lessons([[1, 9]]), 29, 1, 3).map((issue) => issue.message);
    expect(messages).toEqual(['Pages 10 to 29 are not in any lesson.']);
    expect(outlineAdvice(lessons([[5, 10], [20, 29]]), 29, 1, 3).map((issue) => issue.message)).toEqual([
      'Pages 1 to 4 are not in any lesson.',
      'Pages 11 to 19 are not in any lesson.',
    ]);
  });

  it('flags too few lessons', () => {
    expect(outlineAdvice(lessons([[1, 22]]), 22, 3, 7)[0].message).toContain('split it into about 7');
  });

  it('asks to combine when there are far more lessons than fit', () => {
    const many = lessons(Array.from({ length: 19 }, () => [1, 1] as [number, number]));
    expect(outlineAdvice(many, 22, 2, 5).map((issue) => issue.message).some((message) => message.includes('about 5 fit'))).toBe(true);
  });
});
