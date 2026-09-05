import { create } from "zustand";

import type { CanvasElement } from "@/types/canvas";

interface CanvasState {
  elements: CanvasElement[];
  selectedId: string | null;
  setElements: (elements: CanvasElement[]) => void;
  selectElement: (id: string | null) => void;
  updateElement: (id: string, patch: Partial<CanvasElement>) => void;
  reset: () => void;
}

const initialElements: CanvasElement[] = [
  {
    id: "step-1",
    type: "number",
    x: 45,
    y: 10,
    size: 10,
    value: 1,
    colorTheme: "ink",
  },
  {
    id: "api-gateway",
    type: "box",
    x: 12,
    y: 18,
    width: 76,
    height: 14,
    label: "API Gateway",
    sublabel: "Routes incoming requests",
    colorTheme: "violet",
  },
  {
    id: "step-2",
    type: "number",
    x: 45,
    y: 60,
    size: 10,
    value: 2,
    colorTheme: "ink",
  },
  {
    id: "lambda",
    type: "box",
    x: 12,
    y: 68,
    width: 76,
    height: 14,
    label: "Lambda Function",
    sublabel: "Runs application logic",
    colorTheme: "green",
  },
  {
    id: "gw-to-lambda",
    type: "arrow",
    sourceId: "api-gateway",
    targetId: "lambda",
    variant: "dashed",
  },
];

export const useCanvasStore = create<CanvasState>((set) => ({
  elements: initialElements,
  selectedId: null,

  setElements: (elements) => set({ elements }),

  selectElement: (id) => set({ selectedId: id }),

  updateElement: (id, patch) =>
    set((state) => ({
      elements: state.elements.map((element) => {
        if (element.id !== id) {
          return element;
        }

        return {
          ...element,
          ...patch,
          id: element.id,
          type: element.type,
        } as CanvasElement;
      }),
    })),

  reset: () => set({ elements: initialElements, selectedId: null }),
}));
