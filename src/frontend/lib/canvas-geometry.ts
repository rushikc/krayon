import {
  isBoxNode,
  type BoxNode,
  type CanvasElement,
} from "@/types/canvas";

export interface ArrowGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PercentRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PercentCircle {
  x: number;
  y: number;
  size: number;
}

export const MATRIX_COLS = 18;
export const MATRIX_ROWS = 32;
export const CELL_WIDTH = 100 / MATRIX_COLS;
export const CELL_HEIGHT = 100 / MATRIX_ROWS;

const ENDPOINT_GAP = 0.75;
export const MIN_BOX_SIZE = 4;
const MIN_NUMBER_SIZE = 4;
const MAX_NUMBER_SIZE = 40;
const REEL_ASPECT = 9 / 16;

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeMatrix(
  matrix: readonly number[],
): [number, number, number, number] {
  if (matrix.length === 2) {
    const x = matrix[0] ?? 0;
    const y = matrix[1] ?? 0;
    return [x, y, x, y];
  }
  return [
    matrix[0] ?? 0,
    matrix[1] ?? 0,
    matrix[2] ?? matrix[0] ?? 0,
    matrix[3] ?? matrix[1] ?? 0,
  ];
}

export function matrixToPercents(matrix: readonly number[]): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const [x1, y1, x2, y2] = normalizeMatrix(matrix);
  return {
    left: x1 * CELL_WIDTH,
    top: y1 * CELL_HEIGHT,
    width: (x2 - x1 + 1) * CELL_WIDTH,
    height: (y2 - y1 + 1) * CELL_HEIGHT,
  };
}

export function percentsToMatrix(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): [number, number, number, number] {
  const x1 = clamp(Math.round(rect.left / CELL_WIDTH), 0, MATRIX_COLS - 1);
  const y1 = clamp(Math.round(rect.top / CELL_HEIGHT), 0, MATRIX_ROWS - 1);
  const cols = clamp(
    Math.round(rect.width / CELL_WIDTH),
    1,
    MATRIX_COLS - x1,
  );
  const rows = clamp(
    Math.round(rect.height / CELL_HEIGHT),
    1,
    MATRIX_ROWS - y1,
  );
  return [x1, y1, x1 + cols - 1, y1 + rows - 1];
}

/** Keep a box fully inside the 0–100% canvas frame. */
export function clampBoxBounds(box: PercentRect): PercentRect {
  const width = roundPercent(clamp(box.width, MIN_BOX_SIZE, 100));
  const height = roundPercent(clamp(box.height, MIN_BOX_SIZE, 100));
  const x = roundPercent(clamp(box.x, 0, 100 - width));
  const y = roundPercent(clamp(box.y, 0, 100 - height));

  return { x, y, width, height };
}

/** Keep a circular number badge fully inside the 9:16 canvas frame. */
export function clampNumberBounds(node: PercentCircle): PercentCircle {
  const size = roundPercent(clamp(node.size, MIN_NUMBER_SIZE, MAX_NUMBER_SIZE));
  const heightPercent = size * REEL_ASPECT;
  const x = roundPercent(clamp(node.x, 0, 100 - size));
  const y = roundPercent(clamp(node.y, 0, 100 - heightPercent));

  return { x, y, size };
}

export const DEFAULT_BOX_FONT_SIZE = 14;
export const MIN_BOX_FONT_SIZE = 10;
export const MAX_BOX_FONT_SIZE = 48;

export function clampBoxFontSize(value: number): number {
  return Math.round(clamp(value, MIN_BOX_FONT_SIZE, MAX_BOX_FONT_SIZE));
}

export const ZOOM_FACTOR = 1.08;

/** Scale a box around its center, then clamp inside the canvas. */
export function scaleBox(box: PercentRect, factor: number): PercentRect {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const width = box.width * factor;
  const height = box.height * factor;

  return clampBoxBounds({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  });
}

/** Scale a number badge around its center, then clamp inside the canvas. */
export function scaleNumber(node: PercentCircle, factor: number): PercentCircle {
  const centerX = node.x + node.size / 2;
  const centerY = node.y + (node.size * REEL_ASPECT) / 2;
  const size = node.size * factor;

  return clampNumberBounds({
    x: centerX - size / 2,
    y: centerY - (size * REEL_ASPECT) / 2,
    size,
  });
}

function getRectIntersectionScale(
  rect: { width: number; height: number },
  dx: number,
  dy: number,
) {
  const horizontalScale =
    dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx);
  const verticalScale =
    dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy);

  return Math.min(horizontalScale, verticalScale);
}

export function findBoxById(
  elements: CanvasElement[],
  id: string,
): BoxNode | undefined {
  return elements.find(
    (element): element is BoxNode => isBoxNode(element) && element.id === id,
  );
}

export function getArrowGeometry(
  source: BoxNode,
  target: BoxNode,
): ArrowGeometry | null {
  const sourceRect = matrixToPercents(source.matrix);
  const targetRect = matrixToPercents(target.matrix);
  const sourceCenter = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  const targetCenter = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };

  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return null;
  }

  const sourceScale = getRectIntersectionScale(sourceRect, dx, dy);
  const targetScale = getRectIntersectionScale(targetRect, dx, dy);
  const unitX = dx / distance;
  const unitY = dy / distance;

  return {
    x1: sourceCenter.x + dx * sourceScale + unitX * ENDPOINT_GAP,
    y1: sourceCenter.y + dy * sourceScale + unitY * ENDPOINT_GAP,
    x2: targetCenter.x - dx * targetScale - unitX * ENDPOINT_GAP,
    y2: targetCenter.y - dy * targetScale - unitY * ENDPOINT_GAP,
  };
}
