import type { PointerEvent as ReactPointerEvent } from "react";

import { cn } from "@/lib/utils";

interface PanelResizeHandleProps {
  orientation: "vertical" | "horizontal";
  label: string;
  placement?: "overlay" | "bar";
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function PanelResizeHandle({
  orientation,
  label,
  placement = "overlay",
  onPointerDown,
}: PanelResizeHandleProps) {
  const vertical = orientation === "vertical";
  const bar = placement === "bar";

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      className={cn(
        "group flex items-center justify-center hover:bg-primary/20",
        bar
          ? "relative h-2 w-full shrink-0 cursor-ns-resize border-t border-border"
          : cn(
              "absolute z-20",
              vertical
                ? "inset-y-0 left-0 w-2 cursor-ew-resize"
                : "inset-x-0 top-0 h-2 cursor-ns-resize",
            ),
      )}
      onPointerDown={onPointerDown}
    >
      <span
        aria-hidden
        className={cn(
          "rounded-full bg-border transition-colors group-hover:bg-primary",
          vertical ? "h-4 w-1" : "h-1 w-4",
        )}
      />
    </div>
  );
}
