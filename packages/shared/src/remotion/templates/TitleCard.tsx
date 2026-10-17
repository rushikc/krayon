import { useCurrentFrame } from 'remotion';
import type { TitleCardLayout } from '../../scene.js';
import { theme } from '../../theme.js';
import { FittedText } from './FittedText.js';
import { CONTENT_WIDTH, MARGIN_X } from './metrics.js';
import { enterStyle } from './motion.js';

type TitleCardProps = {
  layout: TitleCardLayout;
  durationInFrames: number;
};

export function TitleCard({ layout }: TitleCardProps) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: MARGIN_X,
        top: 200,
        width: CONTENT_WIDTH,
        ...enterStyle(frame, 0),
      }}
    >
      <FittedText
        text={layout.title}
        maxWidth={CONTENT_WIDTH}
        maxSize={72}
        minSize={36}
        maxLines={2}
        fontFamily={theme.serif}
      />
      {layout.subtitle ? (
        <div style={{ marginTop: 20, ...enterStyle(frame, 12) }}>
          <FittedText
            text={layout.subtitle}
            maxWidth={CONTENT_WIDTH * 0.8}
            maxSize={32}
            minSize={20}
            maxLines={2}
            color={theme.muted}
          />
        </div>
      ) : null}
    </div>
  );
}
