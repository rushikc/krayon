import { useCurrentFrame } from 'remotion';
import type { FlowLayout } from '../../scene.js';
import { theme } from '../../theme.js';
import { EdgeArrow } from './EdgeArrow.js';
import { FittedText } from './FittedText.js';
import { CONTENT_WIDTH, FRAME_HEIGHT, FRAME_WIDTH, MARGIN_X, boxEdgePoint, flowNodeBoxes } from './metrics.js';
import { enterStyle, resolvedAppearAt } from './motion.js';

type FlowProps = {
  layout: FlowLayout;
  durationInFrames: number;
};

export function Flow({ layout, durationInFrames }: FlowProps) {
  const frame = useCurrentFrame();
  const nodes = layout.nodes.slice(0, 6);
  if (nodes.length < 2) return null;
  const boxes = flowNodeBoxes(nodes.length, layout.direction, Boolean(layout.heading));
  const byId = new Map(nodes.map((node, index) => [node.id, { node, index }]));
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {layout.heading ? (
        <div style={{ position: 'absolute', left: MARGIN_X, top: 64, width: CONTENT_WIDTH, ...enterStyle(frame, 0) }}>
          <FittedText
            text={layout.heading}
            maxWidth={CONTENT_WIDTH}
            maxSize={42}
            minSize={26}
            fontFamily={theme.serif}
          />
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {layout.edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          const fromBox = from ? boxes[from.index] : undefined;
          const toBox = to ? boxes[to.index] : undefined;
          if (!from || !to || !fromBox || !toBox) return null;
          const start = boxEdgePoint(fromBox, toBox.x + toBox.w / 2, toBox.y + toBox.h / 2);
          const end = boxEdgePoint(toBox, fromBox.x + fromBox.w / 2, fromBox.y + fromBox.h / 2);
          const at = Math.max(
            resolvedAppearAt(from.index, nodes.length, durationInFrames, from.node.appearAt),
            resolvedAppearAt(to.index, nodes.length, durationInFrames, to.node.appearAt),
          );
          return (
            <EdgeArrow key={`${edge.from}-${edge.to}-${index}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} at={at} />
          );
        })}
      </svg>
      {nodes.map((node, index) => {
        const box = boxes[index];
        if (!box) return null;
        const at = resolvedAppearAt(index, nodes.length, durationInFrames, node.appearAt);
        return (
          <div
            key={node.id}
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              border: `3px solid ${theme.ink}`,
              borderRadius: 16,
              backgroundColor: theme.paper,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0 12px',
              boxSizing: 'border-box',
              ...enterStyle(frame, at),
            }}
          >
            <FittedText text={node.label} maxWidth={box.w - 24} maxSize={24} minSize={14} maxLines={2} align="center" />
            {node.sublabel ? (
              <div style={{ marginTop: 4 }}>
                <FittedText
                  text={node.sublabel}
                  maxWidth={box.w - 24}
                  maxSize={16}
                  minSize={12}
                  maxLines={1}
                  color={theme.muted}
                  align="center"
                />
              </div>
            ) : null}
          </div>
        );
      })}
      {layout.edges.map((edge, index) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        const fromBox = from ? boxes[from.index] : undefined;
        const toBox = to ? boxes[to.index] : undefined;
        if (!edge.label || !fromBox || !toBox) return null;
        const midX = (fromBox.x + fromBox.w / 2 + toBox.x + toBox.w / 2) / 2;
        const midY = (fromBox.y + fromBox.h / 2 + toBox.y + toBox.h / 2) / 2;
        return (
          <div key={`label-${edge.from}-${edge.to}-${index}`} style={{ position: 'absolute', left: midX - 60, top: midY - 28, width: 120 }}>
            <FittedText text={edge.label} maxWidth={120} maxSize={14} minSize={11} color={theme.muted} align="center" />
          </div>
        );
      })}
    </div>
  );
}
