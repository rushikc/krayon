import { useCurrentFrame } from 'remotion';
import type { CompareLayout, CompareSide } from '../../scene.js';
import { theme } from '../../theme.js';
import { FittedText } from './FittedText.js';
import { CONTENT_WIDTH, MARGIN_X } from './metrics.js';
import { enterStyle, resolvedAppearAt } from './motion.js';

type CompareProps = {
  layout: CompareLayout;
  durationInFrames: number;
};

const columnWidth = (CONTENT_WIDTH - 32) / 2;

function Column({
  side,
  durationInFrames,
  offset,
}: {
  side: CompareSide;
  durationInFrames: number;
  offset: number;
}) {
  const frame = useCurrentFrame();
  const points = side.points.slice(0, 5);
  return (
    <div
      style={{
        width: columnWidth,
        border: `3px solid ${theme.ink}`,
        borderRadius: 20,
        padding: '20px 18px',
        boxSizing: 'border-box',
        backgroundColor: theme.paper,
      }}
    >
      <FittedText
        text={side.title}
        maxWidth={columnWidth - 36}
        maxSize={32}
        minSize={20}
        fontFamily={theme.serif}
      />
      <div style={{ marginTop: 16 }}>
        {points.map((point, index) => (
          <div
            key={`${point.text}-${index}`}
            style={{
              marginTop: index === 0 ? 0 : 12,
              ...enterStyle(frame, resolvedAppearAt(index, points.length, durationInFrames, point.appearAt) + offset),
            }}
          >
            <FittedText text={point.text} maxWidth={columnWidth - 36} maxSize={22} minSize={15} maxLines={2} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Compare({ layout, durationInFrames }: CompareProps) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: MARGIN_X, top: 64, width: CONTENT_WIDTH }}>
      {layout.heading ? (
        <div style={{ marginBottom: 20, ...enterStyle(frame, 0) }}>
          <FittedText
            text={layout.heading}
            maxWidth={CONTENT_WIDTH}
            maxSize={42}
            minSize={26}
            fontFamily={theme.serif}
          />
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
        <Column side={layout.left} durationInFrames={durationInFrames} offset={0} />
        <Column side={layout.right} durationInFrames={durationInFrames} offset={6} />
      </div>
    </div>
  );
}
