import type { ChangeEvent } from "react";

import { FieldLabel } from "@/components/ui/field-label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { clampBoxBounds, clampNumberBounds, clampBoxFontSize, DEFAULT_BOX_FONT_SIZE, MAX_BOX_FONT_SIZE, MIN_BOX_FONT_SIZE } from "@/lib/canvas-geometry";
import { useCanvasStore } from "@/stores/canvas-store";
import {
  isArrowNode,
  isBoxNode,
  isNumberNode,
  type ArrowNode,
  type ArrowVariant,
  type BoxNode,
  type ColorTheme,
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

const inputClassName =
  "w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring";

function parseNumber(raw: string) {
  const value = Number(raw);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
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
            <span className="font-mono text-[11px] text-muted-foreground">
              {node.fontSize ?? DEFAULT_BOX_FONT_SIZE}px
            </span>
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
}: {
  label: string;
  help: string;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <FieldLabel label={label} help={help} />
      <input
        type="number"
        min={0}
        max={100}
        step={1}
        className={inputClassName}
        value={value}
        onChange={onChange}
      />
    </label>
  );
}

export function SchemaInspector() {
  const elements = useCanvasStore((state) => state.elements);
  const selectedId = useCanvasStore((state) => state.selectedId);
  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const boxes = elements.filter(isBoxNode);
  const boxCount = boxes.length;
  const arrowCount = elements.filter(isArrowNode).length;
  const numberCount = elements.filter(isNumberNode).length;

  return (
    <aside className="flex w-[40rem] shrink-0 flex-col border-l border-border bg-card/20">
      <div className="shrink-0 border-b border-border px-5 py-3">
        {selected ? (
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{selected.type}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{selected.id}</p>
          </div>
        ) : (
          <>
            <h2 className="text-xs font-semibold tracking-tight">Scene schema</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Click a box, number, or arrow to edit
            </p>
          </>
        )}
      </div>

      <div className="shrink-0 border-b border-border">
        {selected && isBoxNode(selected) ? (
          <BoxConfigForm node={selected} />
        ) : selected && isNumberNode(selected) ? (
          <NumberConfigForm node={selected} />
        ) : selected && isArrowNode(selected) ? (
          <ArrowConfigForm
            node={selected}
            boxIds={boxes.map((box) => box.id)}
          />
        ) : (
          <p className="px-5 py-6 text-[11px] leading-5 text-muted-foreground">
            Select an element on the canvas to edit its configuration. Changes
            update the live UI and the JSON below.
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 py-2">
          <p className="text-[11px] text-muted-foreground">
            {boxCount} {boxCount === 1 ? "box" : "boxes"} · {numberCount}{" "}
            {numberCount === 1 ? "number" : "numbers"} · {arrowCount}{" "}
            {arrowCount === 1 ? "connection" : "connections"}
          </p>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <pre className="select-text p-5 font-mono text-[11px] leading-5 text-muted-foreground">
            {JSON.stringify(elements, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    </aside>
  );
}
