import type { GenerationIssue } from '@krayon/shared';

/** `[p. 3]`, `[pp. 3-5]`, `[p. 3–5]`: page positions in the attached file. */
const CITATION = /\[pp?\.\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/g;

export const citedPages = (text: string) => {
  const pages: number[] = [];
  for (const match of text.matchAll(CITATION)) {
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    for (let page = from; page <= Math.max(from, to); page += 1) pages.push(page);
  }
  return pages;
};

/** Renumbers citations by `offset`, so text written for a part of a chapter cites chapter pages. */
export const shiftCitations = (text: string, offset: number) =>
  offset === 0
    ? text
    : text.replace(CITATION, (_match, from: string, to?: string) =>
        to ? `[pp. ${Number(from) + offset}-${Number(to) + offset}]` : `[p. ${Number(from) + offset}]`,
      );

/** Issues when the citations miss the start or end of a `pages`-page file, or point outside it. */
export const coverageIssues = (text: string, pages: number, path = 'chapterText'): GenerationIssue[] => {
  const cited = citedPages(text);
  if (cited.length === 0) return [{ path, message: `Cite the pages after each heading, like [p. 1], using pages 1 to ${pages} of the attached file.` }];
  const issues: GenerationIssue[] = [];
  const outside = cited.filter((page) => page < 1 || page > pages);
  if (outside.length > 0) {
    issues.push({
      path,
      message: `Cites page ${outside[0]}, but the attached file has pages 1 to ${pages}. Cite positions in the attached file, not the numbers printed on the pages.`,
    });
  }
  const inside = cited.filter((page) => page >= 1 && page <= pages);
  const first = Math.min(...inside);
  const last = Math.max(...inside);
  if (inside.length === 0 || first > 2) issues.push({ path, message: `Starts at page ${inside.length ? first : '?'}; explain the attached file from page 1.` });
  if (inside.length > 0 && last < pages - 1) issues.push({ path, message: `Stops at page ${last}; explain the attached file through page ${pages}.` });
  return issues;
};
