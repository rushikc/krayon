import {
  isBoxNode,
  type BoxNode,
  type CanvasElement,
  type NumberNode,
} from "@/types/canvas";

export interface ArrowGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const ENDPOINT_GAP = 0.75;
const MIN_BOX_SIZE = 4;
const MIN_NUMBER_SIZE = 4;
const MAX_NUMBER_SIZE = 40;
const REEL_ASPECT = 9 / 16;

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Keep a box fully inside the 0–100% canvas frame. */
export function clampBoxBounds(
  box: Pick<BoxNode, "x" | "y" | "width" | "height">,
): Pick<BoxNode, "x" | "y" | "width" | "height"> {
  const width = roundPercent(clamp(box.width, MIN_BOX_SIZE, 100));
  const height = roundPercent(clamp(box.height, MIN_BOX_SIZE, 100));
  const x = roundPercent(clamp(box.x, 0, 100 - width));
  const y = roundPercent(clamp(box.y, 0, 100 - height));

  return { x, y, width, height };
}

/** Keep a circular number badge fully inside the 9:16 canvas frame. */
export function clampNumberBounds(
  node: Pick<NumberNode, "x" | "y" | "size">,
): Pick<NumberNode, "x" | "y" | "size"> {
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
export function scaleBox(
  box: Pick<BoxNode, "x" | "y" | "width" | "height">,
  factor: number,
): Pick<BoxNode, "x" | "y" | "width" | "height"> {
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
export function scaleNumber(
  node: Pick<NumberNode, "x" | "y" | "size">,
  factor: number,
): Pick<NumberNode, "x" | "y" | "size"> {
  const centerX = node.x + node.size / 2;
  const centerY = node.y + (node.size * REEL_ASPECT) / 2;
  const size = node.size * factor;

  return clampNumberBounds({
    x: centerX - size / 2,
    y: centerY - (size * REEL_ASPECT) / 2,
    size,
  });
}

function getRectIntersectionScale(box: BoxNode, dx: number, dy: number) {
  const horizontalScale =
    dx === 0 ? Number.POSITIVE_INFINITY : box.width / 2 / Math.abs(dx);
  const verticalScale =
    dy === 0 ? Number.POSITIVE_INFINITY : box.height / 2 / Math.abs(dy);

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
  const sourceCenter = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  };
  const targetCenter = {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };

  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const distance = Math.hypot(dx, dy);

  if (distance === 0) {
    return null;
  }

  const sourceScale = getRectIntersectionScale(source, dx, dy);
  const targetScale = getRectIntersectionScale(target, dx, dy);
  const unitX = dx / distance;
  const unitY = dy / distance;

  return {
    x1: sourceCenter.x + dx * sourceScale + unitX * ENDPOINT_GAP,
    y1: sourceCenter.y + dy * sourceScale + unitY * ENDPOINT_GAP,
    x2: targetCenter.x - dx * targetScale - unitX * ENDPOINT_GAP,
    y2: targetCenter.y - dy * targetScale - unitY * ENDPOINT_GAP,
  };
}
