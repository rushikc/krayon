import type { FC, ReactNode } from 'react';
import { AbsoluteFill } from 'remotion';
import { theme } from '../theme.ts';

type SegmentChromeProps = {
  index: string;
  kicker: string;
  children: ReactNode;
};

export const SegmentChrome: FC<SegmentChromeProps> = ({ index, kicker, children }) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.paper,
        color: theme.ink,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 10,
          backgroundColor: theme.crayon,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 48,
          right: 48,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 16,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: theme.muted,
        }}
      >
        <span>{index}</span>
        <span>{kicker}</span>
      </div>
      {children}
    </AbsoluteFill>
  );
};
