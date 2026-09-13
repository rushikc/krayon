import {
  Download,
  Layers,
  SlidersHorizontal,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { RENDER_THEMES, type RenderTheme } from "@/lib/render-theme";
import { cn } from "@/lib/utils";

const THEME_SWATCH: Record<RenderTheme, string> = {
  bright: "bg-canvas-violet",
  "scalidraw-light": "bg-canvas-surface",
  "scalidraw-dark": "bg-canvas-ink",
};

export interface WorkspaceToolbarProps {
  showTimeline: boolean;
  showEditor: boolean;
  showReelPreview: boolean;
  onToggleTimeline: () => void;
  onToggleEditor: () => void;
  onToggleReelPreview: () => void;
  renderTheme: RenderTheme;
  onRenderThemeChange: (theme: RenderTheme) => void;
  exporting: boolean;
  exportProgress: number | null;
  onExport: () => void;
}

export function WorkspaceToolbar({
  showTimeline,
  showEditor,
  showReelPreview,
  onToggleTimeline,
  onToggleEditor,
  onToggleReelPreview,
  renderTheme,
  onRenderThemeChange,
  exporting,
  exportProgress,
  onExport,
}: WorkspaceToolbarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-2">
      <SegmentGroup label="Panels">
        <Segment
          label="Timeline"
          icon={Layers}
          active={showTimeline}
          onClick={onToggleTimeline}
        />
        <Segment
          label="Editor"
          icon={SlidersHorizontal}
          active={showEditor}
          onClick={onToggleEditor}
        />
        <Segment
          label="Reel preview"
          icon={Smartphone}
          active={showReelPreview}
          onClick={onToggleReelPreview}
        />
      </SegmentGroup>

      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

      <SegmentGroup label="Canvas skin">
        {RENDER_THEMES.map((theme) => (
          <Segment
            key={theme.id}
            label={theme.label}
            swatch={THEME_SWATCH[theme.id]}
            active={renderTheme === theme.id}
            onClick={() => onRenderThemeChange(theme.id)}
          />
        ))}
      </SegmentGroup>

      <button
        type="button"
        disabled={exporting}
        onClick={onExport}
        className="relative ml-auto flex h-8 shrink-0 items-center overflow-hidden rounded-lg bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/85 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-foreground"
      >
        {exportProgress === null ? null : (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-background/25 transition-[width]"
            style={{ width: `${Math.round(exportProgress * 100)}%` }}
          />
        )}
        <span className="relative flex items-center gap-1.5">
          <Download className="size-3.5" />
          {exportProgress === null
            ? "Export MP4"
            : `Exporting ${Math.round(exportProgress * 100)}%`}
        </span>
      </button>
    </div>
  );
}

function SegmentGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background p-0.5"
    >
      {children}
    </div>
  );
}

function Segment({
  label,
  icon: Icon,
  swatch,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  swatch?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {swatch ? (
        <span
          aria-hidden
          className={cn(
            "size-2.5 rounded-full border border-canvas-ink/25",
            swatch,
          )}
        />
      ) : null}
      {label}
    </button>
  );
}
