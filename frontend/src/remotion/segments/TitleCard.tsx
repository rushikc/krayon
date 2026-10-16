import type { FC } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme.ts';
import { SegmentChrome } from './SegmentChrome.tsx';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

export const TitleCard: FC = () => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 16], [18, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const rule = interpolate(frame, [6, 28], [0, 1], clamp);
  const subtitle = interpolate(frame, [12, 30], [0, 1], clamp);

  return (
    <SegmentChrome index="01" kicker="Lines">
      <div
        style={{
          position: 'absolute',
          left: 88,
          top: 210,
          transform: `translateY(${rise}px)`,
        }}
      >
        <div
          style={{
            fontFamily: theme.serif,
            fontSize: 128,
            lineHeight: 0.9,
            fontWeight: 560,
          }}
        >
          Slope
        </div>
        <div
          style={{
            marginTop: 28,
            height: 8,
            width: 220,
            backgroundColor: theme.crayon,
            transform: `scaleX(${rule})`,
            transformOrigin: 'left center',
          }}
        />
        <div
          style={{
            marginTop: 28,
            maxWidth: 760,
            fontSize: 34,
            lineHeight: 1.35,
            color: theme.muted,
            opacity: subtitle,
          }}
        >
          How steep a line is, measured as rise over run.
        </div>
      </div>
    </SegmentChrome>
  );
};
