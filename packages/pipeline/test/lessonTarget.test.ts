import { describe, expect, it } from 'vitest';
import { lessonTarget } from '../src/chapters.js';

describe('lessonTarget', () => {
  it('suggests about one lesson per three pages', () => {
    expect(lessonTarget(22)).toEqual({ suggested: 7, fewest: 3 });
    expect(lessonTarget(26)).toEqual({ suggested: 9, fewest: 4 });
  });

  it('asks for at least one lesson and at most twelve', () => {
    expect(lessonTarget(1)).toEqual({ suggested: 1, fewest: 1 });
    expect(lessonTarget(120)).toEqual({ suggested: 12, fewest: 6 });
  });
});
