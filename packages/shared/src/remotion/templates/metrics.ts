export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 720;
export const MARGIN_X = 72;
export const CONTENT_TOP = 64;
export const CONTENT_BOTTOM = 128;
export const CONTENT_WIDTH = FRAME_WIDTH - MARGIN_X * 2;
export const CONTENT_HEIGHT = FRAME_HEIGHT - CONTENT_TOP - CONTENT_BOTTOM;

export const charsAt = (width: number, fontSize: number, lines = 1) =>
  Math.max(4, Math.floor((width * lines) / (fontSize * 0.56)));

export const flowBox = (count: number, direction: 'horizontal' | 'vertical') => {
  const safeCount = Math.max(1, count);
  if (direction === 'vertical') {
    const gap = 28;
    const h = Math.min(100, (CONTENT_HEIGHT - 72 - gap * (safeCount - 1)) / safeCount);
    return { w: 480, h, gap };
  }
  const gap = 28;
  const w = Math.min(250, (CONTENT_WIDTH - gap * (safeCount - 1)) / safeCount);
  return { w, h: 118, gap };
};

export const flowLabelCapacity = (count: number, direction: 'horizontal' | 'vertical') =>
  charsAt(flowBox(count, direction).w - 28, 16, 2);

export const bulletCapacity = () => charsAt(CONTENT_WIDTH - 56, 20, 2);

export const titleCapacity = () => charsAt(CONTENT_WIDTH, 40, 2);

export const headingCapacity = () => charsAt(CONTENT_WIDTH, 28, 1);

export const calloutBodyCapacity = () => charsAt(CONTENT_WIDTH - 80, 20, 4);

export const comparePointCapacity = () => charsAt((CONTENT_WIDTH - 36) / 2 - 40, 18, 2);

export const hubLabelCapacity = () => charsAt(150, 15, 2);

export const chartLabelCapacity = () => charsAt(180, 16, 1);

export const timelineLabelCapacity = (count: number) =>
  charsAt(Math.max(80, CONTENT_WIDTH / Math.max(1, count) - 16), 16, 2);

export type Box = { x: number; y: number; w: number; h: number };

export const boxEdgePoint = (box: Box, towardX: number, towardY: number) => {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const scaleX = dx !== 0 ? box.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const scaleY = dy !== 0 ? box.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
};

export const flowNodeBoxes = (
  count: number,
  direction: 'horizontal' | 'vertical',
  hasHeading: boolean,
): Box[] => {
  const { w, h, gap } = flowBox(count, direction);
  const boxes: Box[] = [];
  if (direction === 'vertical') {
    const startX = (FRAME_WIDTH - w) / 2;
    const startY = hasHeading ? 150 : 96;
    for (let index = 0; index < count; index += 1) {
      boxes.push({ x: startX, y: startY + index * (h + gap), w, h });
    }
    return boxes;
  }
  const total = count * w + Math.max(0, count - 1) * gap;
  const startX = MARGIN_X + (CONTENT_WIDTH - total) / 2;
  const y = hasHeading ? 250 : 270;
  for (let index = 0; index < count; index += 1) {
    boxes.push({ x: startX + index * (w + gap), y, w, h });
  }
  return boxes;
};

export const hubBoxes = (spokeCount: number) => {
  const cx = FRAME_WIDTH / 2;
  const cy = 336;
  const center: Box = { x: cx - 100, y: cy - 42, w: 200, h: 84 };
  const radius = 220;
  const spokes: Box[] = [];
  for (let index = 0; index < spokeCount; index += 1) {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / spokeCount;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    spokes.push({ x: x - 84, y: y - 34, w: 168, h: 68 });
  }
  return { center, spokes };
};
