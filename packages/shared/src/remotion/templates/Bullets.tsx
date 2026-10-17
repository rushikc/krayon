import { useCurrentFrame } from 'remotion';
import type { BulletsLayout } from '../../scene.js';
import { theme } from '../../theme.js';
import { FittedText } from './FittedText.js';
import { CONTENT_WIDTH, MARGIN_X } from './metrics.js';
import { enterStyle, resolvedAppearAt } from './motion.js';

type BulletsProps = {
  layout: BulletsLayout;
  durationInFrames: number;
};

export function Bullets({ layout, durationInFrames }: BulletsProps) {
  const frame = useCurrentFrame();
  const items = layout.items.slice(0, 5);
  return (
    <div style={{ position: 'absolute', left: MARGIN_X, top: 72, width: CONTENT_WIDTH }}>
      <div style={enterStyle(frame, 0)}>
        <FittedText
          text={layout.heading}
          maxWidth={CONTENT_WIDTH}
          maxSize={48}
          minSize={28}
          fontFamily={theme.serif}
        />
      </div>
      <div style={{ marginTop: 28 }}>
        {items.map((item, index) => {
          const at = resolvedAppearAt(index, items.length, durationInFrames, item.appearAt);
          return (
            <div
              key={`${item.text}-${index}`}
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                marginTop: index === 0 ? 0 : 18,
                ...enterStyle(frame, at),
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  marginTop: 8,
                  borderRadius: 7,
                  backgroundColor: theme.crayon,
                  flexShrink: 0,
                }}
              />
              <FittedText
                text={item.text}
                maxWidth={CONTENT_WIDTH - 40}
                maxSize={30}
                minSize={18}
                maxLines={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
