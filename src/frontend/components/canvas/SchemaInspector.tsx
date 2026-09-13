import { useEffect, useState, type ChangeEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Braces,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { clampElementTime } from "@/components/editor/timeline/lib/timeMath";
import { FieldLabel } from "@/components/ui/field-label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { clampBoxBounds, clampNumberBounds, clampBoxFontSize, DEFAULT_BOX_FONT_SIZE, MAX_BOX_FONT_SIZE, MIN_BOX_FONT_SIZE } from "@/lib/canvas-geometry";
import { isElementActiveAt } from "@/lib/element-visibility";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  getElementLabel,
  isArrowNode,
  isBoxNode,
  isNumberNode,
  type ArrowNode,
  type ArrowVariant,
  type BoxNode,
  type CanvasElement,
  type ColorTheme,
  type ElementTime,
  type NumberNode,
} from "@/types/canvas";

const COLOR_THEMES: ColorTheme[] = [
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
];

/** Swatch fills for the element list, mirroring the bright canvas palette. */
const swatchStyles: Record<ColorTheme, string> = {
  ink: "bg-canvas-ink",
  violet: "bg-canvas-violet",
  green: "bg-canvas-green",
  blue: "bg-canvas-blue",
  sky: "bg-canvas-sky",
  lavender: "bg-canvas-lavender",
  mint: "bg-canvas-mint",
  tan: "bg-canvas-tan",
  yellow: "bg-canvas-yellow",
  orange: "bg-canvas-orange",
  pink: "bg-canvas-pink",
  salmon: "bg-canvas-salmon",
};

const inputClassName =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";

function parseNumber(raw: string) {
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

function TimeFields({ element }: { element: CanvasElement }) {
  const duration = useCanvasStore((state) => state.duration);
  const updateElement = useCanvasStore((state) => state.updateElement);

  function updateTime(field: "start" | "end", event: ChangeEvent<HTMLInputElement>) {
    const next = parseNumber(event.target.value);
    if (next === null) {
      return;
    }

    const clamped = clampElementTime(
      field === "start" ? next : element.time.start,
      field === "end" ? next : element.time.end,
      duration,
    );

    updateElement(element.id, {
      time: {
        ...element.time,
        start: clamped.start,
        end: clamped.end,
      },
    });
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label="start"
        help="Clip start time in seconds on the reel timeline."
        value={element.time.start}
        min={0}
        max={duration}
        step={0.1}
        onChange={(event) => updateTime("start", event)}
      />
      <NumberField
        label="end"
        help="Clip end time in seconds. Minimum duration is 0.5s."
        value={element.time.end}
        min={0}
        max={duration}
        step={0.1}
        onChange={(event) => updateTime("end", event)}
      />
    </div>
  );
}

function BoxConfigForm({ node }: { node: BoxNode }) {
  const updateElement = useCanvasStore((state) => state.updateElement);

  function updateGeometry(
    field: "x" | "y" | "width" | "height",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const next = parseNumber(event.target.value);
    if (next === null) {
      return;
    }

    const clamped = clampBoxBounds({
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      [field]: next,
    });

    updateElement(node.id, clamped);
  }

  return (
    <div className="space-y-3 px-5 py-3">
      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyField label="id" value={node.id} help="Stable element identifier." />
        <ReadOnlyField label="type" value={node.type} help="Element kind." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <FieldLabel label="label" help="Visible text shown inside the box." />
          <input
            className={inputClassName}
            value={node.label}
            onChange={(event) =>
              updateElement(node.id, { label: event.target.value })
            }
          />
        </label>

        <label className="block space-y-1.5">
          <FieldLabel
            label="sublabel"
            help="Optional supporting text shown below the main label."
          />
          <input
            className={inputClassName}
            value={node.sublabel ?? ""}
            onChange={(event) =>
              updateElement(node.id, {
                sublabel: event.target.value || undefined,
              })
            }
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <FieldLabel
            label="colorTheme"
            help="Fill color used by the infographic box."
          />
          <select
            className={inputClassName}
            value={node.colorTheme}
            onChange={(event) =>
              updateElement(node.id, {
                colorTheme: event.target.value as ColorTheme,
              })
            }
          >
            {COLOR_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="flex items-center justify-between gap-2">
            <FieldLabel
              label="fontSize"
              help="Label text size in pixels. Sublabel scales proportionally."
            />
            <input
              type="number"
              min={MIN_BOX_FONT_SIZE}
              max={MAX_BOX_FONT_SIZE}
              step={1}
              className="w-16 rounded-md border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={node.fontSize ?? DEFAULT_BOX_FONT_SIZE}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isNaN(next)) {
                  return;
                }
                updateElement(node.id, { fontSize: clampBoxFontSize(next) });
              }}
            />
          </span>
          <input
            type="range"
            min={MIN_BOX_FONT_SIZE}
            max={MAX_BOX_FONT_SIZE}
            step={1}
            className="h-8 w-full cursor-pointer accent-primary"
            value={node.fontSize ?? DEFAULT_BOX_FONT_SIZE}
            onChange={(event) =>
              updateElement(node.id, {
                fontSize: clampBoxFontSize(Number(event.target.value)),
              })
            }
          />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <NumberField
          label="x"
          help="Left edge as a percentage of canvas width (0–100)."
          value={node.x}
          onChange={(event) => updateGeometry("x", event)}
        />
        <NumberField
          label="y"
          help="Top edge as a percentage of canvas height (0–100)."
          value={node.y}
          onChange={(event) => updateGeometry("y", event)}
        />
        <NumberField
          label="width"
          help="Box width as a percentage of canvas width (0–100)."
          value={node.width}
          onChange={(event) => updateGeometry("width", event)}
        />
        <NumberField
          label="height"
          help="Box height as a percentage of canvas height (0–100)."
          value={node.height}
          onChange={(event) => updateGeometry("height", event)}
        />
      </div>

      <TimeFields element={node} />
    </div>
  );
}

function NumberConfigForm({ node }: { node: NumberNode }) {
  const updateElement = useCanvasStore((state) => state.updateElement);

  function updateGeometry(
    field: "x" | "y" | "size",
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const next = parseNumber(event.target.value);
    if (next === null) {
      return;
    }

    const clamped = clampNumberBounds({
      x: node.x,
      y: node.y,
      size: node.size,
      [field]: next,
    });

    updateElement(node.id, clamped);
  }

  return (
    <div className="space-y-3 px-5 py-3">
      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyField label="id" value={node.id} help="Stable element identifier." />
        <ReadOnlyField label="type" value={node.type} help="Element kind." />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <FieldLabel label="value" help="Digit(s) shown inside the badge." />
          <input
            type="number"
            step={1}
            className={inputClassName}
            value={node.value}
            onChange={(event) => {
              const next = parseNumber(event.target.value);
              if (next === null) {
                return;
              }
              updateElement(node.id, { value: next });
            }}
          />
        </label>

        <label className="block space-y-1.5">
          <FieldLabel
            label="colorTheme"
            help="Fill color for the circular badge."
          />
          <select
            className={inputClassName}
            value={node.colorTheme}
            onChange={(event) =>
              updateElement(node.id, {
                colorTheme: event.target.value as ColorTheme,
              })
            }
          >
            {COLOR_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="x"
          help="Left edge as a percentage of canvas width (0–100)."
          value={node.x}
          onChange={(event) => updateGeometry("x", event)}
        />
        <NumberField
          label="y"
          help="Top edge as a percentage of canvas height (0–100)."
          value={node.y}
          onChange={(event) => updateGeometry("y", event)}
        />
        <NumberField
          label="size"
          help="Badge diameter as a percentage of canvas width (4–40)."
          value={node.size}
          onChange={(event) => updateGeometry("size", event)}
        />
      </div>

      <TimeFields element={node} />
    </div>
  );
}

function ArrowConfigForm({
  node,
  boxIds,
}: {
  node: ArrowNode;
  boxIds: string[];
}) {
  const updateElement = useCanvasStore((state) => state.updateElement);

  return (
    <div className="space-y-3 px-5 py-3">
      <div className="grid grid-cols-2 gap-3">
        <ReadOnlyField label="id" value={node.id} help="Stable element identifier." />
        <ReadOnlyField label="type" value={node.type} help="Element kind." />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block space-y-1.5">
          <FieldLabel label="sourceId" help="Box this arrow starts from." />
          <select
            className={inputClassName}
            value={node.sourceId}
            onChange={(event) =>
              updateElement(node.id, { sourceId: event.target.value })
            }
          >
            {boxIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <FieldLabel label="targetId" help="Box this arrow points to." />
          <select
            className={inputClassName}
            value={node.targetId}
            onChange={(event) =>
              updateElement(node.id, { targetId: event.target.value })
            }
          >
            {boxIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <FieldLabel
            label="variant"
            help="Use a continuous or dotted-style dashed connection."
          />
          <select
            className={inputClassName}
            value={node.variant ?? "solid"}
            onChange={(event) =>
              updateElement(node.id, {
                variant: event.target.value as ArrowVariant,
              })
            }
          >
            <option value="solid">solid</option>
            <option value="dashed">dashed</option>
          </select>
        </label>
      </div>

      <TimeFields element={node} />
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help: string;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel label={label} help={help} />
      <div className="rounded-md border border-border/70 bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function NumberField({
  label,
  help,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <FieldLabel label={label} help={help} />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        className={inputClassName}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

export function SchemaInspector({ width }: { width: number }) {
  const elements = useCanvasStore((state) => state.elements);
  const selectedId = useCanvasStore((state) => state.selectedId);
  const selectElement = useCanvasStore((state) => state.selectElement);
  const currentTime = useCanvasStore((state) => state.currentTime);
  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const boxes = elements.filter(isBoxNode);
  const [tab, setTab] = useState<"config" | "json">("config");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (selectedId) {
      setTab("config");
    }
  }, [selectedId]);

  return (
    <aside
      className="flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card"
      style={{ width }}
    >
      <nav
        aria-label="Inspector"
        className="flex shrink-0 items-center gap-1 border-b border-border px-2"
      >
        <TabButton
          label="Config"
          active={tab === "config"}
          onClick={() => setTab("config")}
          icon={SlidersHorizontal}
        />
        <TabButton
          label="JSON"
          active={tab === "json"}
          onClick={() => setTab("json")}
          icon={Braces}
        />
      </nav>

      {tab === "config" && selected ? (
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
          <button
            type="button"
            aria-label="Back to element list"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => selectElement(null)}
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <ElementGlyph element={selected} />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {getElementLabel(selected)}
            </h2>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {selected.type} · {selected.id}
            </p>
          </div>
          <span className="ml-auto shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {formatTimeRange(selected.time)}
          </span>
        </div>
      ) : null}

      {tab === "config" && !selected ? (
        <div className="shrink-0 border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search elements"
              placeholder="Search elements"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-lg border border-border bg-background py-1.5 pr-2 pl-8 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        {tab === "json" ? (
          <pre className="select-text p-5 font-mono text-[11px] leading-5 text-muted-foreground">
            {JSON.stringify(elements, null, 2)}
          </pre>
        ) : selected && isBoxNode(selected) ? (
          <BoxConfigForm node={selected} />
        ) : selected && isNumberNode(selected) ? (
          <NumberConfigForm node={selected} />
        ) : selected && isArrowNode(selected) ? (
          <ArrowConfigForm
            node={selected}
            boxIds={boxes.map((box) => box.id)}
          />
        ) : (
          <ElementList
            elements={elements}
            query={query}
            currentTime={currentTime}
            onSelect={selectElement}
          />
        )}
      </ScrollArea>
    </aside>
  );
}

function TabButton({
  label,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof SlidersHorizontal;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "relative flex h-10 items-center gap-1.5 px-3 text-xs font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
        />
      ) : null}
    </button>
  );
}

function matchesQuery(element: CanvasElement, query: string) {
  return `${getElementLabel(element)} ${element.type} ${element.id}`
    .toLowerCase()
    .includes(query);
}

function ElementList({
  elements,
  query,
  currentTime,
  onSelect,
}: {
  elements: CanvasElement[];
  query: string;
  currentTime: number;
  onSelect: (id: string) => void;
}) {
  if (elements.length === 0) {
    return (
      <p className="px-5 py-6 text-[11px] leading-5 text-muted-foreground">
        No elements on the canvas yet.
      </p>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? elements.filter((element) => matchesQuery(element, needle))
    : elements;

  if (visible.length === 0) {
    return (
      <p className="px-5 py-6 text-[11px] leading-5 text-muted-foreground">
        No elements match “{query.trim()}”.
      </p>
    );
  }

  return (
    <ul className="space-y-1 p-2">
      {visible.map((element) => {
        const active = isElementActiveAt(element.time, currentTime);
        return (
          <li key={element.id}>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                active
                  ? "border-primary/25 bg-primary/5 hover:bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-muted",
              )}
              onClick={() => onSelect(element.id)}
            >
              <ElementGlyph element={element} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-foreground">
                  {getElementLabel(element)}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {element.type} · {element.id}
                </span>
              </span>
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {formatTimeRange(element.time)}
              </span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ElementGlyph({ element }: { element: CanvasElement }) {
  if (isBoxNode(element)) {
    return (
      <span
        aria-hidden
        className={cn(
          "size-6 shrink-0 rounded-md border border-canvas-ink/20",
          swatchStyles[element.colorTheme],
        )}
      />
    );
  }

  if (isNumberNode(element)) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border border-canvas-ink/20 text-[10px] font-semibold text-canvas-ink",
          swatchStyles[element.colorTheme],
        )}
      >
        {element.value}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
    >
      <ArrowRight className="size-3.5" />
    </span>
  );
}

function formatSeconds(value: number) {
  return String(Number(value.toFixed(1)));
}

function formatTimeRange(time: ElementTime) {
  return `${formatSeconds(time.start)}–${formatSeconds(time.end)}s`;
}
