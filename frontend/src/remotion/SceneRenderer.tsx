import type { FC } from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import type { GraphPoint, SceneElement } from './scene.ts';
import { theme } from './theme.ts';

type SceneRendererProps = {
  elements: SceneElement[];
};

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const presence = (frame: number, start: number, end: number) => {
  if (frame < start || frame > end) return 0;
  const span = Math.min(8, Math.max(1, Math.floor((end - start) / 3)));
  const fadeIn = interpolate(frame, [start, start + span], [0, 1], clamp);
  const fadeOut = interpolate(frame, [end - span, end], [1, 0], clamp);
  return Math.min(fadeIn, fadeOut);
};

const slide = (frame: number, start: number, end: number) => {
  const span = Math.min(8, Math.max(1, Math.floor((end - start) / 3)));
  return interpolate(frame, [start, start + span], [14, 0], clamp);
};

const graphPath = (points: GraphPoint[]) => {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = 520;
  const height = 180;
  return points
    .map((point, index) => {
      const x = ((point.x - minX) / (maxX - minX || 1)) * width;
      const y = height - ((point.y - minY) / (maxY - minY || 1)) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
};

const ElementView: FC<{ element: SceneElement; index: number }> = ({ element, index }) => {
  const frame = useCurrentFrame();
  const opacity = presence(frame, element.start, element.end);
  if (opacity <= 0) return null;

  const shared = {
    position: 'absolute' as const,
    left: 88,
    right: 88,
    top: 72 + index * 78,
    opacity,
    transform: `translateY(${slide(frame, element.start, element.end)}px)`,
    fontFamily: theme.sans,
    color: theme.ink,
  };

  switch (element.type) {
    case 'title':
      return (
        <div style={{ ...shared, fontFamily: theme.serif, fontSize: 54, lineHeight: 1.1 }}>
          {element.text}
        </div>
      );
    case 'text':
      return <div style={{ ...shared, fontSize: 28, lineHeight: 1.35 }}>{element.text}</div>;
    case 'box':
      return (
        <div
          style={{
            ...shared,
            border: `3px solid ${theme.ink}`,
            borderRadius: 16,
            padding: '16px 20px',
            fontSize: 26,
          }}
        >
          {element.text}
        </div>
      );
    case 'arrow':
      return (
        <svg viewBox="0 0 640 48" style={{ ...shared, height: 48 }}>
          <line x1="8" y1="24" x2="600" y2="24" stroke={theme.crayon} strokeWidth="4" />
          <polygon points="600,12 632,24 600,36" fill={theme.crayon} />
        </svg>
      );
    case 'badge':
      return (
        <div style={{ ...shared, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: theme.crayon,
              color: theme.paper,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 600,
            }}
          >
            {element.value ?? element.text}
          </div>
          {element.text && element.value ? <div style={{ fontSize: 26 }}>{element.text}</div> : null}
        </div>
      );
    case 'equation':
      return (
        <div style={{ ...shared, fontFamily: theme.serif, fontSize: 40 }}>{element.latex}</div>
      );
    case 'lineGraph': {
      const points = element.points ?? [];
      if (points.length < 2) return null;
      return (
        <svg viewBox="0 0 560 220" style={{ ...shared, height: 200 }}>
          <path d={graphPath(points)} fill="none" stroke={theme.crayon} strokeWidth="4" />
        </svg>
      );
    }
    case 'image':
      return (
        <div
          style={{
            ...shared,
            border: `2px dashed ${theme.muted}`,
            borderRadius: 16,
            padding: '18px 20px',
            color: theme.muted,
            fontSize: 22,
          }}
        >
          {element.ref ?? 'Figure'}
        </div>
      );
    default:
      return null;
  }
};

export const SceneRenderer: FC<SceneRendererProps> = ({ elements }) => {
  return (
    <>
      {elements.map((element, index) => (
        <ElementView key={`${element.type}-${index}`} element={element} index={index} />
      ))}
    </>
  );
};
