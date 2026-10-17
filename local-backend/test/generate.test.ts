import { readFileSync } from 'node:fs';
import { generateValidated } from '@krayon/pipeline';
import { GenerationError, modelResponseSchemas, segmentModelSchema, validateSegment } from '@krayon/shared';
import { describe, expect, it } from 'vitest';

const segment = (layout: Record<string, unknown>) => ({
  id: 'idea',
  title: 'Statelessness',
  durationInFrames: 150,
  narration: 'Each request stands alone.',
  scene: { layout },
});

const recorder = () => {
  const lines: Array<{ level: string; message: string; fields?: Record<string, unknown> }> = [];
  const at = (level: string) => (message: string, fields?: Record<string, unknown>) => {
    lines.push({ level, message, fields });
  };
  return { lines, log: { info: at('info'), warn: at('warn'), error: at('error'), debug: at('debug') } };
};

const check = (value: Parameters<typeof validateSegment>[0]) => validateSegment(value).map(({ path, message }) => ({ path, message }));

describe('generateValidated', () => {
  it('defaults a missing callout.title without a retry', async () => {
    const { lines, log } = recorder();
    const result = await generateValidated({
      name: 'segment',
      prompt: 'p',
      schema: segmentModelSchema,
      check,
      attempts: 3,
      log,
      generate: async () => JSON.stringify(segment({ type: 'callout', kind: 'keyPoint', body: 'The server keeps no session.' })),
    });
    expect(result.attempts).toBe(1);
    expect(result.value.scene.layout).toMatchObject({ type: 'callout', title: 'Statelessness' });
    expect(lines.filter((line) => line.level === 'warn')).toHaveLength(0);
  });

  it('repairs a missing callout.body by retrying with the path-qualified issue', async () => {
    const { lines, log } = recorder();
    const prompts: string[] = [];
    const outputs = [
      'not json',
      JSON.stringify(segment({ type: 'callout', kind: 'keyPoint' })),
      JSON.stringify(segment({ type: 'callout', kind: 'keyPoint', body: 'The server keeps no session.' })),
    ];
    const result = await generateValidated({
      name: 'segment',
      prompt: 'base',
      schema: segmentModelSchema,
      check,
      attempts: 3,
      log,
      fields: { segmentId: 'idea' },
      generate: async (prompt) => {
        prompts.push(prompt);
        return outputs[prompts.length - 1] ?? '';
      },
    });
    expect(result.attempts).toBe(3);
    expect(prompts[1]).toContain('response: The model did not return JSON.');
    expect(prompts[2]).toContain('- scene.layout.body: Invalid input: expected string, received undefined');
    const warns = lines.filter((line) => line.level === 'warn');
    expect(warns.map((line) => line.fields?.code)).toEqual(['NOT_JSON', 'SCHEMA_INVALID']);
    expect(warns[1]?.fields).toMatchObject({ event: 'ai.attempt', attempt: 2, max_attempts: 3, segmentId: 'idea' });
    expect(String(warns[1]?.fields?.raw)).toContain('"kind":"keyPoint"');
    expect(lines.some((line) => line.fields?.event === 'ai.repaired')).toBe(true);
  });

  it('throws a structured SCHEMA_INVALID error after the last attempt and logs it at error', async () => {
    const { lines, log } = recorder();
    const run = generateValidated({
      name: 'segment',
      prompt: 'p',
      schema: segmentModelSchema,
      attempts: 2,
      log,
      generate: async () => JSON.stringify(segment({ type: 'chart', curves: [] })),
    });
    const error = await run.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GenerationError);
    expect((error as GenerationError).code).toBe('SCHEMA_INVALID');
    expect((error as GenerationError).attempts).toBe(2);
    expect((error as GenerationError).issues.map((issue) => issue.path)).toContain('scene.layout.xLabel');
    expect(lines.filter((line) => line.level === 'error').map((line) => line.fields?.event)).toEqual(['ai.failed']);
  });

  it('maps upstream failures to UPSTREAM / MAX_TOKENS without retrying', async () => {
    const { log } = recorder();
    let calls = 0;
    const error = await generateValidated({
      name: 'segment',
      prompt: 'p',
      schema: segmentModelSchema,
      attempts: 3,
      log,
      generate: async () => {
        calls += 1;
        throw new Error('MAX_TOKENS');
      },
    }).catch((caught: unknown) => caught as GenerationError);
    expect(calls).toBe(1);
    expect(error.code).toBe('MAX_TOKENS');
  });
});

describe('ai_schemas.json', () => {
  it('matches the schemas generated from zod (run npm run schemas -w @krayon/pipeline)', () => {
    const file = new URL('../../packages/pipeline/src/ai_schemas.json', import.meta.url);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(modelResponseSchemas)));
  });
});
