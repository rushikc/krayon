import { z } from 'zod';
import { FPS, LESSON_WORDS, LESSON_WORDS_ACCEPTED, SEGMENT_FRAMES, wordCount } from './limits.js';
import type { GeneratedSegment, SceneLayout } from './scene.js';

const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value ? value : undefined));

const appearAt = z
  .number()
  .nullish()
  .transform((value) => (value == null ? undefined : Math.round(value)))
  .describe('Optional frame when this item appears.');

const shortLabel = z.string().min(1).describe('About 6 words.');

const timedText = z.object({
  text: z.string().min(1),
  appearAt,
});

const titledNode = z.object({
  id: z.string().min(1),
  label: shortLabel,
  sublabel: optionalText,
  appearAt,
});

const titleCardLayout = z.object({
  type: z.literal('titleCard'),
  title: z.string().min(1),
  subtitle: optionalText,
});

const bulletsLayout = z.object({
  type: z.literal('bullets'),
  heading: z.string().min(1),
  items: z.array(timedText).min(1).max(5),
});

const flowLayout = z.object({
  type: z.literal('flow'),
  heading: optionalText,
  direction: z
    .enum(['horizontal', 'vertical'])
    .nullish()
    .transform((value) => value ?? 'horizontal'),
  nodes: z.array(titledNode).min(2).max(6),
  edges: z
    .array(
      z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        label: optionalText,
      }),
    )
    .default([]),
});

const compareSide = z.object({
  title: z.string().min(1),
  points: z.array(timedText).min(1).max(5),
});

const compareLayout = z.object({
  type: z.literal('compare'),
  heading: optionalText,
  left: compareSide,
  right: compareSide,
});

const hubSpokeLayout = z.object({
  type: z.literal('hubSpoke'),
  center: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
  }),
  spokes: z.array(titledNode).min(3).max(6),
});

const chartLayout = z.object({
  type: z.literal('chart'),
  heading: optionalText,
  xLabel: z.string().min(1),
  yLabel: z.string().min(1),
  curves: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        kind: z.enum(['upward', 'downward', 'flat']),
        shift: z.enum(['left', 'right']).nullish().transform((value) => value ?? undefined),
        appearAt,
      }),
    )
    .min(1)
    .max(4),
  markers: z
    .array(
      z.object({
        type: z.enum(['intersection', 'point']),
        curveIds: z
          .array(z.string())
          .nullish()
          .transform((value) => value ?? undefined),
        label: z.string().min(1),
        appearAt,
      }),
    )
    .default([]),
});

const timelineLayout = z.object({
  type: z.literal('timeline'),
  heading: optionalText,
  steps: z
    .array(
      z.object({
        label: z.string().min(1),
        detail: optionalText,
        appearAt,
      }),
    )
    .min(2)
    .max(6),
});

const calloutKinds = ['definition', 'example', 'keyPoint'] as const;

const calloutLayout = z.object({
  type: z.literal('callout'),
  kind: z.enum(calloutKinds),
  title: z.string().min(1),
  body: z.string().min(1),
});

export const layoutSchema: z.ZodType<SceneLayout> = z.discriminatedUnion('type', [
  titleCardLayout,
  bulletsLayout,
  flowLayout,
  compareLayout,
  hubSpokeLayout,
  chartLayout,
  timelineLayout,
  calloutLayout,
]);

const sceneSchema = z.object({
  layout: layoutSchema.describe('Exactly one template. Fill every required field of the chosen type.'),
});

export const segmentSchema = z.object({
  id: z.string().min(1).describe('Unique kebab-case id.'),
  title: z.string().min(1),
  durationInFrames: z
    .number()
    .min(SEGMENT_FRAMES.min)
    .max(SEGMENT_FRAMES.max)
    .describe(`Length at ${FPS} fps, between ${SEGMENT_FRAMES.min} and ${SEGMENT_FRAMES.max}.`),
  narration: z.string().default('').describe('The spoken narration for this segment.'),
  scene: sceneSchema,
});

/** What the scene model writes for one segment. Duration and narration come from the backend. */
export const sceneOnlySchema = z.object({
  title: z.string().min(1).describe('Short on-screen title for this segment.'),
  scene: sceneSchema,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';

/**
 * Fills display-only layout strings the model sometimes leaves out, using the segment title:
 * titleCard.title, bullets.heading, callout.title, and an unknown callout.kind becomes keyPoint.
 * Content fields (callout.body, chart axes, items) are never invented. Returns a copy.
 */
export const applySegmentDefaults = (raw: unknown): unknown => {
  if (!isRecord(raw) || !isRecord(raw.scene) || !isRecord(raw.scene.layout)) return raw;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : '';
  const layout = { ...raw.scene.layout };
  if (layout.type === 'titleCard' && blank(layout.title) && title) layout.title = title;
  if (layout.type === 'bullets' && blank(layout.heading) && title) layout.heading = title;
  if (layout.type === 'callout') {
    if (blank(layout.title) && title) layout.title = title;
    if (!calloutKinds.includes(layout.kind as (typeof calloutKinds)[number])) layout.kind = 'keyPoint';
  }
  return { ...raw, scene: { ...raw.scene, layout } };
};

/** segmentSchema with applySegmentDefaults applied first. Use it to parse model output. */
export const segmentModelSchema = z.preprocess(applySegmentDefaults, segmentSchema);

/** sceneOnlySchema with applySegmentDefaults applied first. */
export const sceneModelSchema = z.preprocess(applySegmentDefaults, sceneOnlySchema);

const filePage = z.number().int().min(1).describe('1-based page of the attached file.');

/** Structure pass: the only call that sees the whole document. */
export const structureSchema = z.object({
  title: z.string().min(1).describe('Short name for the whole subject, used as the library title.'),
  category: z.string().min(1).describe('One word, title case, such as Economy, Business, or Software.'),
  chapters: z
    .array(
      z.object({
        title: z.string().min(1).describe('Chapter title as written in the document, without the number.'),
        printedStart: z
          .number()
          .int()
          .nullish()
          .transform((value) => value ?? undefined)
          .describe('Start page printed in the table of contents, if the document has one.'),
        pdfPageStart: filePage.describe('1-based page of the attached file where the chapter starts (count file pages, not printed numbers).'),
        pdfPageEnd: filePage.describe('1-based page of the attached file where the chapter ends.'),
        skip: z
          .boolean()
          .nullish()
          .transform((value) => value ?? false)
          .describe('True for front or back matter: cover, preface, contents, index, bibliography.'),
      }),
    )
    .min(1),
  pageLabelSamples: z
    .array(
      z.object({
        pdfPage: filePage,
        printedLabel: z.string().min(1).describe('Page number printed on that page.'),
      }),
    )
    .default([])
    .describe('Up to 5 pages where a printed page number is visible, to map printed numbers to file pages.'),
});

export const chapterTextSchema = z.object({
  chapterText: z.string().min(1).describe('Markdown that explains the attached pages in full: ideas, definitions, examples, and figures.'),
});

export const lessonOutlineSchema = z.object({
  lessons: z
    .array(
      z.object({
        title: z.string().min(1),
        focus: z.string().min(1).describe('One or two sentences: what this lesson teaches.'),
        pageStart: filePage,
        pageEnd: filePage,
      }),
    )
    .min(1),
});

export const lessonScriptSchema = z.object({
  explanationSummary: z
    .string()
    .min(1)
    .describe(`Spoken script, plain prose without markdown or lists, ${LESSON_WORDS.min} to ${LESSON_WORDS.max} words.`),
});

export const studyDocSchema = z.object({
  studyDoc: z.string().min(1).describe('Markdown study notes, more extensive than the spoken script.'),
});

export const beatsSchema = z.object({
  beats: z
    .array(
      z.object({
        firstSentence: z.number().int().min(1).describe('Number of the first script sentence in this beat.'),
        lastSentence: z.number().int().min(1).describe('Number of the last script sentence in this beat.'),
        title: z.string().min(1).describe('Short on-screen title.'),
        visual: z.string().min(1).describe('One visual that shows the idea: which template and what it shows.'),
        pages: z.array(filePage).default([]).describe('Pages of the attached file this beat draws on.'),
      }),
    )
    .min(1),
});

export const chatSchema = z.object({
  answer: z.string().min(1).describe('Markdown answer to the learner.'),
});

/** A lesson as stored. The script must meet LESSON_WORDS unless the source material is short. */
export const storedLessonSchema = z
  .object({
    title: z.string().min(1),
    explanationSummary: z.string().min(1),
    studyDoc: z.string(),
    shortSource: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    const words = wordCount(value.explanationSummary);
    if (words > LESSON_WORDS_ACCEPTED.max || (!value.shortSource && words < LESSON_WORDS_ACCEPTED.min)) {
      context.addIssue({
        code: 'custom',
        path: ['explanationSummary'],
        message: `Has ${words} words; needs ${LESSON_WORDS.min} to ${LESSON_WORDS.max}.`,
      });
    }
  });

export const reviewIssueSchema = z.object({
  frame: z.number(),
  problem: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

export const reviewSchema = z.object({
  pass: z.boolean(),
  score: z.number().min(0).max(10),
  issues: z.array(reviewIssueSchema).default([]),
  patchedSegment: sceneOnlySchema.optional().describe('Corrected title and scene, if you can fix it.'),
});

export type ReviewIssue = z.infer<typeof reviewIssueSchema>;
export type ParsedSegment = GeneratedSegment;
export type ParsedStructure = z.infer<typeof structureSchema>;
export type ParsedBeats = z.infer<typeof beatsSchema>;
export type ReviewResult = z.infer<typeof reviewSchema>;
