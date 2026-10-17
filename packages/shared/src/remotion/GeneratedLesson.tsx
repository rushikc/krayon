import type { FC } from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { GeneratedSegment } from '../scene.js';
import { theme } from '../theme.js';
import { SegmentFrame } from './SegmentStill.js';

export type GeneratedLessonProps = {
  segments: GeneratedSegment[];
};

export const GeneratedLesson: FC<GeneratedLessonProps> = ({ segments }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <Series>
        {segments.map((segment) => (
          <Series.Sequence key={segment.id} durationInFrames={segment.durationInFrames}>
            <SegmentFrame segment={segment} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
