import type { FC } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme.ts';
import { SegmentChrome } from './SegmentChrome.tsx';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

export const Recap: FC = () => {
  const frame = useCurrentFrame();
  const formulaY = interpolate(frame, [0, 16], [16, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const note = interpolate(frame, [10, 28], [0, 1], clamp);

  return (
    <SegmentChrome index="03" kicker="Keep">
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 230,
          transform: `translateY(${formulaY}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.serif,
            fontSize: 84,
            lineHeight: 1,
          }}
        >
          slope = rise / run
        </div>
        <div
          style={{
            marginTop: 36,
            maxWidth: 820,
            fontSize: 32,
            lineHeight: 1.4,
            color: theme.muted,
            opacity: note,
          }}
        >
          Same run, bigger rise: the line gets steeper, and the slope gets larger.
        </div>
      </div>
    </SegmentChrome>
  );
};
