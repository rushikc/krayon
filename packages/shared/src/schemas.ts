import { z } from 'zod';
import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneLayout } from './scene.js';

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
  durationInFrames: z.number().describe('Length at 30 fps, between 90 and 450.'),
  narration: z.string().default('').describe('One or two sentences shown as the caption.'),
  scene: sceneSchema,
});

export const lessonSchema = z.object({
  studyDoc: z.string().default('').describe('Markdown notes for this topic.'),
  segments: z.array(segmentSchema).min(1),
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

/** lessonSchema with applySegmentDefaults applied to every segment. Use it to parse model output. */
export const lessonModelSchema = z.preprocess(
  (raw) => (isRecord(raw) && Array.isArray(raw.segments) ? { ...raw, segments: raw.segments.map(applySegmentDefaults) } : raw),
  lessonSchema,
);

export const roadmapSchema = z.object({
  title: z.string().min(1).describe('Short name for the whole subject, used as the library title.'),
  category: z.string().min(1).describe('One word, title case, such as Economy, Business, or Software.'),
  topics: z
    .array(
      z.object({
        id: z.string().min(1).describe('Unique kebab-case id.'),
        title: z.string().min(1),
        summary: z.string().default(''),
        prerequisites: z.array(z.string().describe('Id of another topic in this roadmap.')).default([]),
        sourcePages: z.array(z.number().describe('1-based page number. Use 1 for a photo.')).default([]),
      }),
    )
    .min(1),
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
  patchedSegment: segmentSchema.optional(),
});

export type ReviewIssue = z.infer<typeof reviewIssueSchema>;
export type ParsedRoadmap = Roadmap;
export type ParsedLesson = GeneratedLesson;
export type ParsedSegment = GeneratedSegment;
export type ReviewResult = z.infer<typeof reviewSchema>;
