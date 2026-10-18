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

  it('shows only the current caption of a long narration', () => {
    const base = layoutSegments[1];
    if (!base) throw new Error('Layout fixtures are missing.');
    const segment: GeneratedSegment = {
      ...base,
      durationInFrames: 300,
      narration:
        'An acyclic graph does not contain any cycles. Directed edges are one-way streets. You never follow a path that starts and ends at the same vertex.',
    };
    frame.n = 0;
    const early = markup(segment);
    expect(early).toContain('cycles');
    expect(early).not.toContain('same vertex');
    frame.n = 299;
    const late = markup(segment);
    expect(late).toContain('same vertex');
    expect(late).not.toContain('cycles');
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
