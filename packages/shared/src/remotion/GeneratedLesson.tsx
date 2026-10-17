import type { FC } from 'react';
import { AbsoluteFill, Html5Audio, Series } from 'remotion';
import type { GeneratedSegment } from '../scene.js';
import { theme } from '../theme.js';
import { SegmentFrame } from './SegmentStill.js';

export type GeneratedLessonProps = {
  segments: GeneratedSegment[];
  /** Blob URLs keyed by segment id. Separate from the model schema. */
  audio?: Record<string, string>;
};

export const GeneratedLesson: FC<GeneratedLessonProps> = ({ segments, audio }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <Series>
        {segments.map((segment) => {
          const src = audio?.[segment.id];
          return (
            <Series.Sequence key={segment.id} durationInFrames={segment.durationInFrames}>
              {src ? <Html5Audio src={src} pauseWhenBuffering /> : null}
              <SegmentFrame segment={segment} />
            </Series.Sequence>
          );
        })}
      </Series>
    </AbsoluteFill>
  );
};
