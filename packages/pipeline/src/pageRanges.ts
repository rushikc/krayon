import type { GenerationIssue } from '@krayon/shared';

/** A chapter as the structure model returns it: 1-based file pages, optional printed TOC page. */
export type RawChapter = {
  title: string;
  printedStart?: number;
  pdfPageStart: number;
  pdfPageEnd: number;
  skip: boolean;
};

/** A chapter with 0-based, inclusive PDF page indexes. */
export type PdfRange = {
  title: string;
  pdfPageStart: number;
  pdfPageEnd: number;
  skip: boolean;
};

export type OffsetMethod = 'labels' | 'headers' | 'titles' | 'samples';

/** Maps a printed page number to a 0-based PDF index. */
export type PrintedResolver = { method: OffsetMethod; toIndex: (printed: number) => number | null };

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const mode = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: number; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
};

/** True when the start of the page text contains the chapter title. */
export const pageHasTitle = (pageText: string | undefined, title: string) => {
  if (!pageText) return false;
  const head = normalize(pageText.slice(0, 600));
  const wanted = normalize(title);
  if (!wanted) return false;
  if (head.includes(wanted)) return true;
  const words = wanted.split(' ').slice(0, 4).join(' ');
  return words.length >= 6 && head.includes(words);
};

/**
 * Printed-page offset from running headers ("12 1. Getting Started", "1.2 Choosing Your Weapon 13"):
 * the most common (page index - printed number). Null when too few pages agree.
 */
export const headerOffset = (texts: string[]): number | null => {
  const candidates: number[] = [];
  texts.forEach((text, index) => {
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of new Set([lines[0], lines[lines.length - 1]])) {
      if (!line) continue;
      const lead = /^(\d{1,4})\s+\D/.exec(line);
      const trail = /\D\s+(\d{1,4})$/.exec(line);
      const number = Number((lead ?? trail)?.[1]);
      if (Number.isFinite(number) && number > 0) candidates.push(index - number);
    }
  });
  const best = mode(candidates);
  if (!best) return null;
  return best.count >= Math.max(3, Math.floor(texts.length * 0.2)) ? best.value : null;
};

/** Offset that puts the most chapter titles on page printedStart + offset. */
export const titleOffset = (entries: Array<{ title: string; printedStart?: number }>, texts: string[]): number | null => {
  const found: number[] = [];
  for (const entry of entries) {
    if (entry.printedStart == null) continue;
    for (let offset = -5; offset <= 80; offset += 1) {
      if (pageHasTitle(texts[entry.printedStart + offset], entry.title)) {
        found.push(offset);
        break;
      }
    }
  }
  const best = mode(found);
  return best && best.count >= Math.min(2, found.length) ? best.value : null;
};

/** Offset from the model's own samples of printed numbers on file pages (1-based). */
export const sampleOffset = (samples: Array<{ pdfPage: number; printedLabel: string }>): number | null => {
  const values = samples
    .map((sample) => ({ page: sample.pdfPage - 1, printed: Number(sample.printedLabel) }))
    .filter((sample) => Number.isInteger(sample.printed) && sample.printed > 0)
    .map((sample) => sample.page - sample.printed);
  const best = mode(values);
  return best ? best.value : null;
};

/**
 * How printed TOC numbers map to PDF indexes, best source first: /PageLabels, running headers,
 * chapter titles found in the page text, then the model's samples. Null when nothing works.
 */
export const detectOffset = (
  entries: Array<{ title: string; printedStart?: number }>,
  texts: string[],
  labels: string[] | null,
  samples: Array<{ pdfPage: number; printedLabel: string }> = [],
): PrintedResolver | null => {
  if (labels && labels.some((label, index) => label !== String(index + 1))) {
    const byLabel = new Map<string, number>();
    labels.forEach((label, index) => {
      if (!byLabel.has(label)) byLabel.set(label, index);
    });
    const hits = entries.filter((entry) => entry.printedStart != null && byLabel.has(String(entry.printedStart)));
    if (hits.length > 0) return { method: 'labels', toIndex: (printed) => byLabel.get(String(printed)) ?? null };
  }
  const fromOffset = (method: OffsetMethod, offset: number | null): PrintedResolver | null =>
    offset == null ? null : { method, toIndex: (printed) => printed + offset };
  return (
    fromOffset('headers', headerOffset(texts)) ??
    fromOffset('titles', titleOffset(entries, texts)) ??
    fromOffset('samples', sampleOffset(samples))
  );
};

/** Moves a start page by up to `reach` pages to where the title is actually printed, if the text shows it. */
const snapToTitle = (start: number, title: string, texts: string[], reach = 2) => {
  if (pageHasTitle(texts[start], title)) return start;
  for (let distance = 1; distance <= reach; distance += 1) {
    if (pageHasTitle(texts[start + distance], title)) return start + distance;
    if (pageHasTitle(texts[start - distance], title)) return start - distance;
  }
  return start;
};

/**
 * Converts the model's chapters to contiguous 0-based ranges covering pages 0..total-1.
 * Printed TOC numbers win over the model's file-page guesses when an offset is known, for real chapters only:
 * front matter is usually numbered in roman numerals, which the model reports as small arabic numbers.
 * A skipped entry that does not sit between its neighbouring real chapters (in TOC order) is dropped.
 * Uncovered pages before the first or after the last chapter become skipped front/back matter.
 */
export const toPdfRanges = (raw: RawChapter[], total: number, texts: string[], resolver: PrintedResolver | null): PdfRange[] => {
  const resolved = raw.map((chapter) => {
    const printed = !chapter.skip && chapter.printedStart != null && resolver ? resolver.toIndex(chapter.printedStart) : null;
    const guess = printed ?? chapter.pdfPageStart - 1;
    const start = Math.max(0, Math.min(total - 1, guess));
    return { chapter, start: snapToTitle(start, chapter.title, texts) };
  });
  const starts = resolved.filter((entry, index) => {
    if (!entry.chapter.skip) return true;
    const before = resolved.slice(0, index).filter((item) => !item.chapter.skip).at(-1);
    const after = resolved.slice(index + 1).find((item) => !item.chapter.skip);
    return (!before || entry.start > before.start) && (!after || entry.start < after.start);
  });
  starts.sort((a, b) => a.start - b.start);
  const ranges: PdfRange[] = [];
  const first = starts[0];
  if (first && first.start > 0) ranges.push({ title: 'Front matter', pdfPageStart: 0, pdfPageEnd: first.start - 1, skip: true });
  starts.forEach(({ chapter, start }, index) => {
    const next = starts[index + 1];
    const end = next ? next.start - 1 : Math.max(start, Math.min(total - 1, chapter.pdfPageEnd - 1));
    ranges.push({ title: chapter.title, pdfPageStart: start, pdfPageEnd: Math.max(start - 1, end), skip: chapter.skip });
  });
  const last = ranges[ranges.length - 1];
  if (last && last.pdfPageEnd < total - 1) {
    ranges.push({ title: 'Back matter', pdfPageStart: last.pdfPageEnd + 1, pdfPageEnd: total - 1, skip: true });
  }
  return ranges;
};

/**
 * Makes ranges contiguous inside [0, total-1] without another model call.
 * Sorts, clamps, swaps a reversed range, snaps each start to the previous end + 1,
 * and closes a gap by extending the previous chapter (including the pages before the first and after the last).
 */
export const normalizeRanges = (ranges: PdfRange[], total: number): PdfRange[] => {
  if (total <= 0 || ranges.length === 0) return [];
  const lastPage = total - 1;
  const clamped = ranges
    .map((range) => {
      let start = Math.min(lastPage, Math.max(0, Math.round(range.pdfPageStart)));
      let end = Math.min(lastPage, Math.max(0, Math.round(range.pdfPageEnd)));
      if (end < start) [start, end] = [end, start];
      return { ...range, pdfPageStart: start, pdfPageEnd: end };
    })
    .sort((a, b) => a.pdfPageStart - b.pdfPageStart || a.pdfPageEnd - b.pdfPageEnd);
  const out: PdfRange[] = [];
  for (const range of clamped) {
    const previous = out[out.length - 1];
    if (!previous) {
      out.push({ ...range, pdfPageStart: 0 });
      continue;
    }
    if (range.pdfPageStart > previous.pdfPageEnd + 1) previous.pdfPageEnd = range.pdfPageStart - 1;
    const start = previous.pdfPageEnd + 1;
    if (start > lastPage) continue;
    out.push({ ...range, pdfPageStart: start, pdfPageEnd: Math.max(start, range.pdfPageEnd) });
  }
  const tail = out[out.length - 1];
  if (tail && tail.pdfPageEnd < lastPage) tail.pdfPageEnd = lastPage;
  return out;
};

/** Broken structure only: no chapters, or every chapter skipped. Overlaps and gaps are fixed by normalizeRanges. */
export const validateRanges = (ranges: PdfRange[], _total: number): GenerationIssue[] => {
  if (ranges.length === 0) return [{ path: 'chapters', message: 'At least one chapter is required.' }];
  if (!ranges.some((range) => !range.skip)) {
    return [{ path: 'chapters', message: 'Every chapter is marked skip; mark the real chapters skip=false.' }];
  }
  return [];
};

/** Splits start..end into consecutive sub-ranges of at most `size` pages. */
export const subRanges = (start: number, end: number, size: number) => {
  const out: Array<{ start: number; end: number }> = [];
  const count = Math.ceil((end - start + 1) / size);
  const step = Math.ceil((end - start + 1) / Math.max(1, count));
  for (let from = start; from <= end; from += step) out.push({ start: from, end: Math.min(end, from + step - 1) });
  return out;
};
