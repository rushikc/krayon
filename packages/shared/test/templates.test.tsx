import type { CSSProperties, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SegmentStill } from '../src/remotion/SegmentStill.js';
import type { GeneratedSegment, SceneLayout } from '../src/scene.js';
import { labelFor, layoutSegments } from './fixtures/lesson.js';

const frame = vi.hoisted(() => ({ n: 0 }));

vi.mock('remotion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('remotion')>();
  return {
    ...actual,
    useCurrentFrame: () => frame.n,
    AbsoluteFill: ({ children, style }: { children?: ReactNode; style?: CSSProperties }) => (
      <div style={style}>{children}</div>
    ),
  };
});

const framesFor = (segment: GeneratedSegment) => [
  0,
  Math.floor(segment.durationInFrames / 2),
  segment.durationInFrames - 1,
];

const markup = (segment: GeneratedSegment) => renderToStaticMarkup(<SegmentStill segment={segment} />);

describe('SegmentStill', () => {
  it.each(layoutSegments)('renders $scene.layout.type at the first, middle, and last frame', (segment) => {
    const label = labelFor(segment);
    for (const n of framesFor(segment)) {
      frame.n = n;
      expect(markup(segment)).toContain(label);
    }
  });

  it('renders the fallback card for an invalid layout', () => {
    const base = layoutSegments[0];
    if (!base) throw new Error('Layout fixtures are missing.');
    const invalid: GeneratedSegment = {
      ...base,
      scene: { layout: { type: 'poster' } as unknown as SceneLayout },
    };
    for (const n of framesFor(invalid)) {
      frame.n = n;
      expect(markup(invalid)).toContain('couldn&#x27;t draw this part');
    }
  });
});
