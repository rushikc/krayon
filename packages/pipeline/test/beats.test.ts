import { LESSON_SECONDS, SEGMENTS_PER_LESSON, SEGMENT_FRAMES, SEGMENT_WORDS, framesFor, wordCount } from '@krayon/shared';
import { describe, expect, it } from 'vitest';
import { beatCoverageIssues, beatsFromRanges, fallbackBeats, normalizeBeats, splitSentences } from '../src/beats.js';
import type { Beat } from '../src/beats.js';
import { sentences } from './helpers.js';

const beat = (text: string[], title = 'Beat'): Beat => ({ title, visual: 'callout', pages: [0], sentences: text });

describe('splitSentences', () => {
  it('splits on sentence ends and keeps the text verbatim', () => {
    expect(splitSentences('Prices rise.  Demand falls! Why? "Quoted." 3 items remain.')).toEqual([
      'Prices rise.',
      'Demand falls!',
      'Why?',
      '"Quoted."',
      '3 items remain.',
    ]);
    expect(splitSentences('e.g. lower case keeps going.')).toEqual(['e.g. lower case keeps going.']);
  });
});

describe('beat ranges', () => {
  it('reports gaps, overlaps, and a short end with paths', () => {
    const ranges = [
      { firstSentence: 1, lastSentence: 2, title: 'a', visual: 'v', pages: [] },
      { firstSentence: 4, lastSentence: 5, title: 'b', visual: 'v', pages: [] },
    ];
    expect(beatCoverageIssues(ranges, 6).map((issue) => issue.path)).toEqual(['beats[1].firstSentence', 'beats']);
    expect(beatCoverageIssues([{ firstSentence: 1, lastSentence: 3, title: 'a', visual: 'v', pages: [] }], 3)).toEqual([]);
  });

  it('repairs miscounted ranges so every sentence is used once, in order', () => {
    const text = sentences(5, 10);
    const beats = beatsFromRanges(
      text,
      [
        { firstSentence: 1, lastSentence: 2, title: 'a', visual: 'v', pages: [1, 1, 2] },
        { firstSentence: 2, lastSentence: 3, title: 'b', visual: 'v', pages: [3] },
      ],
      (page) => page + 19,
    );
    expect(beats.flatMap((item) => item.sentences)).toEqual(text);
    expect(beats[0]?.pages).toEqual([20, 21]);
    expect(beats[1]?.sentences).toHaveLength(3);
  });
});

describe('normalizeBeats', () => {
  it('splits long beats, merges short ones, and keeps narration verbatim and timed', () => {
    const text = sentences(36, 14);
    const input = [beat(text.slice(0, 6), 'long'), ...text.slice(6).map((sentence, index) => beat([sentence], `b${index}`))];
    input.splice(3, 0, beat(['Tiny.'], 'tiny'));
    const timed = normalizeBeats(input);

    expect(timed.map((item) => item.narration).join(' ')).toBe([...text.slice(0, 6), ...text.slice(6, 8), 'Tiny.', ...text.slice(8)].join(' '));
    expect(timed.every((item) => item.words <= SEGMENT_WORDS.max)).toBe(true);
    expect(timed.length).toBeGreaterThanOrEqual(SEGMENTS_PER_LESSON.min);
    expect(timed.length).toBeLessThanOrEqual(SEGMENTS_PER_LESSON.max);
    let start = 0;
    for (const item of timed) {
      expect(item.startFrame).toBe(start);
      expect(item.durationInFrames).toBe(framesFor(item.words));
      expect(item.durationInFrames).toBeGreaterThanOrEqual(SEGMENT_FRAMES.min);
      expect(item.durationInFrames).toBeLessThanOrEqual(SEGMENT_FRAMES.max);
      start += item.durationInFrames;
    }
    expect(timed.some((item) => item.narration === 'Tiny.')).toBe(false);
  });

  it('splits a single long sentence at a clause boundary', () => {
    const long = `${Array.from({ length: 25 }, () => 'alpha').join(' ')}, ${Array.from({ length: 25 }, () => 'beta').join(' ')}.`;
    const timed = normalizeBeats([beat([long])]);
    expect(timed.length).toBeGreaterThan(1);
    expect(timed[0]?.narration.endsWith(',')).toBe(true);
    expect(timed.map((item) => item.narration).join(' ')).toBe(long);
  });

  it('keeps a 660-word lesson inside LESSON_SECONDS', () => {
    const text = sentences(44, 15);
    expect(wordCount(text.join(' '))).toBe(660);
    const timed = normalizeBeats(fallbackBeats(text));
    const last = timed[timed.length - 1]!;
    expect((last.startFrame + last.durationInFrames) / 30).toBeLessThanOrEqual(LESSON_SECONDS.max + SEGMENT_FRAMES.max / 30);
    expect(timed.length).toBeLessThanOrEqual(SEGMENTS_PER_LESSON.max);
  });

  it('leaves a short beat that fits nowhere short and stretches it', () => {
    const timed = normalizeBeats([beat([sentences(1, 34)[0]!]), beat(['Short one.']), beat([sentences(1, 34)[0]!])]);
    const short = timed.find((item) => item.narration === 'Short one.');
    expect(short?.words).toBe(2);
    expect(short?.durationInFrames).toBe(SEGMENT_FRAMES.min);
  });
});
