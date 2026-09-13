import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomePage } from "@/pages/HomePage";
import { ReelAnimationsPage } from "@/pages/ReelAnimationsPage";
import { useCanvasStore } from "@/stores/canvas-store";

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ScrollBar: () => null,
}));

describe("home navigation", () => {
  it("links to audio analysis and reel animations", () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /audio analysis/i })).toHaveAttribute(
      "href",
      "/audio",
    );
    expect(screen.getByRole("link", { name: /reel animations/i })).toHaveAttribute(
      "href",
      "/reel-animations",
    );
  });
});

describe("reel animations layout", () => {
  beforeEach(() => {
    useCanvasStore.getState().reset();
  });

  it("shows the timeline, editor, and seed clips", () => {
    render(
      <MemoryRouter>
        <ReelAnimationsPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /timeline/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /editor/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /reel preview/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("reel-preview-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize timeline/i })).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: /resize editor/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("00:00 / 00:30")).toBeInTheDocument();
    expect(screen.getAllByText("API Gateway").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("button", { name: "Add track" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete track 1" })).toBeInTheDocument();
    expect(screen.queryByText("Track 7")).not.toBeInTheDocument();
    expect(screen.queryByText("Track 1")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bright" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Scalidraw light" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Scalidraw dark" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(document.querySelector("[data-render-theme]")).toHaveAttribute(
      "data-render-theme",
      "bright",
    );
    const canvas = document.querySelector("[data-render-theme]");
    expect(canvas).toHaveClass("h-full", "aspect-[9/16]");
    const exportButton = screen.getByRole("button", { name: "Export MP4" });
    expect(exportButton).toBeInTheDocument();
    expect(exportButton).not.toHaveAttribute("aria-pressed");
    expect(
      screen.getByRole("group", { name: "Panels" }),
    ).toContainElement(screen.getByRole("button", { name: "Reel preview" }));
    expect(screen.getByRole("group", { name: "Canvas skin" })).toContainElement(
      screen.getByRole("button", { name: "Bright" }),
    );
  });

  it("hides timeline and editor when toggled off", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReelAnimationsPage />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /timeline/i }));
    expect(screen.queryByRole("button", { name: "Add track" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize timeline/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^editor$/i }));
    expect(screen.queryByRole("button", { name: "Config" })).not.toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: /resize editor/i })).not.toBeInTheDocument();
  });

  it("shows the reel preview overlay when toggled on", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReelAnimationsPage />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("button", { name: /reel preview/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("reel-preview-overlay")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("reel-preview-overlay")).toBeInTheDocument();
  });

  it("plays with Space and cuts with S only when the timeline is focused", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReelAnimationsPage />
      </MemoryRouter>,
    );

    await user.keyboard(" ");
    expect(useCanvasStore.getState().isPlaying).toBe(true);

    useCanvasStore.getState().pause();
    useCanvasStore.getState().setCurrentTime(20);
    const before = useCanvasStore.getState().elements.length;
    await user.keyboard("s");
    expect(useCanvasStore.getState().elements.length).toBe(before);

    const timeline = document.querySelector("[data-timeline-root]");
    expect(timeline).toBeInstanceOf(HTMLElement);
    (timeline as HTMLElement).focus();
    await user.keyboard("s");
    expect(useCanvasStore.getState().elements.length).toBeGreaterThan(before);
  });

  it("switches canvas skins without changing element JSON", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ReelAnimationsPage />
      </MemoryRouter>,
    );

    const json = JSON.stringify(useCanvasStore.getState().elements);
    await user.click(screen.getByRole("button", { name: "Scalidraw light" }));
    expect(screen.getByRole("button", { name: "Scalidraw light" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bright" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(document.querySelector("[data-render-theme]")).toHaveAttribute(
      "data-render-theme",
      "scalidraw-light",
    );
    expect(JSON.stringify(useCanvasStore.getState().elements)).toBe(json);

    await user.click(screen.getByRole("button", { name: "Scalidraw dark" }));
    expect(document.querySelector("[data-render-theme]")).toHaveAttribute(
      "data-render-theme",
      "scalidraw-dark",
    );
    expect(JSON.stringify(useCanvasStore.getState().elements)).toBe(json);
  });
});
