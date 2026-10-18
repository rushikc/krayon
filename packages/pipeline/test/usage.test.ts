import { describe, expect, it } from 'vitest';
import { DemoLimitError, capsOff, reserveUsage } from '../src/usage.js';
import { memoryDocs } from './helpers.js';

describe('usage caps', () => {
  it('a cap of 0 does not count', async () => {
    const { docs } = memoryDocs();
    await reserveUsage(docs, 'render', capsOff, 'a');
    await reserveUsage(docs, 'render', capsOff, 'a');
    expect(await docs.get(`usage/${new Date().toISOString().slice(0, 10)}`)).toBeNull();
  });

  it('each cap returns 429 once the count is reached', async () => {
    const { docs } = memoryDocs();
    const caps = {
      uploadsPerVisitorDay: 1,
      coursesGlobalDay: 1,
      lessonRendersGlobalDay: 1,
      regeneratesGlobalDay: 1,
      askGlobalDay: 1,
    };
    await reserveUsage(docs, 'upload', caps, 'a');
    await expect(reserveUsage(docs, 'upload', caps, 'a')).rejects.toBeInstanceOf(DemoLimitError);
    await reserveUsage(docs, 'upload', caps, 'b');
    for (const kind of ['course', 'render', 'regenerate', 'ask'] as const) {
      await reserveUsage(docs, kind, caps, 'a');
      await expect(reserveUsage(docs, kind, caps, 'a')).rejects.toMatchObject({ code: 'demo_limit', statusCode: 429 });
    }
  });
});
