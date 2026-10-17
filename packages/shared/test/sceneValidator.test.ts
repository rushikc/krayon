import { describe, expect, it } from 'vitest';
import { validateSegment } from '../src/sceneValidator.js';
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

  it('reports too-long', () => {
    const longTitle = withLayout(titleCard, { type: 'titleCard', title: 'A'.repeat(61) });
    const issues = validateSegment(longTitle);
    expect(issues.map((issue) => issue.code)).toEqual(['too-long']);
  });

  it('reports overflow', () => {
    const wideEdge = withLayout(flow, {
      ...flowLayout,
      edges: [{ from: 'client', to: 'server', label: 'x'.repeat(17) }],
    });
    const issues = validateSegment(wideEdge);
    expect(issues.map((issue) => issue.code)).toEqual(['overflow']);
  });

  it('reports timing when appearAt is out of range or not ascending', () => {
    const outOfRange = withLayout(bullets, {
      ...bulletsLayout,
      items: [{ text: 'Price rises', appearAt: 500 }],
    });
    const descending = withLayout(bullets, {
      ...bulletsLayout,
      items: [
        { text: 'First', appearAt: 40 },
        { text: 'Second', appearAt: 10 },
      ],
    });
    expect(codes(outOfRange)).toContain('timing');
    expect(codes(descending)).toContain('timing');
  });

  it('reports duration bounds', () => {
    expect(codes({ ...titleCard, durationInFrames: 89 })).toContain('duration');
    expect(codes({ ...titleCard, durationInFrames: 451 })).toContain('duration');
  });

  it('returns no issues for a clean segment', () => {
    for (const item of layoutSegments) {
      expect(validateSegment(item)).toEqual([]);
    }
  });
});
