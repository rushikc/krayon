import { describe, expect, it } from 'vitest';
import { lessonSchema, roadmapSchema, segmentSchema } from '../src/schemas.js';
import type { GeneratedSegment } from '../src/scene.js';
import { layoutSegments, lesson, roadmap } from './fixtures/lesson.js';

const titleCard = layoutSegments[0];
const bullets = layoutSegments.find((item) => item.scene.layout.type === 'bullets');

if (!titleCard || !bullets) throw new Error('Layout fixtures are missing.');
const bulletsLayout = bullets.scene.layout;
if (bulletsLayout.type !== 'bullets') throw new Error('Layout fixtures are missing.');

const withLayout = (item: GeneratedSegment, layout: GeneratedSegment['scene']['layout']): GeneratedSegment => ({
  ...item,
  scene: { layout },
});

describe('schemas', () => {
  it('parses the lesson, roadmap, and one segment per layout', () => {
    expect(lessonSchema.safeParse(lesson).success).toBe(true);
    expect(roadmapSchema.safeParse(roadmap).success).toBe(true);
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

  it('leaves durationInFrames unclamped', () => {
    const low = segmentSchema.parse({ ...titleCard, durationInFrames: 10 });
    const high = segmentSchema.parse({ ...titleCard, durationInFrames: 999 });
    expect(low.durationInFrames).toBe(10);
    expect(high.durationInFrames).toBe(999);
  });
});
