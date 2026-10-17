import { z } from 'zod';
import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneLayout } from './scene.js';

const optionalText = z
  .string()
  .nullish()
  .transform((value) => (value ? value : undefined));

const appearAt = z
  .number()
  .nullish()
  .transform((value) => (value == null ? undefined : Math.round(value)));

const timedText = z.object({
  text: z.string().min(1),
  appearAt,
});

const titledNode = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
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

const calloutLayout = z.object({
  type: z.literal('callout'),
  kind: z.enum(['definition', 'example', 'keyPoint']),
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
  layout: layoutSchema,
});

export const segmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationInFrames: z.number(),
  narration: z.string().default(''),
  scene: sceneSchema,
});

export const lessonSchema = z.object({
  studyDoc: z.string().default(''),
  segments: z.array(segmentSchema).min(1),
});

export const roadmapSchema = z.object({
  topics: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1),
        summary: z.string().default(''),
        prerequisites: z.array(z.string()).default([]),
        sourcePages: z.array(z.number()).default([]),
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
