import { describe, expect, it } from 'vitest';
import { FPS, LESSON_WORDS, SEGMENT_FRAMES, WPM, framesFor, scriptWordIssue, wordCount } from '../src/limits.js';
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

  it('clamps segment frames to 6 to 15 seconds', () => {
    expect(SEGMENT_FRAMES).toEqual({ min: 6 * FPS, max: 15 * FPS });
    expect(framesFor(1)).toBe(SEGMENT_FRAMES.min);
    expect(framesFor(500)).toBe(SEGMENT_FRAMES.max);
    expect(framesFor(25)).toBe(Math.ceil(((25 / WPM) * 60 + 0.6) * FPS));
  });

  it('reports a script outside the word range with its path', () => {
    expect(scriptWordIssue(words(500))).toBeNull();
    expect(scriptWordIssue(words(399))).toBeNull();
    expect(scriptWordIssue(words(693))).toBeNull();
    expect(scriptWordIssue(words(398))?.message).toMatch(/Has 398 words; write 420 to 660/);
    expect(scriptWordIssue(words(694))?.message).toMatch(/Has 694 words; shorten it to 420 to 660/);
    expect(scriptWordIssue(words(100))?.path).toBe('explanationSummary');
    expect(scriptWordIssue(words(100))?.message).toMatch(/Has 100 words; write 420 to 660/);
    expect(scriptWordIssue(words(700), 'lessons.0')?.message).toMatch(/shorten/);
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

  it('keeps durationInFrames inside SEGMENT_FRAMES', () => {
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 10 }).success).toBe(false);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: 999 }).success).toBe(false);
    expect(segmentSchema.safeParse({ ...titleCard, durationInFrames: SEGMENT_FRAMES.max }).success).toBe(true);
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

  it('stores a lesson only within LESSON_WORDS unless the source is short', () => {
    const base = { title: 'T', studyDoc: 'notes' };
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(500) }).success).toBe(true);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(399) }).success).toBe(true);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(693) }).success).toBe(true);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(398) }).success).toBe(false);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(200) }).success).toBe(false);
    expect(storedLessonSchema.safeParse({ ...base, explanationSummary: words(200), shortSource: true }).success).toBe(true);
    const long = storedLessonSchema.safeParse({ ...base, explanationSummary: words(700), shortSource: true });
    expect(long.success).toBe(false);
    if (!long.success) expect(long.error.issues[0]?.path).toEqual(['explanationSummary']);
  });
});
