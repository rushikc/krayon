import { Schema } from 'firebase/ai';
import { z } from 'zod';
import { isSceneElementType } from '../remotion/scene.ts';
import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneElement } from '../remotion/scene.ts';

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

const graphPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const looseElementSchema = z.object({
  type: z.string(),
  text: optionalString,
  latex: optionalString,
  ref: optionalString,
  value: optionalString,
  start: z.number(),
  end: z.number(),
  points: z.array(graphPointSchema).nullish(),
});

const sceneSchema = z
  .object({
    elements: z.array(looseElementSchema).default([]),
  })
  .transform((scene) => ({
    elements: scene.elements.flatMap((element): SceneElement[] => {
      if (!isSceneElementType(element.type) || element.end < element.start) return [];
      return [
        {
          type: element.type,
          text: element.text,
          latex: element.latex,
          ref: element.ref,
          value: element.value,
          start: Math.round(element.start),
          end: Math.round(element.end),
          points: element.points ?? undefined,
        },
      ];
    }),
  }));

const clampDuration = (value: number) => Math.min(900, Math.max(30, Math.round(value)));

export const segmentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  durationInFrames: z.number().transform(clampDuration),
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

const elementFields = {
  type: Schema.enumString({
    enum: ['title', 'text', 'box', 'arrow', 'badge', 'equation', 'lineGraph', 'image'],
    description: 'One of the allowed scene primitives.',
  }),
  text: Schema.string({ description: 'Label or sentence. Used by title, text, and box.' }),
  latex: Schema.string({ description: 'LaTeX for an equation element.' }),
  ref: Schema.string({ description: 'Short figure label for an image element.' }),
  value: Schema.string({ description: 'Number or short mark for a badge.' }),
  start: Schema.integer({ description: 'Frame this element appears, relative to the segment.' }),
  end: Schema.integer({ description: 'Frame this element leaves, relative to the segment.' }),
  points: Schema.array({
    description: 'Points for a lineGraph element.',
    items: Schema.object({
      properties: {
        x: Schema.number(),
        y: Schema.number(),
      },
    }),
  }),
};

const sceneElementSchema = Schema.object({
  description: 'One drawn element. Use only the listed type values.',
  properties: elementFields,
  optionalProperties: ['text', 'latex', 'ref', 'value', 'points'],
});

const sceneResponseSchema = Schema.object({
  properties: {
    elements: Schema.array({ items: sceneElementSchema }),
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
    durationInFrames: Schema.integer({ description: 'Length at 30 fps, between 90 and 240.' }),
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
