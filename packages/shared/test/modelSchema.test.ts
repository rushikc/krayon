import { describe, expect, it } from 'vitest';
import { GenerationError, generationErrorCode, generationErrorStatus, issuesText, zodIssues } from '../src/generation.js';
import { modelResponseSchemas } from '../src/modelSchema.js';
import { applySegmentDefaults, sceneModelSchema, segmentModelSchema, segmentSchema } from '../src/schemas.js';

const callout = (layout: Record<string, unknown>) => ({
  id: 'key-idea',
  title: 'Statelessness',
  durationInFrames: 180,
  narration: 'Each request carries everything the server needs.',
  scene: { layout: { type: 'callout', ...layout } },
});

type Json = { [key: string]: unknown };
const layoutBranches = (schema: Json) => {
  const props = schema.properties as Json;
  const scene = props.scene as Json;
  const layout = (scene.properties as Json).layout as Json;
  return Object.fromEntries(
    (layout.anyOf as Json[]).map((branch) => [((branch.properties as Json).type as Json).enum, branch.required]),
  ) as Record<string, string[]>;
};

describe('layout defaults', () => {
  it('fills a missing callout.title from the segment title', () => {
    const raw = callout({ kind: 'keyPoint', body: 'The server keeps no session.' });
    expect(segmentSchema.safeParse(raw).success).toBe(false);
    const parsed = segmentModelSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.scene.layout.type === 'callout') {
      expect(parsed.data.scene.layout.title).toBe('Statelessness');
    }
  });

  it('defaults an unknown callout.kind and fills bullets.heading and titleCard.title', () => {
    const fixed = applySegmentDefaults(callout({ kind: 'tip', title: '', body: 'x' })) as ReturnType<typeof callout>;
    expect(fixed.scene.layout).toMatchObject({ kind: 'keyPoint', title: 'Statelessness' });
    const bullets = segmentModelSchema.safeParse({ ...callout({}), scene: { layout: { type: 'bullets', items: [{ text: 'a' }] } } });
    expect(bullets.success && bullets.data.scene.layout.type === 'bullets' && bullets.data.scene.layout.heading).toBe('Statelessness');
    const title = segmentModelSchema.safeParse({ ...callout({}), scene: { layout: { type: 'titleCard' } } });
    expect(title.success && title.data.scene.layout.type === 'titleCard' && title.data.scene.layout.title).toBe('Statelessness');
  });

  it('never invents content fields and reports path-qualified issues', () => {
    const parsed = segmentModelSchema.safeParse(callout({ kind: 'keyPoint', title: 'T' }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(zodIssues(parsed.error)).toEqual([
        { path: 'scene.layout.body', message: 'Invalid input: expected string, received undefined' },
      ]);
    }
  });

  it('applies defaults to the scene-only model output', () => {
    const parsed = sceneModelSchema.safeParse({ title: 'Statelessness', scene: { layout: { type: 'callout', kind: 'definition', body: 'b' } } });
    expect(parsed.success && parsed.data.scene.layout.type === 'callout' && parsed.data.scene.layout.title).toBe('Statelessness');
  });
});

describe('model response schemas', () => {
  it('make the required fields of every layout required', () => {
    for (const schema of [modelResponseSchemas.segment, modelResponseSchemas.scene]) {
      const branches = layoutBranches(schema);
      expect(branches.titleCard).toEqual(['type', 'title']);
      expect(branches.bullets).toEqual(['type', 'heading', 'items']);
      expect(branches.chart).toEqual(['type', 'xLabel', 'yLabel', 'curves']);
      expect(branches.callout).toEqual(['type', 'kind', 'title', 'body']);
      expect(Object.keys(branches)).toHaveLength(8);
    }
  });

  it('only uses keys Gemini accepts', () => {
    const allowed = new Set(['type', 'properties', 'items', 'required', 'description', 'enum', 'format', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf']);
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        expect(allowed.has(key), key).toBe(true);
        if (key === 'properties') Object.values(value as Json).forEach(walk);
        else walk(value);
      }
    };
    Object.values(modelResponseSchemas).forEach(walk);
  });
});

describe('model response schemas for the course pipeline', () => {
  it('drop integer bounds Gemini rejects but keep required page fields', () => {
    const structure = modelResponseSchemas.structure as Json;
    const chapter = ((structure.properties as Json).chapters as Json).items as Json;
    expect(chapter.required).toEqual(expect.arrayContaining(['title', 'pdfPageStart', 'pdfPageEnd']));
    const outline = (((modelResponseSchemas.lessonOutline as Json).properties as Json).lessons as Json).items as Json;
    expect(outline.required).toEqual(['title', 'focus', 'pageStart', 'pageEnd']);
    expect((modelResponseSchemas.chat as Json).required).toEqual(['answer']);
  });
});

describe('generation errors', () => {
  it('classifies and maps to HTTP status', () => {
    expect(generationErrorCode(new Error('MAX_TOKENS'))).toBe('MAX_TOKENS');
    expect(generationErrorCode(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))).toBe('TIMEOUT');
    expect(generationErrorCode(new Error('500 internal'))).toBe('UPSTREAM');
    expect(generationErrorStatus('SCHEMA_INVALID')).toBe(422);
    expect(generationErrorStatus('NOT_JSON')).toBe(422);
    expect(generationErrorStatus('UPSTREAM')).toBe(502);
    const error = new GenerationError('SCHEMA_INVALID', [{ path: 'scene.layout.title', message: 'Required' }], 3);
    expect(error.toInfo()).toEqual({ code: 'SCHEMA_INVALID', message: 'scene.layout.title: Required', issues: error.issues, attempts: 3 });
    expect(issuesText(Array.from({ length: 7 }, (_, i) => ({ path: `p${i}`, message: 'm' })), 2)).toBe('p0: m; p1: m; and 5 more');
  });
});
