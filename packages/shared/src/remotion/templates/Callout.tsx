import { useCurrentFrame } from 'remotion';
import type { CalloutLayout } from '../../scene.js';
import { theme } from '../../theme.js';
import { FittedText } from './FittedText.js';
import { CONTENT_WIDTH, MARGIN_X } from './metrics.js';
import { enterStyle } from './motion.js';

type CalloutProps = {
  layout: CalloutLayout;
  durationInFrames: number;
};

const kindLabel: Record<CalloutLayout['kind'], string> = {
  definition: 'Definition',
  example: 'Example',
  keyPoint: 'Key point',
};

export function Callout({ layout }: CalloutProps) {
  const frame = useCurrentFrame();
  const width = CONTENT_WIDTH - 80;
  return (
    <div
      style={{
        position: 'absolute',
        left: MARGIN_X + 40,
        top: 160,
        width,
        border: `3px solid ${theme.ink}`,
        borderLeft: `10px solid ${theme.crayon}`,
        borderRadius: 18,
        padding: '28px 32px',
        boxSizing: 'border-box',
        backgroundColor: theme.paper,
        ...enterStyle(frame, 0),
      }}
    >
      <FittedText text={kindLabel[layout.kind] ?? 'Note'} maxWidth={width - 64} maxSize={16} minSize={13} color={theme.crayon} />
      <div style={{ marginTop: 10 }}>
        <FittedText text={layout.title} maxWidth={width - 64} maxSize={40} minSize={24} fontFamily={theme.serif} />
      </div>
      <div style={{ marginTop: 16, ...enterStyle(frame, 10) }}>
        <FittedText text={layout.body} maxWidth={width - 64} maxSize={26} minSize={16} maxLines={4} />
      </div>
    </div>
  );
}
