import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SchemaInspector } from "@/components/canvas/SchemaInspector";
import { useCanvasStore } from "@/stores/canvas-store";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));

describe("SchemaInspector rail", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it("lists seed elements until one is selected", () => {
    render(<SchemaInspector width={640} />);
    expect(screen.getByRole("button", { name: "Config" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("Lambda Function")).toBeInTheDocument();
    expect(screen.getByText(/gw-to-lambda/)).toBeInTheDocument();
  });

  it("opens a form from the list and returns with Back", async () => {
    const user = userEvent.setup();
    render(<SchemaInspector width={640} />);

    await user.click(screen.getByRole("button", { name: /^API Gateway/ }));
    expect(screen.getByDisplayValue("API Gateway")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /back to element list/i }));
    expect(screen.queryByDisplayValue("API Gateway")).not.toBeInTheDocument();
    expect(screen.getByText("Lambda Function")).toBeInTheDocument();
  });

  it("opens the selected canvas element config", () => {
    render(<SchemaInspector width={640} />);
    act(() => {
      useCanvasStore.getState().selectElement("lambda");
    });
    expect(screen.getByDisplayValue("Lambda Function")).toBeInTheDocument();
  });

  it("shows raw scene JSON on the JSON tab", async () => {
    const user = userEvent.setup();
    render(<SchemaInspector width={640} />);
    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByText(/"id": "api-gateway"/)).toBeInTheDocument();
  });
});
