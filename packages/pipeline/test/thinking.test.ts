import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { generateValidated } from '../src/generate.js';
import { callTypeForAttempt, thinkingBudgetFor, thinkingConfigFor } from '../src/gemini.js';
import { quietLog } from './helpers.js';

const CALL_TYPES = ['structure', 'chapterText', 'lessonOutline', 'lessonScript', 'tighten', 'studyDoc', 'chat', 'api'];

describe('thinking budget', () => {
  it('sends the budget for each call type', () => {
    const budget = (type: string) => thinkingConfigFor('gemini-2.5-flash', type).thinkingConfig?.thinkingBudget;
    expect(budget('scene')).toBe(0);
    expect(budget('beats')).toBe(0);
    expect(budget('review')).toBe(256);
    expect(budget('repair')).toBe(256);
    for (const type of CALL_TYPES) expect(budget(type)).toBe(1024);
  });

  it('lets THINKING_BUDGET_<CALLTYPE> override the default', () => {
    expect(thinkingBudgetFor('scene', { THINKING_BUDGET_SCENE: '256' })).toBe(256);
    expect(thinkingBudgetFor('scene', { THINKING_BUDGET_SCENE: '0' })).toBe(0);
    expect(thinkingConfigFor('gemini-2.5-flash', 'scene', { THINKING_BUDGET_SCENE: '256' }).thinkingConfig?.thinkingBudget).toBe(256);
  });

  it('sends no thinking config for a model that is not flash', () => {
    expect(thinkingConfigFor('gemini-2.5-pro', 'scene')).toEqual({});
  });

  it('asks for a repair call on a scene retry', async () => {
    expect(callTypeForAttempt('scene', 1)).toBe('scene');
    expect(callTypeForAttempt('scene', 2)).toBe('repair');
    expect(callTypeForAttempt('review', 2)).toBe('review');

    const seen: string[] = [];
    await generateValidated({
      name: 'scene',
      prompt: 'draw it',
      schema: z.object({ ok: z.boolean() }),
      attempts: 2,
      log: quietLog,
      generate: async (_prompt, attempt) => {
        seen.push(callTypeForAttempt('scene', attempt));
        return attempt === 1 ? 'not json' : '{"ok":true}';
      },
    });
    expect(seen).toEqual(['scene', 'repair']);
  });
});
