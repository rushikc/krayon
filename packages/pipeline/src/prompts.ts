import { FPS, LESSON_WORDS, SEGMENT_WORDS, SEGMENTS_PER_LESSON } from '@krayon/shared';
import type { GeneratedSegment, GenerationIssue } from '@krayon/shared';

/** A parsed segment or a raw model record that failed validation. */
export type SegmentLike = GeneratedSegment | Record<string, unknown>;

export const templateGuide = `Each segment uses exactly one scene.layout. Fill its slots. Do not send coordinates.
Optional appearAt is a frame number inside the segment. Omit it to let items appear in order.

titleCard: the opening. Fields: title, optional subtitle.
bullets: a short list of facts. Fields: heading, items[{text, appearAt?}] with 1 to 5 items. A bullet is about 12 words.
flow: a sequence, such as a request path. Fields: optional heading, direction horizontal or vertical, nodes[{id, label, sublabel?, appearAt?}] with 2 to 6 nodes, edges[{from, to, label?}] whose from and to are node ids. A node label is about 6 words.
compare: two sides. Fields: optional heading, left{title, points[{text, appearAt?}]}, right with the same shape. 1 to 5 points on a side.
hubSpoke: one center with parts around it, such as Porter's five forces. Fields: center{id, label}, spokes[{id, label, sublabel?, appearAt?}] with 3 to 6 spokes. Spoke labels are about 6 words.
chart: a graph with axes. Fields: optional heading, xLabel, yLabel, curves[{id, label, kind: upward or downward or flat, shift?: left or right, appearAt?}], markers[{type: intersection or point, curveIds, label, appearAt?}]. Supply slopes upward. Demand slopes downward. Mark their crossing with an intersection marker labeled equilibrium. A shift sets shift on that curve.
timeline: steps over time. Fields: optional heading, steps[{label, detail?, appearAt?}] with 2 to 6 steps.
callout: one statement. Fields: kind definition or example or keyPoint, title, body.

Wrap math in single dollar signs, like $P = Q$.`;

/** "PDF pages 21 to 34" for 0-based inclusive indexes. */
export const pagesLabel = (start: number, end: number) =>
  start === end ? `PDF page ${start + 1}` : `PDF pages ${start + 1} to ${end + 1}`;

const attachedPages = (start: number, end: number) =>
  `The attached file holds ${pagesLabel(start, end)} of the source document. Page 1 of the attached file is PDF page ${start + 1}.`;

const publicSegment = (raw: SegmentLike) => {
  const segment = raw as Partial<GeneratedSegment>;
  return {
    id: segment.id,
    title: segment.title,
    durationInFrames: segment.durationInFrames,
    narration: segment.narration,
    scene: segment.scene,
  };
};

const problems = (issues: GenerationIssue[]) => issues.map((item) => `- ${item.path}: ${item.message}`).join('\n');

export const structurePrompt = (totalPages: number, isPhoto: boolean) =>
  isPhoto
    ? `Read the attached photo of study material.
Return a title: a short proper name for the subject, not a file name.
Return a category: exactly one word in title case for a library filter, such as Economy, Business, or Software.
Return one chapter covering the photo: pdfPageStart 1 and pdfPageEnd 1, skip false, with a short title.`
    : `Read the attached document. It has ${totalPages} pages.
Return a title: a short proper name for the whole subject, not a file name.
Return a category: exactly one word in title case for a library filter, such as Economy, Business, or Software.

Return every chapter of the document in order, using the table of contents or the chapter headings.
Include every numbered chapter; do not stop early and do not merge chapters.
A chapter is a top-level chapter (such as "Chapter 3"), never a section inside one: numbered sections (3.1, 3.2), worked examples, problems, exercises, and hints stay inside the chapter they belong to. If the file holds a single chapter, return that one chapter covering all its pages.
Also return front matter (cover, title page, dedication, preface, table of contents) and back matter (appendices, bibliography, index) as entries with skip=true.
pdfPageStart and pdfPageEnd are 1-based pages of the attached file: page 1 is the first page of the file, whatever number is printed on it. Values run from 1 to ${totalPages}.
printedStart is the start page number exactly as the table of contents prints it. Omit it when there is no table of contents.
Chapters must not overlap, and together they must cover pages 1 to ${totalPages}.
pageLabelSamples: up to 5 file pages where a printed page number is visible, with that number.`;

export const chapterTextPrompt = (chapterTitle: string, start: number, end: number, part: number, parts: number) => `${attachedPages(start, end)}
These pages belong to the chapter "${chapterTitle}"${parts > 1 ? ` (part ${part} of ${parts})` : ''}.

Write chapterText: a complete markdown explanation of these pages for a learner.
Cover every page from the first to the last: every idea, definition, algorithm, worked example, exercise, figure, and table, in the order they appear. Explain what each figure shows.
Use headings. After each heading, cite the pages it covers like [p. 1] or [pp. 2-3]. Page numbers are positions in the attached file, 1 to ${end - start + 1}, not the numbers printed on the pages.
Keep code short: describe what it does and show only the key lines.
Stay inside what the pages say. Do not add outside material.`;

export const lessonOutlinePrompt = (chapterTitle: string, start: number, end: number, chapterText: string, suggested: number) => `${attachedPages(start, end)}
It is the chapter "${chapterTitle}". A full explanation of the chapter follows below.

Split the chapter into lessons, in order. Each lesson is a short video with a spoken script of ${LESSON_WORDS.min} to ${LESSON_WORDS.max} words (3 to 5 minutes), so give each lesson enough material for that.
About ${suggested} lesson${suggested === 1 ? '' : 's'} fit this chapter; use fewer for thin material.
pageStart and pageEnd are positions in the attached file (1 to ${end - start + 1}), not the numbers printed on the pages; the explanation cites the same positions as [p. N]. Lessons cover every page in order, from page 1 to the last page; neighbours may share a boundary page.
focus says in one or two sentences what the lesson teaches.

Chapter explanation:
${chapterText}`;

export const lessonScriptPrompt = (input: {
  chapterTitle: string;
  title: string;
  focus: string;
  start: number;
  end: number;
  notes: string;
  previousTitle?: string;
  nextTitle?: string;
}) => `${attachedPages(input.start, input.end)}
Write the spoken script for the lesson "${input.title}" in the chapter "${input.chapterTitle}".
Focus: ${input.focus}
${input.previousTitle ? `The previous lesson was "${input.previousTitle}".` : 'This is the first lesson of the chapter.'}${input.nextTitle ? ` The next lesson is "${input.nextTitle}".` : ''}

explanationSummary is read aloud by a narrator over a video. Write ${LESSON_WORDS.min} to ${LESSON_WORDS.max} words; aim for about ${Math.round((LESSON_WORDS.min + LESSON_WORDS.max) / 2)}.
Plain prose only: no markdown, lists, headings, code blocks, or tables. Say formulas in words.
Every sentence is complete and under ${SEGMENT_WORDS.max - 5} words.
Teach the ideas; do not mention pages, files, or "this lesson".
Stay inside the attached pages and the chapter notes below.

Chapter notes:
${input.notes}`;

export const tightenPrompt = (script: string, target: number) => `Rewrite this spoken lesson script to about ${target} words (between ${LESSON_WORDS.min} and ${LESSON_WORDS.max}).
Keep every key idea and the order. Keep plain prose, complete sentences, each under ${SEGMENT_WORDS.max - 5} words.
Return it as explanationSummary.

Script:
${script}`;

export const studyDocPrompt = (input: {
  chapterTitle: string;
  title: string;
  start: number;
  end: number;
  script: string;
  notes: string;
  short?: boolean;
}) => `${attachedPages(input.start, input.end)}
Write the study notes for the lesson "${input.title}" in the chapter "${input.chapterTitle}". They are shown below the lesson video.

studyDoc is markdown and more extensive than the spoken script: headings, definitions, worked examples, short code where the source has code, and figures described in words.
${input.short ? 'The previous draft was cut off. Write about 400 to 600 words.' : 'Write about 600 to 1,000 words.'}
End with a "Key takeaways" list as the last section, and put nothing after it.
Wrap math in single dollar signs, like $O(n \\log n)$.
Stay inside the attached pages and the notes below.

Spoken script of the lesson:
${input.script}

Chapter notes:
${input.notes}`;

export const beatsPrompt = (input: { title: string; sentences: string[]; start: number; end: number }) => `${attachedPages(input.start, input.end)}
Plan the video for the lesson "${input.title}". Its narration is the numbered sentences below.

Split the narration into beats. A beat is one idea with one visual, spoken over sentences firstSentence to lastSentence.
Beats cover every sentence exactly once, in order, without gaps or overlaps.
Aim for ${SEGMENT_WORDS.min} to ${SEGMENT_WORDS.max} words per beat (6 to 15 seconds), and ${SEGMENTS_PER_LESSON.min} to ${SEGMENTS_PER_LESSON.max} beats in total.
visual names one template (titleCard, bullets, flow, compare, hubSpoke, chart, timeline, callout) and what it shows. Open with a titleCard. Vary the templates.
pages lists pages of the attached file (1 to ${input.end - input.start + 1}) the beat draws on, so the visual can use their figures.

Narration:
${input.sentences.map((sentence, index) => `${index + 1}. ${sentence}`).join('\n')}`;

export type SceneInput = {
  lessonTitle: string;
  title: string;
  visual: string;
  narration: string;
  durationInFrames: number;
  start: number;
  end: number;
  pageText: string;
};

export const scenePrompt = (input: SceneInput, extra = '') => `${attachedPages(input.start, input.end)}
Design the on-screen visual for one segment of the lesson video "${input.lessonTitle}".
Segment title: ${input.title}
Visual idea: ${input.visual}
Narration spoken while it shows: "${input.narration}"
The segment lasts ${input.durationInFrames} frames at ${FPS} fps. Every appearAt is below ${input.durationInFrames}; time items to the narration.
Return title and scene with exactly one template. Ground every label in the attached pages; use their figures when they help.
Node labels are about 6 words. Bullets are about 12 words.${extra}

${templateGuide}

Text of the attached pages:
${input.pageText.slice(0, 12_000)}`;

export const retryScenePrompt = (input: SceneInput, previous: SegmentLike | null, issues: GenerationIssue[]) =>
  scenePrompt(
    input,
    `${issues.length ? `\n\nThe previous attempt failed validation:\n${problems(issues)}` : ''}${previous ? `\n\nPrevious attempt:\n${JSON.stringify(publicSegment(previous))}` : ''}`,
  );

export const learnerScenePrompt = (input: SceneInput, current: GeneratedSegment, request?: string) =>
  scenePrompt(
    input,
    `\n\nExplain this segment in more depth than the current version.${request ? `\nLearner request: ${request}` : ''}\n\nCurrent segment:\n${JSON.stringify(publicSegment(current))}`,
  );

export const repairPrompt = (segment: SegmentLike, issues: GenerationIssue[]) => `Fix only these problems in one lesson segment. Return the corrected title and scene.
Do not add coordinates. Use the same template unless a problem says the template itself is invalid.
Every required field of the chosen template must be present and non-empty.
The segment lasts ${String((segment as Partial<GeneratedSegment>).durationInFrames ?? '')} frames; every appearAt is below that.

Problems:
${problems(issues)}

${templateGuide}

Current segment:
${JSON.stringify(publicSegment(segment))}`;

export const reviewPrompt = (segment: GeneratedSegment, frames: number[], start: number, end: number) => `You are reviewing still frames of one lesson segment.
The first attached file is ${pagesLabel(start, end)} of the source. The still frames follow it, in this order: ${frames.join(', ')}.
Judge only what you can see:
- Text is legible and not overflowing, overlapping, or clipped.
- The diagram is conceptually right and faithful to the source pages.
- It matches the narration.
- Pacing: items should not all appear on the first frame if the segment is long.

Return pass=true only when the score is high and you would show this to a learner.
score is 0 to 10.
issues name the frame, the problem, and severity low, medium, or high.
If you can fix it, include patchedSegment with the corrected title and scene. Otherwise omit patchedSegment.

Segment JSON:
${JSON.stringify(publicSegment(segment))}`;

export const chatPrompt = (input: {
  question: string;
  lessonTitle: string;
  chapterTitle: string;
  segmentNarration: string;
  explanationSummary: string;
  studyDoc: string;
  chapterText: string;
}) => `A learner is watching the lesson "${input.lessonTitle}" from the chapter "${input.chapterTitle}" and paused to ask a question.
Answer in short markdown, at the level of the lesson. Use the material below; say so when the question goes beyond it.

Question: ${input.question}

On screen right now (narration of the current segment):
${input.segmentNarration || '(not playing)'}

Lesson script:
${input.explanationSummary}

Lesson study notes:
${input.studyDoc.slice(0, 12_000)}

Chapter explanation:
${input.chapterText.slice(0, 30_000)}`;
