import { describe, expect, it } from 'vitest';
import { FPS, LESSON_WORDS, SEGMENT_FRAMES, WPM, framesFor, framesForAudio, wordCount } from '../src/limits.js';
import {
  beatsSchema,
  lessonOutlineSchema,
  segmentSchema,
  storedLessonSchema,
  structureSchema,
} from '../src/schemas.js';
import type { GeneratedSegment } from '../src/scene.js';
import { layoutSegments } from './fixtures/lesson.js';

const titleCard = layoutSegments[0];
const bullets = layoutSegments.find((item) => item.scene.layout.type === 'bullets');

if (!titleCard || !bullets) throw new Error('Layout fixtures are missing.');
const bulletsLayout = bullets.scene.layout;
if (bulletsLayout.type !== 'bullets') throw new Error('Layout fixtures are missing.');

const withLayout = (item: GeneratedSegment, layout: GeneratedSegment['scene']['layout']): GeneratedSegment => ({
  ...item,
  scene: { layout },
});

const words = (count: number) => Array.from({ length: count }, (_, index) => `word${index}`).join(' ');

describe('limits', () => {
  it('keeps lessons about 3 to 5 minutes of speech', () => {
    expect(LESSON_WORDS).toEqual({ min: 420, max: 660 });
    expect((LESSON_WORDS.min / WPM) * 60).toBe(180);
    expect(Math.round((LESSON_WORDS.max / WPM) * 60)).toBeLessThanOrEqual(300);
  });

  it('clamps the silent estimate to 6 to 15 seconds and audio to 60 seconds', () => {
    expect(SEGMENT_FRAMES).toEqual({ min: 6 * FPS, max: 15 * FPS, sanityMax: 60 * FPS });
    expect(framesFor(1)).toBe(SEGMENT_FRAMES.min);
    expect(framesFor(500)).toBe(SEGMENT_FRAMES.max);
    expect(framesFor(25)).toBe(Math.ceil(((25 / WPM) * 60 + 0.6) * FPS));
    expect(framesForAudio(0)).toBe(SEGMENT_FRAMES.min);
    expect(framesForAudio(20)).toBe(Math.ceil((20 + 0.6) * FPS));
    expect(framesForAudio(120)).toBe(SEGMENT_FRAMES.sanityMax);
    expect(wordCount('  a  b\nc ')).toBe(3);
  });
});

describe('schemas', () => {
  it('parses one segment per layout', () => {
    for (const item of layoutSegments) {
      expect(segmentSchema.safeParse(item).success).toBe(true);
    }
  });

  it('rejects a bullets layout missing items', () => {
    const missing = withLayout(bullets, { type: 'bullets', heading: 'Demand shifts' } as GeneratedSegment['scene']['layout']);
    expect(segmentSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects an unknown layout type', () => {
    const unknown = withLayout(titleCard, { type: 'poster', title: 'Nope' } as unknown as GeneratedSegment['scene']['layout']);
    expect(segmentSchema.safeParse(unknown).success).toBe(false);
  });

  it('rejects the wrong field type', () => {
    const badAppear = withLayout(bullets, {
      ...bulletsLayout,
      items: [{ text: 'Price rises', appearAt: 'soon' as unknown as number }],
    });
    const badDuration = { ...titleCard, durationInFrames: '180' };
    expect(segmentSchema.safeParse(badAppear).success).toBe(false);
    expect(segmentSchema.safeParse(badDuration).success).toBe(false);
  });

  it('accepts any positive duration up to the sanity max', () => {
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 0 }).success).toBe(false);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 10.5 }).success).toBe(false);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 10 }).success).toBe(true);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 20 * FPS }).success).toBe(true);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: SEGMENT_FRAMES.sanityMax }).success).toBe(true);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: SEGMENT_FRAMES.sanityMax + 1 }).success).toBe(false);
  });

  it('parses structure with 1-based file pages and defaults skip', () => {
    const parsed = structureSchema.parse({
      title: 'Programming Challenges',
      category: 'Software',
      chapters: [{ title: 'Getting Started', pdfPageStart: 21, pdfPageEnd: 46, printedStart: 1 }],
      pageLabelSamples: [{ pdfPage: 21, printedLabel: '1' }],
    });
    expect(parsed.chapters[0]).toMatchObject({ skip: false, printedStart: 1 });
    expect(structureSchema.safeParse({ title: 'x', category: 'y', chapters: [{ title: 'a', pdfPageStart: 0, pdfPageEnd: 3 }] }).success).toBe(false);
  });

  it('requires at least one lesson and one beat', () => {
    expect(lessonOutlineSchema.safeParse({ lessons: [] }).success).toBe(false);
    expect(beatsSchema.safeParse({ beats: [] }).success).toBe(false);
    const beats = beatsSchema.parse({ beats: [{ firstSentence: 1, lastSentence: 2, title: 't', visual: 'v' }] });
    expect(beats.beats[0]?.pages).toEqual([]);
  });

  it('stores a lesson with any non-empty script', () => {
    const base = { title: 'T', studyDoc: 'notes' };
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(2000) }).success).toBe(true);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(20) }).success).toBe(true);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: '   ' }).success).toBe(false);
    expect(storedLessonSchema.safeParse({ ...base, title: '', explanationSummary: words(20) }).success).toBe(false);
  });
});
