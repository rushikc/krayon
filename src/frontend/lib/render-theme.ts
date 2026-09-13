import type { ColorTheme } from "@/types/canvas";

export type RenderTheme =
  | "bright"
  | "dark"
  | "calidraw-light"
  | "calidraw-dark";

export const RENDER_THEMES: { id: RenderTheme; label: string }[] = [
  { id: "bright", label: "Bright" },
  { id: "dark", label: "Dark" },
  { id: "calidraw-light", label: "Calidraw light" },
  { id: "calidraw-dark", label: "Calidraw dark" },
];

export function isCalidrawTheme(theme: RenderTheme): boolean {
  return theme === "calidraw-light" || theme === "calidraw-dark";
}

export function isFilledTheme(theme: RenderTheme): boolean {
  return theme === "bright" || theme === "dark";
}

const LIGHT_STROKES: Record<ColorTheme, string> = {
  ink: "#1a1a1a",
  violet: "#6b4cbe",
  green: "#2a8f5c",
  blue: "#2b6cb0",
  sky: "#3d7eb8",
  lavender: "#7a6bb0",
  mint: "#2f8f68",
  tan: "#b07a2e",
  yellow: "#c49a14",
  orange: "#d07a28",
  pink: "#c44f7a",
  salmon: "#c24f4f",
};

const DARK_STROKES: Record<ColorTheme, string> = {
  ink: "#f0f0f0",
  violet: "#c4a6f5",
  green: "#6ee0a8",
  blue: "#7eb8f5",
  sky: "#9ec4f0",
  lavender: "#d4c8f5",
  mint: "#8ee0b8",
  tan: "#e8c888",
  yellow: "#f0d85a",
  orange: "#f0b878",
  pink: "#f0b0c8",
  salmon: "#f0a8a8",
};

export function calidrawStroke(
  colorTheme: ColorTheme,
  renderTheme: RenderTheme,
): string {
  if (renderTheme === "calidraw-dark") {
    return DARK_STROKES[colorTheme];
  }
  return LIGHT_STROKES[colorTheme];
}
