import { Schema } from 'firebase/ai';
import { layoutTypes } from '@krayon/shared';

export { layoutSchema, lessonSchema, roadmapSchema, segmentSchema } from '@krayon/shared';
export type { ParsedLesson, ParsedRoadmap, ParsedSegment } from '@krayon/shared';

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
