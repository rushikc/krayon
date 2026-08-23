import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauri } from "@/lib/media/asset-url";
import { cn } from "@/lib/utils";

function TrafficLight({
  color,
  hover,
  onClick,
  title,
}: {
  color: string;
  hover: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      data-tauri-drag-region={false}
      className={cn(
        "size-3 rounded-full border border-black/10 transition-colors",
        color,
        hover,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    />
  );
}

export function WindowChrome() {
  if (!isTauri()) {
    return (
      <div
        data-tauri-drag-region
        className="h-11 shrink-0 border-b border-border bg-background/80 backdrop-blur-xl"
      />
    );
  }

  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center border-b border-border bg-background/80 backdrop-blur-xl"
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      <div
        className="flex items-center gap-2 pl-3"
        data-tauri-drag-region={false}
      >
        <TrafficLight
          color="bg-[#ff5f57]"
          hover="hover:bg-[#ff5f57]/80"
          title="Close"
          onClick={() => void appWindow.close()}
        />
        <TrafficLight
          color="bg-[#febc2e]"
          hover="hover:bg-[#febc2e]/80"
          title="Minimize"
          onClick={() => void appWindow.minimize()}
        />
        <TrafficLight
          color="bg-[#28c840]"
          hover="hover:bg-[#28c840]/80"
          title="Maximize"
          onClick={() => void appWindow.toggleMaximize()}
        />
      </div>
    </div>
  );
}
