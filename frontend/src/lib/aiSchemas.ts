import { Schema } from 'firebase/ai';
import { z } from 'zod';
import { layoutTypes } from '../remotion/scene.ts';
import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneLayout } from '../remotion/scene.ts';

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
  direction: z.enum(['horizontal', 'vertical']),
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

const timedResponse = Schema.object({
  properties: {
    text: Schema.string(),
    appearAt: Schema.integer({ description: 'Optional frame when this item appears.' }),
  },
  optionalProperties: ['appearAt'],
});

const nodeResponse = Schema.object({
  properties: {
    id: Schema.string(),
    label: Schema.string({ description: 'About 6 words.' }),
    sublabel: Schema.string(),
    appearAt: Schema.integer(),
  },
  optionalProperties: ['sublabel', 'appearAt'],
});

const layoutResponseSchema = Schema.object({
  description: 'One template. Fill only the fields for the chosen type.',
  properties: {
    type: Schema.enumString({
      enum: [...layoutTypes],
      description: 'titleCard, bullets, flow, compare, hubSpoke, chart, timeline, or callout.',
    }),
    title: Schema.string(),
    subtitle: Schema.string(),
    heading: Schema.string(),
    body: Schema.string(),
    direction: Schema.enumString({ enum: ['horizontal', 'vertical'] }),
    kind: Schema.enumString({
      enum: ['definition', 'example', 'keyPoint'],
      description: 'Callout kind only.',
    }),
    items: Schema.array({ items: timedResponse }),
    nodes: Schema.array({ items: nodeResponse }),
    edges: Schema.array({
      items: Schema.object({
        properties: {
          from: Schema.string(),
          to: Schema.string(),
          label: Schema.string(),
        },
        optionalProperties: ['label'],
      }),
    }),
    left: Schema.object({
      properties: {
        title: Schema.string(),
        points: Schema.array({ items: timedResponse }),
      },
    }),
    right: Schema.object({
      properties: {
        title: Schema.string(),
        points: Schema.array({ items: timedResponse }),
      },
    }),
    center: Schema.object({
      properties: {
        id: Schema.string(),
        label: Schema.string(),
      },
    }),
    spokes: Schema.array({ items: nodeResponse }),
    xLabel: Schema.string(),
    yLabel: Schema.string(),
    curves: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string(),
          label: Schema.string(),
          kind: Schema.enumString({ enum: ['upward', 'downward', 'flat'] }),
          shift: Schema.enumString({ enum: ['left', 'right'] }),
          appearAt: Schema.integer(),
        },
        optionalProperties: ['shift', 'appearAt'],
      }),
    }),
    markers: Schema.array({
      items: Schema.object({
        properties: {
          type: Schema.enumString({ enum: ['intersection', 'point'] }),
          curveIds: Schema.array({ items: Schema.string() }),
          label: Schema.string(),
          appearAt: Schema.integer(),
        },
        optionalProperties: ['curveIds', 'appearAt'],
      }),
    }),
    steps: Schema.array({
      items: Schema.object({
        properties: {
          label: Schema.string(),
          detail: Schema.string(),
          appearAt: Schema.integer(),
        },
        optionalProperties: ['detail', 'appearAt'],
      }),
    }),
  },
  optionalProperties: [
    'title',
    'subtitle',
    'heading',
    'body',
    'direction',
    'kind',
    'items',
    'nodes',
    'edges',
    'left',
    'right',
    'center',
    'spokes',
    'xLabel',
    'yLabel',
    'curves',
    'markers',
    'steps',
  ],
});

const sceneResponseSchema = Schema.object({
  properties: {
    layout: layoutResponseSchema,
  },
});

export const roadmapResponseSchema = Schema.object({
  properties: {
    topics: Schema.array({
      items: Schema.object({
        properties: {
          id: Schema.string({ description: 'Unique kebab-case id.' }),
          title: Schema.string(),
          summary: Schema.string(),
          prerequisites: Schema.array({
            items: Schema.string({ description: 'Id of another topic in this roadmap.' }),
          }),
          sourcePages: Schema.array({
            items: Schema.integer({ description: '1-based page number. Use 1 for a photo.' }),
          }),
        },
      }),
    }),
  },
});

const segmentResponseSchema = Schema.object({
  properties: {
    id: Schema.string(),
    title: Schema.string(),
    durationInFrames: Schema.integer({ description: 'Length at 30 fps, between 90 and 450.' }),
    narration: Schema.string({ description: 'One or two sentences shown as the caption.' }),
    scene: sceneResponseSchema,
  },
});

export const lessonResponseSchema = Schema.object({
  properties: {
    studyDoc: Schema.string({ description: 'Markdown notes for this topic.' }),
    segments: Schema.array({ items: segmentResponseSchema }),
  },
});

export const segmentResponseSchemaOnly = segmentResponseSchema;

export type ParsedRoadmap = Roadmap;
export type ParsedLesson = GeneratedLesson;
export type ParsedSegment = GeneratedSegment;
