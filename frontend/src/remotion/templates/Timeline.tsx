import { useCurrentFrame } from 'remotion';
import type { TimelineLayout } from '../scene.ts';
import { theme } from '../theme.ts';
import { FittedText } from './FittedText.tsx';
import { CONTENT_WIDTH, MARGIN_X } from './metrics.ts';
import { drawOffset, enterStyle, resolvedAppearAt } from './motion.ts';

type TimelineProps = {
  layout: TimelineLayout;
  durationInFrames: number;
};

export function Timeline({ layout, durationInFrames }: TimelineProps) {
  const frame = useCurrentFrame();
  const steps = layout.steps.slice(0, 6);
  if (steps.length < 2) return null;
  const width = CONTENT_WIDTH - 40;
  const stepWidth = width / steps.length;
  const lineY = layout.heading ? 300 : 250;
  const offset = drawOffset(frame, 6);
  return (
    <div style={{ position: 'absolute', left: MARGIN_X, top: 64, width: CONTENT_WIDTH }}>
      {layout.heading ? (
        <div style={enterStyle(frame, 0)}>
          <FittedText text={layout.heading} maxWidth={CONTENT_WIDTH} maxSize={42} minSize={26} fontFamily={theme.serif} />
        </div>
      ) : null}
      <svg viewBox={`0 0 ${CONTENT_WIDTH} 80`} style={{ position: 'absolute', left: 0, top: lineY - 64, width: CONTENT_WIDTH, height: 80 }}>
        <path
          d={`M 20 40 L ${20 + width} 40`}
          stroke={theme.ink}
          strokeWidth={3}
          fill="none"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={offset}
        />
      </svg>
      {steps.map((step, index) => {
        const at = resolvedAppearAt(index, steps.length, durationInFrames, step.appearAt);
        const x = 20 + stepWidth * index + stepWidth / 2;
        const above = index % 2 === 0;
        return (
          <div key={`${step.label}-${index}`}>
            <div
              style={{
                position: 'absolute',
                left: x - 8,
                top: lineY - 8,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: theme.crayon,
                ...enterStyle(frame, at),
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: x - stepWidth / 2 + 8,
                top: above ? lineY - 88 : lineY + 28,
                width: stepWidth - 16,
                ...enterStyle(frame, at),
              }}
            >
              <FittedText text={step.label} maxWidth={stepWidth - 16} maxSize={20} minSize={13} maxLines={2} align="center" />
              {step.detail ? (
                <div style={{ marginTop: 4 }}>
                  <FittedText
                    text={step.detail}
                    maxWidth={stepWidth - 16}
                    maxSize={15}
                    minSize={12}
                    maxLines={2}
                    color={theme.muted}
                    align="center"
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
