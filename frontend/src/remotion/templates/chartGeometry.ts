import type { ChartCurve } from '../scene.ts';

export const PLOT = { x: 176, y: 156, w: 960, h: 360 };

export type PlotPoint = { x: number; y: number };

const yValue = (kind: ChartCurve['kind'], t: number) => {
  if (kind === 'upward') return 0.16 + 0.7 * t;
  if (kind === 'downward') return 0.84 - 0.7 * t;
  return 0.5;
};

const toScreen = (xNorm: number, yNorm: number): PlotPoint => ({
  x: PLOT.x + xNorm * PLOT.w,
  y: PLOT.y + (1 - yNorm) * PLOT.h,
});

export const sampleCurve = (curve: Pick<ChartCurve, 'kind' | 'shift'>, shifted: boolean) => {
  const points: PlotPoint[] = [];
  for (let step = 0; step <= 48; step += 1) {
    const xNorm = step / 48;
    const t = !shifted
      ? xNorm
      : curve.shift === 'right'
        ? xNorm - 0.18
        : curve.shift === 'left'
          ? xNorm + 0.18
          : xNorm;
    if (t < 0 || t > 1) continue;
    points.push(toScreen(xNorm, yValue(curve.kind, t)));
  }
  return points;
};

export const pathFromPoints = (points: PlotPoint[]) =>
  points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');

const nearest = (points: PlotPoint[], x: number) => {
  let best: PlotPoint | null = null;
  let bestDistance = 28;
  for (const point of points) {
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return best;
};

export const crossing = (first: PlotPoint[], second: PlotPoint[]) => {
  for (let index = 1; index < first.length; index += 1) {
    const start = first[index - 1];
    const end = first[index];
    if (!start || !end) continue;
    const otherStart = nearest(second, start.x);
    const otherEnd = nearest(second, end.x);
    if (!otherStart || !otherEnd) continue;
    const before = start.y - otherStart.y;
    const after = end.y - otherEnd.y;
    if (before === 0) return { x: start.x, y: start.y };
    if (before * after < 0) {
      const mix = before / (before - after);
      return {
        x: start.x + (end.x - start.x) * mix,
        y: start.y + (end.y - start.y) * mix,
      };
    }
  }
  return null;
};

export const pointAlong = (points: PlotPoint[], ratio: number) => {
  if (points.length === 0) return null;
  const index = Math.min(points.length - 1, Math.max(0, Math.round((points.length - 1) * ratio)));
  return points[index] ?? null;
};

export const shiftArrow = (curve: Pick<ChartCurve, 'kind' | 'shift'>) => {
  if (!curve.shift) return null;
  const yNorm = yValue(curve.kind, 0.45);
  const y = PLOT.y + (1 - yNorm) * PLOT.h;
  const from = PLOT.x + 0.45 * PLOT.w;
  const delta = curve.shift === 'right' ? 0.18 : -0.18;
  return { x1: from, y1: y, x2: from + delta * PLOT.w, y2: y };
};
