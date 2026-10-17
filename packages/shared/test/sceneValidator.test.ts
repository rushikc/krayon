import { describe, expect, it } from 'vitest';
import { normalizeScene, validateSegment } from '../src/sceneValidator.js';
import type { GeneratedSegment, SceneLayout } from '../src/scene.js';
import { layoutSegments } from './fixtures/lesson.js';

const titleCard = layoutSegments[0];
const flow = layoutSegments.find((item) => item.scene.layout.type === 'flow');
const chart = layoutSegments.find((item) => item.scene.layout.type === 'chart');
const bullets = layoutSegments.find((item) => item.scene.layout.type === 'bullets');

if (!titleCard || !flow || !chart || !bullets) throw new Error('Layout fixtures are missing.');

const flowLayout = flow.scene.layout;
const chartLayout = chart.scene.layout;
const bulletsLayout = bullets.scene.layout;
if (flowLayout.type !== 'flow' || chartLayout.type !== 'chart' || bulletsLayout.type !== 'bullets') {
  throw new Error('Layout fixtures have the wrong type.');
}

const withLayout = (item: GeneratedSegment, layout: SceneLayout): GeneratedSegment => ({
  ...item,
  scene: { layout },
});

const codes = (item: GeneratedSegment) => validateSegment(item).map((issue) => issue.code);

describe('validateSegment', () => {
  it('reports bad-ref for a dangling edge and an unknown curve id', () => {
    const dangling = withLayout(flow, {
      ...flowLayout,
      edges: [{ from: 'client', to: 'missing' }],
    });
    const unknownCurve = withLayout(chart, {
      ...chartLayout,
      markers: [{ type: 'point', curveIds: ['nope'], label: 'Eq' }],
    });
    expect(codes(dangling)).toContain('bad-ref');
    expect(codes(unknownCurve)).toContain('bad-ref');
  });

  it('reports duplicate-id', () => {
    const duplicate = withLayout(flow, {
      ...flowLayout,
      nodes: [
        { id: 'client', label: 'Client' },
        { id: 'client', label: 'Server' },
      ],
      edges: [],
    });
    expect(codes(duplicate)).toContain('duplicate-id');
  });

  it('clamps appearAt, trims extra items, fits text, and adds a missing equilibrium marker', () => {
    const timed = normalizeScene(
      withLayout(bullets, {
        ...bulletsLayout,
        items: [
          { text: 'First', appearAt: 500 },
          { text: 'Second', appearAt: 10 },
          { text: 'Third', appearAt: -4 },
          { text: 'Fourth', appearAt: 12 },
          { text: 'Fifth', appearAt: 20 },
          { text: 'Sixth', appearAt: 30 },
        ],
      }),
    );
    if (timed.scene.layout.type !== 'bullets') throw new Error('layout');
    expect(timed.scene.layout.items).toHaveLength(5);
    const ceiling = Math.min(timed.durationInFrames - 1, 500);
    expect(timed.scene.layout.items.map((item) => item.appearAt)).toEqual([ceiling, ceiling, ceiling, ceiling, ceiling]);
    const fitted = normalizeScene(withLayout(titleCard, { type: 'titleCard', title: 'A short title that still fits' }));
    if (fitted.scene.layout.type !== 'titleCard') throw new Error('layout');
    expect(fitted.scene.layout.title).toBe('A short title that still fits');
    const huge = normalizeScene(withLayout(titleCard, { type: 'titleCard', title: Array.from({ length: 80 }, () => 'word').join(' ') }));
    if (huge.scene.layout.type !== 'titleCard') throw new Error('layout');
    expect(huge.scene.layout.title.endsWith('…')).toBe(true);
    expect(huge.scene.layout.title.length).toBeLessThan(80 * 5);
    if (chartLayout.type !== 'chart') throw new Error('layout');
    const marked = normalizeScene(
      withLayout(chart, {
        ...chartLayout,
        markers: [],
        curves: [
          { id: 'supply', label: 'Supply', kind: 'upward' },
          { id: 'demand', label: 'Demand', kind: 'downward' },
        ],
      }),
    );
    if (marked.scene.layout.type !== 'chart') throw new Error('layout');
    expect(marked.scene.layout.markers[0]).toMatchObject({ type: 'intersection', curveIds: ['supply', 'demand'], label: 'equilibrium' });
  });

  it('accepts a 20 second segment', () => {
    expect(validateSegment({ ...titleCard, durationInFrames: 20 * 30 })).toEqual([]);
    expect(codes({ ...titleCard, durationInFrames: 0 })).toContain('duration');
    expect(codes({ ...titleCard, durationInFrames: -5 })).toContain('duration');
  });

  it('returns no issues for a clean segment', () => {
    for (const item of layoutSegments) {
      expect(validateSegment(item)).toEqual([]);
    }
  });
});
