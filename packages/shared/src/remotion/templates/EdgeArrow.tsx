import { useCurrentFrame } from 'remotion';
import { theme } from '../../theme.js';
import { drawOffset } from './motion.js';

type EdgeArrowProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  at: number;
  color?: string;
  dashed?: boolean;
};

export function EdgeArrow({ x1, y1, x2, y2, at, color = theme.crayon, dashed = false }: EdgeArrowProps) {
  const frame = useCurrentFrame();
  const offset = drawOffset(frame, at);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = 14;
  const tipX = x2;
  const tipY = y2;
  const baseX = tipX - ux * head;
  const baseY = tipY - uy * head;
  const px = -uy * 6;
  const py = ux * 6;
  return (
    <g>
      <path
        d={`M ${x1} ${y1} L ${baseX} ${baseY}`}
        pathLength={1}
        strokeDasharray={dashed ? '0.04 0.03' : 1}
        strokeDashoffset={dashed ? 0 : offset}
        fill="none"
        stroke={color}
        strokeWidth={dashed ? 2.5 : 3.5}
        strokeLinecap="round"
      />
      {offset < 0.15 && (
        <polygon
          points={`${tipX},${tipY} ${baseX + px},${baseY + py} ${baseX - px},${baseY - py}`}
          fill={color}
        />
      )}
    </g>
  );
}
