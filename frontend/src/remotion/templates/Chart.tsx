import { useCurrentFrame } from 'remotion';
import type { ChartLayout } from '../scene.ts';
import { theme } from '../theme.ts';
import { crossing, pathFromPoints, PLOT, pointAlong, sampleCurve, shiftArrow } from './chartGeometry.ts';
import { EdgeArrow } from './EdgeArrow.tsx';
import { FittedText } from './FittedText.tsx';
import { CONTENT_WIDTH, FRAME_HEIGHT, FRAME_WIDTH, MARGIN_X } from './metrics.ts';
import { drawOffset, enterStyle, resolvedAppearAt } from './motion.ts';

type ChartProps = {
  layout: ChartLayout;
  durationInFrames: number;
};

const curveColor = (index: number) => [theme.crayon, theme.ink, theme.muted][index % 3] ?? theme.ink;

export function Chart({ layout, durationInFrames }: ChartProps) {
  const frame = useCurrentFrame();
  const curves = layout.curves.slice(0, 4);
  if (curves.length === 0) return null;
  const byId = new Map(curves.map((curve) => [curve.id, curve]));
  const samples = new Map(
    curves.map((curve) => [curve.id, sampleCurve(curve, Boolean(curve.shift))]),
  );
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {layout.heading ? (
        <div style={{ position: 'absolute', left: MARGIN_X, top: 48, width: CONTENT_WIDTH, ...enterStyle(frame, 0) }}>
          <FittedText text={layout.heading} maxWidth={CONTENT_WIDTH} maxSize={36} minSize={22} fontFamily={theme.serif} />
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: PLOT.x, top: PLOT.y - 36, width: 240, ...enterStyle(frame, 0) }}>
        <FittedText text={layout.yLabel} maxWidth={240} maxSize={20} minSize={14} color={theme.muted} />
      </div>
      <svg
        viewBox={`0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}`}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <line x1={PLOT.x} y1={PLOT.y} x2={PLOT.x} y2={PLOT.y + PLOT.h} stroke={theme.ink} strokeWidth={2.5} />
        <line
          x1={PLOT.x}
          y1={PLOT.y + PLOT.h}
          x2={PLOT.x + PLOT.w}
          y2={PLOT.y + PLOT.h}
          stroke={theme.ink}
          strokeWidth={2.5}
        />
        {curves.map((curve, index) => {
          const solid = samples.get(curve.id) ?? [];
          const ghost = curve.shift ? sampleCurve(curve, false) : [];
          const at = resolvedAppearAt(index, curves.length, durationInFrames, curve.appearAt);
          const offset = drawOffset(frame, at);
          const color = curveColor(index);
          const arrow = shiftArrow(curve);
          return (
            <g key={curve.id}>
              {ghost.length > 1 && (
                <path
                  d={pathFromPoints(ghost)}
                  fill="none"
                  stroke={theme.muted}
                  strokeWidth={2.5}
                  strokeDasharray="8 8"
                  opacity={1 - offset}
                />
              )}
              {solid.length > 1 && (
                <path
                  d={pathFromPoints(solid)}
                  fill="none"
                  stroke={color}
                  strokeWidth={4}
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={offset}
                />
              )}
              {arrow && <EdgeArrow x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} at={at + 8} color={color} />}
            </g>
          );
        })}
        {layout.markers.map((marker, index) => {
          const ids = marker.curveIds ?? [];
          const at = resolvedAppearAt(index, Math.max(1, layout.markers.length), durationInFrames, marker.appearAt);
          if (marker.type === 'intersection') {
            const first = samples.get(ids[0] ?? curves[0]?.id ?? '');
            const second = samples.get(ids[1] ?? curves[1]?.id ?? '');
            if (!first || !second) return null;
            const point = crossing(first, second);
            if (!point) return null;
            const shown = drawOffset(frame, at) < 0.2;
            if (!shown) return null;
            return (
              <g key={`marker-${index}`}>
                <line
                  x1={point.x}
                  y1={point.y}
                  x2={point.x}
                  y2={PLOT.y + PLOT.h}
                  stroke={theme.muted}
                  strokeDasharray="5 6"
                  strokeWidth={2}
                />
                <line
                  x1={PLOT.x}
                  y1={point.y}
                  x2={point.x}
                  y2={point.y}
                  stroke={theme.muted}
                  strokeDasharray="5 6"
                  strokeWidth={2}
                />
                <circle cx={point.x} cy={point.y} r={8} fill={theme.crayon} />
              </g>
            );
          }
          const points = samples.get(ids[0] ?? curves[0]?.id ?? '');
          const point = points ? pointAlong(points, 0.62) : null;
          if (!point || drawOffset(frame, at) > 0.2) return null;
          return <circle key={`marker-${index}`} cx={point.x} cy={point.y} r={7} fill={theme.ink} />;
        })}
      </svg>
      {curves.map((curve, index) => {
        const points = samples.get(curve.id) ?? [];
        const end = points[points.length - 1];
        if (!end) return null;
        const at = resolvedAppearAt(index, curves.length, durationInFrames, curve.appearAt);
        return (
          <div
            key={`${curve.id}-label`}
            style={{
              position: 'absolute',
              left: Math.min(end.x + 8, FRAME_WIDTH - 200),
              top: Math.max(72, end.y - 28 - index * 8),
              ...enterStyle(frame, at),
            }}
          >
            <FittedText text={curve.label} maxWidth={180} maxSize={18} minSize={13} color={curveColor(index)} />
          </div>
        );
      })}
      {layout.markers.map((marker, index) => {
        const ids = marker.curveIds ?? [];
        const firstId = ids[0] ?? curves[0]?.id;
        const secondId = ids[1] ?? curves[1]?.id;
        if (!firstId || !byId.has(firstId)) return null;
        const first = samples.get(firstId);
        if (!first) return null;
        const point =
          marker.type === 'intersection' && secondId
            ? crossing(first, samples.get(secondId) ?? [])
            : pointAlong(first, 0.62);
        if (!point) return null;
        const at = resolvedAppearAt(index, Math.max(1, layout.markers.length), durationInFrames, marker.appearAt);
        return (
          <div
            key={`marker-label-${index}`}
            style={{
              position: 'absolute',
              left: Math.min(point.x + 12, FRAME_WIDTH - 200),
              top: Math.max(72, point.y - 28),
              ...enterStyle(frame, at),
            }}
          >
            <FittedText text={marker.label} maxWidth={180} maxSize={16} minSize={12} color={theme.ink} />
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: PLOT.x,
          top: PLOT.y + PLOT.h + 16,
          width: PLOT.w,
          ...enterStyle(frame, 4),
        }}
      >
        <FittedText text={layout.xLabel} maxWidth={PLOT.w} maxSize={20} minSize={14} color={theme.muted} align="center" />
      </div>
    </div>
  );
}
