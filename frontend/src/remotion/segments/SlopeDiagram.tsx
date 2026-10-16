import type { FC } from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { theme } from '../theme.ts';
import { SegmentChrome } from './SegmentChrome.tsx';

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const start = { x: 300, y: 500 };
const end = { x: 980, y: 220 };

export const SlopeDiagram: FC = () => {
  const frame = useCurrentFrame();
  const draw = interpolate(frame, [8, 70], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const legs = interpolate(frame, [68, 96], [0, 1], clamp);
  const travel = interpolate(frame, [78, 140], [0, 1], {
    ...clamp,
    easing: Easing.inOut(Easing.cubic),
  });
  const formula = interpolate(frame, [120, 145], [0, 1], clamp);

  const dotX = start.x + (end.x - start.x) * travel;
  const dotY = start.y + (end.y - start.y) * travel;

  return (
    <SegmentChrome index="02" kicker="Rise over run">
      <div
        style={{
          position: 'absolute',
          left: 72,
          top: 96,
          fontFamily: theme.serif,
          fontSize: 42,
        }}
      >
        From one point to the next.
      </div>
      <svg
        viewBox="0 0 1280 720"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          pathLength={1}
          stroke={theme.ink}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={start.y}
          pathLength={1}
          stroke={theme.crayon}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={1 - legs}
        />
        <line
          x1={end.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          pathLength={1}
          stroke={theme.crayon}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={1}
          strokeDashoffset={1 - legs}
        />
        <circle cx={dotX} cy={dotY} r={12} fill={theme.crayon} opacity={legs} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: start.x + 220,
          top: start.y + 18,
          color: theme.crayon,
          fontSize: 22,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: legs,
        }}
      >
        Run
      </div>
      <div
        style={{
          position: 'absolute',
          left: end.x + 16,
          top: (start.y + end.y) / 2,
          color: theme.crayon,
          fontSize: 22,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          opacity: legs,
        }}
      >
        Rise
      </div>
      <div
        style={{
          position: 'absolute',
          left: 72,
          bottom: 56,
          fontFamily: theme.serif,
          fontSize: 40,
          opacity: formula,
        }}
      >
        slope = rise / run
      </div>
    </SegmentChrome>
  );
};
