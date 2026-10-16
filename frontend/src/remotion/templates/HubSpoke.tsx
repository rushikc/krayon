import { useCurrentFrame } from 'remotion';
import type { HubSpokeLayout } from '../scene.ts';
import { theme } from '../theme.ts';
import { EdgeArrow } from './EdgeArrow.tsx';
import { FittedText } from './FittedText.tsx';
import { FRAME_HEIGHT, FRAME_WIDTH, boxEdgePoint, hubBoxes } from './metrics.ts';
import { enterStyle, resolvedAppearAt } from './motion.ts';

type HubSpokeProps = {
  layout: HubSpokeLayout;
  durationInFrames: number;
};

export function HubSpoke({ layout, durationInFrames }: HubSpokeProps) {
  const frame = useCurrentFrame();
  const spokes = layout.spokes.slice(0, 6);
  if (spokes.length < 3) return null;
  const { center, spokes: boxes } = hubBoxes(spokes.length);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {spokes.map((spoke, index) => {
          const box = boxes[index];
          if (!box) return null;
          const start = boxEdgePoint(center, box.x + box.w / 2, box.y + box.h / 2);
          const end = boxEdgePoint(box, center.x + center.w / 2, center.y + center.h / 2);
          const at = resolvedAppearAt(index, spokes.length, durationInFrames, spoke.appearAt);
          return <EdgeArrow key={spoke.id} x1={start.x} y1={start.y} x2={end.x} y2={end.y} at={at} />;
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: center.x,
          top: center.y,
          width: center.w,
          height: center.h,
          borderRadius: 18,
          backgroundColor: theme.ink,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 12,
          boxSizing: 'border-box',
          ...enterStyle(frame, 0),
        }}
      >
        <FittedText
          text={layout.center.label}
          maxWidth={center.w - 24}
          maxSize={26}
          minSize={14}
          maxLines={2}
          color={theme.paper}
          align="center"
          fontFamily={theme.serif}
        />
      </div>
      {spokes.map((spoke, index) => {
        const box = boxes[index];
        if (!box) return null;
        const at = resolvedAppearAt(index, spokes.length, durationInFrames, spoke.appearAt);
        return (
          <div
            key={spoke.id}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              border: `3px solid ${theme.ink}`,
              borderRadius: 14,
              backgroundColor: theme.paper,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 8px',
              boxSizing: 'border-box',
              ...enterStyle(frame, at),
            }}
          >
            <FittedText text={spoke.label} maxWidth={box.w - 16} maxSize={16} minSize={12} maxLines={2} align="center" />
            {spoke.sublabel ? (
              <FittedText
                text={spoke.sublabel}
                maxWidth={box.w - 16}
                maxSize={13}
                minSize={11}
                color={theme.muted}
                align="center"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
