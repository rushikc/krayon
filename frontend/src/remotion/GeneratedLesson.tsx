import type { FC } from 'react';
import { AbsoluteFill, Series } from 'remotion';
import type { GeneratedSegment } from './scene.ts';
import { SceneRenderer } from './SceneRenderer.tsx';
import { theme } from './theme.ts';

export type GeneratedLessonProps = {
  segments: GeneratedSegment[];
};

const SegmentFrame: FC<{ segment: GeneratedSegment }> = ({ segment }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <SceneRenderer elements={segment.scene.elements} />
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 36,
          fontFamily: theme.sans,
          fontSize: 22,
          lineHeight: 1.35,
          color: theme.muted,
        }}
      >
        {segment.narration}
      </div>
    </AbsoluteFill>
  );
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
