import { z } from 'zod';
import {
  beatsSchema,
  chapterTextSchema,
  chatSchema,
  lessonOutlineSchema,
  lessonScriptSchema,
  reviewSchema,
  sceneOnlySchema,
  segmentSchema,
  structureSchema,
  studyDocSchema,
} from './schemas.js';

/**
 * Keys both Gemini paths accept: Vertex `responseJsonSchema` (genkit) and the OpenAPI-style
 * `responseSchema` (gemini.ts normalizeSchema upper-cases `type`).
 */
const KEEP = new Set(['type', 'properties', 'items', 'required', 'description', 'enum', 'format', 'minItems', 'maxItems', 'minimum', 'maximum']);

type Json = Record<string, unknown>;

const isNull = (node: unknown) => Boolean(node) && typeof node === 'object' && (node as Json).type === 'null';

const clean = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== 'object') return node;
  const source = node as Json;
  const branches = (source.anyOf ?? source.oneOf) as unknown[] | undefined;
  if (Array.isArray(branches)) {
    const kept = branches.filter((branch) => !isNull(branch));
    const description = typeof source.description === 'string' ? { description: source.description } : {};
    if (kept.length === 1) return clean({ ...(kept[0] as Json), ...description });
    return { anyOf: kept.map(clean), ...description };
  }
  const out: Json = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'const') {
      out.enum = [value];
    } else if (!KEEP.has(key)) {
      continue;
    } else if ((key === 'minimum' || key === 'maximum') && Math.abs(Number(value)) === Number.MAX_SAFE_INTEGER) {
      continue;
    } else if (key === 'type' && Array.isArray(value)) {
      const types = value.filter((type) => type !== 'null');
      out.type = types.length === 1 ? types[0] : types;
    } else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(Object.entries(value as Json).map(([name, child]) => [name, clean(child)]));
    } else if (key === 'items') {
      out.items = clean(value);
    } else {
      out[key] = value;
    }
  }
  return out;
};

/**
 * Gemini response schema generated from a zod schema, so zod stays the single source of truth.
 * Uses the input side of transforms and defaults (optional on input), turns the layout union into
 * `anyOf` branches with their own `required` lists, and drops keys Gemini rejects.
 */
export const toModelSchema = (schema: z.ZodType): Json =>
  clean(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Json;

/** Named response schemas used by the pipeline and POST /api/ai/generate. */
export const modelResponseSchemas = {
  structure: toModelSchema(structureSchema),
  chapterText: toModelSchema(chapterTextSchema),
  lessonOutline: toModelSchema(lessonOutlineSchema),
  lessonScript: toModelSchema(lessonScriptSchema),
  studyDoc: toModelSchema(studyDocSchema),
  beats: toModelSchema(beatsSchema),
  scene: toModelSchema(sceneOnlySchema),
  segment: toModelSchema(segmentSchema),
  review: toModelSchema(reviewSchema),
  chat: toModelSchema(chatSchema),
};

export type ModelSchemaName = keyof typeof modelResponseSchemas;
