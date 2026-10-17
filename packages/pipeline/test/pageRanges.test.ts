import { describe, expect, it } from 'vitest';
import { detectOffset, headerOffset, normalizeRanges, pageHasTitle, sampleOffset, subRanges, titleOffset, toPdfRanges, validateRanges } from '../src/pageRanges.js';

/** A 60-page book whose printed page 1 is PDF index 20, with running headers. */
const book = () =>
  Array.from({ length: 60 }, (_, index) => {
    if (index < 20) return 'Preface and contents.';
    const printed = index - 19;
    const title = index === 20 ? 'Getting Started\n' : index === 35 ? 'Data Structures\n' : '';
    return `${printed} Chapter header\n${title}Body text for printed page ${printed}.`;
  });

describe('page offsets', () => {
  it('finds the printed-page offset from running headers', () => {
    expect(headerOffset(book())).toBe(19);
  });

  it('finds the offset from chapter titles when headers are missing', () => {
    const texts = book().map((text) => text.replace(/^\d+ Chapter header\n/, ''));
    expect(headerOffset(texts)).toBeNull();
    expect(titleOffset([{ title: 'Getting Started', printedStart: 1 }, { title: 'Data Structures', printedStart: 16 }], texts)).toBe(19);
  });

  it('prefers page labels, then headers, then the model samples', () => {
    const labels = Array.from({ length: 60 }, (_, index) => (index < 20 ? `p${index}` : String(index - 19)));
    const entries = [{ title: 'Getting Started', printedStart: 1 }];
    const byLabel = detectOffset(entries, book(), labels);
    expect(byLabel?.method).toBe('labels');
    expect(byLabel?.toIndex(1)).toBe(20);
    expect(detectOffset(entries, book(), null)?.method).toBe('headers');
    const blank = Array.from({ length: 60 }, () => '');
    const fromSamples = detectOffset(entries, blank, null, [{ pdfPage: 21, printedLabel: '1' }, { pdfPage: 30, printedLabel: '10' }]);
    expect(fromSamples?.method).toBe('samples');
    expect(fromSamples?.toIndex(1)).toBe(20);
    expect(sampleOffset([{ pdfPage: 3, printedLabel: 'iii' }])).toBeNull();
    expect(detectOffset(entries, blank, null)).toBeNull();
  });

  it('matches a title near the top of the page', () => {
    expect(pageHasTitle('12 Header\nGetting Started\nText', 'Getting started')).toBe(true);
    expect(pageHasTitle('Other text', 'Getting Started')).toBe(false);
  });
});

describe('toPdfRanges', () => {
  it('turns printed TOC numbers into contiguous 0-based ranges with front and back matter', () => {
    const texts = book();
    const resolver = detectOffset([], texts, null);
    const ranges = toPdfRanges(
      [
        { title: 'Getting Started', printedStart: 1, pdfPageStart: 2, pdfPageEnd: 10, skip: false },
        { title: 'Data Structures', printedStart: 16, pdfPageStart: 12, pdfPageEnd: 55, skip: false },
      ],
      60,
      texts,
      resolver,
    );
    expect(ranges).toEqual([
      { title: 'Front matter', pdfPageStart: 0, pdfPageEnd: 19, skip: true },
      { title: 'Getting Started', pdfPageStart: 20, pdfPageEnd: 34, skip: false },
      { title: 'Data Structures', pdfPageStart: 35, pdfPageEnd: 54, skip: false },
      { title: 'Back matter', pdfPageStart: 55, pdfPageEnd: 59, skip: true },
    ]);
    expect(validateRanges(ranges, 60)).toEqual([]);
  });

  it('ignores roman-numeral front matter that would land inside a chapter', () => {
    const texts = book();
    const ranges = toPdfRanges(
      [
        { title: 'Cover', pdfPageStart: 1, pdfPageEnd: 1, skip: true },
        { title: 'Preface', printedStart: 7, pdfPageStart: 28, pdfPageEnd: 32, skip: true },
        { title: 'Getting Started', printedStart: 1, pdfPageStart: 21, pdfPageEnd: 35, skip: false },
        { title: 'Data Structures', printedStart: 16, pdfPageStart: 36, pdfPageEnd: 55, skip: false },
        { title: 'Index', pdfPageStart: 57, pdfPageEnd: 60, skip: true },
      ],
      60,
      texts,
      detectOffset([], texts, null),
    );
    expect(ranges.map((range) => [range.title, range.pdfPageStart, range.pdfPageEnd])).toEqual([
      ['Cover', 0, 19],
      ['Getting Started', 20, 34],
      ['Data Structures', 35, 55],
      ['Index', 56, 59],
    ]);
    expect(validateRanges(ranges, 60)).toEqual([]);
  });

  it('falls back to the file pages and snaps a start to the printed title', () => {
    const texts = book();
    const ranges = toPdfRanges([{ title: 'Data Structures', pdfPageStart: 35, pdfPageEnd: 60, skip: false }], 60, texts, null);
    expect(ranges[1]).toMatchObject({ title: 'Data Structures', pdfPageStart: 35, pdfPageEnd: 59 });
  });
});

describe('normalizeRanges', () => {
  it('snaps overlaps and closes gaps inside the file', () => {
    const fixed = normalizeRanges(
      [
        { title: 'B', pdfPageStart: 8, pdfPageEnd: 12, skip: false },
        { title: 'A', pdfPageStart: 1, pdfPageEnd: 10, skip: false },
        { title: 'C', pdfPageStart: 15, pdfPageEnd: 18, skip: false },
      ],
      20,
    );
    expect(fixed).toEqual([
      { title: 'A', pdfPageStart: 0, pdfPageEnd: 10, skip: false },
      { title: 'B', pdfPageStart: 11, pdfPageEnd: 14, skip: false },
      { title: 'C', pdfPageStart: 15, pdfPageEnd: 19, skip: false },
    ]);
    expect(validateRanges(fixed, 20)).toEqual([]);
  });

  it('rejects only an empty list or a book that is all skipped', () => {
    expect(validateRanges([], 5)).toEqual([{ path: 'chapters', message: 'At least one chapter is required.' }]);
    const skipped = normalizeRanges(
      [
        { title: 'A', pdfPageStart: 1, pdfPageEnd: 10, skip: true },
        { title: 'B', pdfPageStart: 8, pdfPageEnd: 12, skip: true },
      ],
      20,
    );
    expect(validateRanges(skipped, 20).map((issue) => issue.path)).toEqual(['chapters']);
  });
});

describe('subRanges', () => {
  it('splits a range into even parts of at most the size', () => {
    expect(subRanges(20, 79, 30)).toEqual([
      { start: 20, end: 49 },
      { start: 50, end: 79 },
    ]);
    expect(subRanges(0, 64, 30)).toEqual([
      { start: 0, end: 21 },
      { start: 22, end: 43 },
      { start: 44, end: 64 },
    ]);
    expect(subRanges(5, 5, 30)).toEqual([{ start: 5, end: 5 }]);
  });
});
