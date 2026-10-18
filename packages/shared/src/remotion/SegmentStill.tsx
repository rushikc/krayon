import type { FC } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { captionAtFrame } from '../captions.js';
import type { GeneratedSegment } from '../scene.js';
import { theme } from '../theme.js';
import { MARGIN_X } from './templates/metrics.js';
import { SceneLayoutView } from './templates/SceneLayoutView.js';

export const SegmentFrame: FC<{ segment: GeneratedSegment }> = ({ segment }) => {
  const frame = useCurrentFrame();
  const caption = captionAtFrame(segment.narration, frame, segment.durationInFrames);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.paper }}>
      <SceneLayoutView layout={segment.scene.layout} durationInFrames={segment.durationInFrames} />
      {caption ? (
        <div
          style={{
            position: 'absolute',
            left: MARGIN_X,
            right: MARGIN_X,
            bottom: 80,
            fontFamily: theme.sans,
            fontSize: 22,
            lineHeight: 1.3,
            color: theme.muted,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const SegmentStill: FC<{ segment: GeneratedSegment }> = ({ segment }) => {
  return <SegmentFrame segment={segment} />;
};
