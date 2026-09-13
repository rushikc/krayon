import { MATRIX_COLS, MATRIX_ROWS } from "@/lib/canvas-geometry";
import type {
  ArrowNode,
  BoxNode,
  CanvasElement,
  ColorTheme,
  ElementTime,
  NumberNode,
} from "@/types/canvas";

const COLOR_THEMES = new Set<ColorTheme>([
  "ink",
  "violet",
  "green",
  "blue",
  "sky",
  "lavender",
  "mint",
  "tan",
  "yellow",
  "orange",
  "pink",
  "salmon",
]);

export type ParseCanvasJsonResult =
  | { ok: true; elements: CanvasElement[] }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isTime(value: unknown): value is ElementTime {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isFiniteNumber(value.start) &&
    isFiniteNumber(value.end) &&
    isFiniteNumber(value.track)
  );
}

function isColorTheme(value: unknown): value is ColorTheme {
  return typeof value === "string" && COLOR_THEMES.has(value as ColorTheme);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isMatrixArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isInteger);
}

function isInCol(value: number): boolean {
  return value >= 0 && value < MATRIX_COLS;
}

function isInRow(value: number): boolean {
  return value >= 0 && value < MATRIX_ROWS;
}

function parseBoxMatrix(
  value: unknown,
): readonly [number, number, number, number] | null {
  if (!isMatrixArray(value) || value.length !== 4) {
    return null;
  }
  const [x1, y1, x2, y2] = value;
  if (
    !isInCol(x1) ||
    !isInCol(x2) ||
    !isInRow(y1) ||
    !isInRow(y2) ||
    x2 < x1 ||
    y2 < y1
  ) {
    return null;
  }
  return [x1, y1, x2, y2];
}

function parseNumberMatrix(value: unknown): NumberNode["matrix"] | null {
  if (!isMatrixArray(value)) {
    return null;
  }
  if (value.length === 2) {
    const [x, y] = value;
    if (!isInCol(x) || !isInRow(y)) {
      return null;
    }
    return [x, y];
  }
  return parseBoxMatrix(value);
}

function parseBox(value: Record<string, unknown>): BoxNode | null {
  const matrix = parseBoxMatrix(value.matrix);
  if (
    typeof value.id !== "string" ||
    matrix === null ||
    typeof value.label !== "string" ||
    !isColorTheme(value.colorTheme) ||
    !isTime(value.time)
  ) {
    return null;
  }

  const node: BoxNode = {
    id: value.id,
    type: "box",
    matrix,
    label: value.label,
    colorTheme: value.colorTheme,
    time: value.time,
  };

  if (typeof value.sublabel === "string" && value.sublabel.length > 0) {
    node.sublabel = value.sublabel;
  }
  if (isFiniteNumber(value.fontSize)) {
    node.fontSize = value.fontSize;
  }

  return node;
}

function parseNumberNode(value: Record<string, unknown>): NumberNode | null {
  const matrix = parseNumberMatrix(value.matrix);
  if (
    typeof value.id !== "string" ||
    matrix === null ||
    !isFiniteNumber(value.value) ||
    !isColorTheme(value.colorTheme) ||
    !isTime(value.time)
  ) {
    return null;
  }

  return {
    id: value.id,
    type: "number",
    matrix,
    value: value.value,
    colorTheme: value.colorTheme,
    time: value.time,
  };
}

function parseArrow(value: Record<string, unknown>): ArrowNode | null {
  if (
    typeof value.id !== "string" ||
    typeof value.sourceId !== "string" ||
    typeof value.targetId !== "string" ||
    !isTime(value.time)
  ) {
    return null;
  }

  const node: ArrowNode = {
    id: value.id,
    type: "arrow",
    sourceId: value.sourceId,
    targetId: value.targetId,
    time: value.time,
  };

  if (value.variant === "solid" || value.variant === "dashed") {
    node.variant = value.variant;
  }

  return node;
}

function parseElement(value: unknown, index: number): CanvasElement | string {
  if (!isRecord(value) || typeof value.type !== "string") {
    return `Element ${index} is not a typed object.`;
  }

  if (value.type === "box") {
    const node = parseBox(value);
    return node ?? `Element ${index} is not a valid box.`;
  }
  if (value.type === "number") {
    const node = parseNumberNode(value);
    return node ?? `Element ${index} is not a valid number.`;
  }
  if (value.type === "arrow") {
    const node = parseArrow(value);
    return node ?? `Element ${index} is not a valid arrow.`;
  }

  return `Element ${index} has unknown type "${value.type}".`;
}

export function parseCanvasElementsJson(raw: string): ParseCanvasJsonResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON is not valid." };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: "JSON must be an array of elements." };
  }

  const elements: CanvasElement[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const next = parseElement(parsed[index], index);
    if (typeof next === "string") {
      return { ok: false, error: next };
    }
    elements.push(next);
  }

  return { ok: true, elements };
}
