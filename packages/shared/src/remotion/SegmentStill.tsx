import type { FC } from 'react';
import { AbsoluteFill } from 'remotion';
import type { GeneratedSegment } from '../scene.js';
import { theme } from '../theme.js';
import { SceneLayoutView } from './templates/SceneLayoutView.js';

export const SegmentFrame: FC<{ segment: GeneratedSegment }> = ({ segment }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <SceneLayoutView layout={segment.scene.layout} durationInFrames={segment.durationInFrames} />
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

export const SegmentStill: FC<{ segment: GeneratedSegment }> = ({ segment }) => {
  return <SegmentFrame segment={segment} />;
};
