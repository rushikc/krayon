import type { ReactNode } from "react";

interface TitleBarProps {
  title?: string;
  action?: ReactNode;
}

export function TitleBar({
  title = "Krayon",
  action,
}: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4"
    >
      <div data-tauri-drag-region className="flex flex-1 items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
      </div>
      {action}
    </header>
  );
}
