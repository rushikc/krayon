import type { FC } from 'react';
import { AbsoluteFill, Series } from 'remotion';
import { sampleSegments } from './catalog.ts';
import { theme } from './theme.ts';

export const SampleLesson: FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <Series>
        {sampleSegments.map((segment) => (
          <Series.Sequence key={segment.id} durationInFrames={segment.durationInFrames}>
            <segment.component />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
