import { GenerationError } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { lessonTarget, withShorterRetry } from '../src/chapters.js';

const maxTokens = () => new GenerationError('MAX_TOKENS', [{ path: 'studyDoc', message: 'MAX_TOKENS' }], 1);

describe('lessonTarget', () => {
  it('suggests about one lesson per 540 words of chapter text', () => {
    expect(lessonTarget({ words: 2700, pages: 22 })).toEqual({ suggested: 5, fewest: 2 });
    expect(lessonTarget({ pages: 22 })).toEqual({ suggested: 4, fewest: 2 });
    expect(lessonTarget({ words: 2700, pages: 22 }).suggested).toBeGreaterThanOrEqual(4);
    expect(lessonTarget({ pages: 22 }).suggested).toBeLessThanOrEqual(7);
  });

  it('retries a study doc once, shorter, when it hits the token limit', async () => {
    const calls: boolean[] = [];
    const doc = await withShorterRetry(async (short) => {
      calls.push(short);
      if (!short) throw maxTokens();
      return 'shorter notes';
    });
    expect(calls).toEqual([false, true]);
    expect(doc).toBe('shorter notes');

    const again: boolean[] = [];
    await expect(
      withShorterRetry(async (short) => {
        again.push(short);
        throw maxTokens();
      }),
    ).rejects.toMatchObject({ code: 'MAX_TOKENS' });
    expect(again).toEqual([false, true]);

    const other: boolean[] = [];
    await expect(
      withShorterRetry(async (short) => {
        other.push(short);
        throw new GenerationError('UPSTREAM', [{ path: 'response', message: 'down' }], 1);
      }),
    ).rejects.toMatchObject({ code: 'UPSTREAM' });
    expect(other).toEqual([false]);
  });

  it('asks for one lesson from a short chapter and at most eight', () => {
    expect(lessonTarget({ words: 300, pages: 4 })).toEqual({ suggested: 1, fewest: 1 });
    expect(lessonTarget({ words: 20_000, pages: 120 })).toEqual({ suggested: 8, fewest: 4 });
    expect(lessonTarget({ pages: 1 })).toEqual({ suggested: 1, fewest: 1 });
  });
});
