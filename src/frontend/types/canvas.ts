export type ColorTheme =
  | "ink"
  | "violet"
  | "green"
  | "blue"
  | "sky"
  | "lavender"
  | "mint"
  | "tan"
  | "yellow"
  | "orange"
  | "pink"
  | "salmon";

export type ArrowVariant = "solid" | "dashed";

/**
 * All geometry values are percentages (0-100) of the canvas.
 * The x and y coordinates describe the box's top-left corner.
 */
export interface BoxNode {
  id: string;
  type: "box";
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sublabel?: string;
  /** Label font size in px. Omit to use the default (14). */
  fontSize?: number;
  colorTheme: ColorTheme;
}

export interface ArrowNode {
  id: string;
  type: "arrow";
  sourceId: string;
  targetId: string;
  variant?: ArrowVariant;
}

/**
 * Circular numbered badge. `size` is diameter as a percentage of canvas width,
 * rendered with aspect-ratio 1 so it stays visually circular on the 9:16 reel.
 */
export interface NumberNode {
  id: string;
  type: "number";
  x: number;
  y: number;
  size: number;
  value: number;
  colorTheme: ColorTheme;
}

export type CanvasElement = BoxNode | ArrowNode | NumberNode;

export function isBoxNode(element: CanvasElement): element is BoxNode {
  return element.type === "box";
}

export function isArrowNode(element: CanvasElement): element is ArrowNode {
  return element.type === "arrow";
}

export function isNumberNode(element: CanvasElement): element is NumberNode {
  return element.type === "number";
}
