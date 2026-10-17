import { describe, expect, it } from 'vitest';
import { citedPages, coverageIssues, shiftCitations } from '../src/citations.js';
import { normalizeOutline, trimUnfinished } from '../src/chapters.js';

describe('study doc endings', () => {
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

describe('normalizeOutline', () => {
  it('clamps pages, swaps a reversed range, and sorts by start page', () => {
    const lessons = normalizeOutline(
      [
        { title: 'Later', focus: 'b', pageStart: 12, pageEnd: 4 },
        { title: 'First', focus: 'a', pageStart: 8, pageEnd: 1 },
      ],
      10,
    );
    expect(lessons.map((lesson) => [lesson.title, lesson.pageStart, lesson.pageEnd])).toEqual([
      ['First', 1, 8],
      ['Later', 4, 10],
    ]);
  });
});
