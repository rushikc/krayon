import { LAYOUT_ITEMS } from './limits.js';
import type {
  ChartLayout,
  CompareSide,
  GeneratedSegment,
  SceneIssue,
  SceneLayout,
  TimedText,
} from './scene.js';
import { shortenToFit } from './remotion/templates/fitText.js';
import { PLOT } from './remotion/templates/chartGeometry.js';
import { CONTENT_WIDTH, flowBox, hubBoxes, minFontCapacity } from './remotion/templates/metrics.js';

const issue = (code: string, path: string, message: string): SceneIssue => ({ code, path, message });

const fit = (text: string, width: number, minSize: number, lines = 1) =>
  shortenToFit(text, minFontCapacity(width, minSize, lines));

const required = (issues: SceneIssue[], path: string, text: string | undefined, label: string) => {
  if (!text?.trim()) issues.push(issue('required', path, `${label} is required.`));
};

const tooFew = (issues: SceneIssue[], path: string, count: number, min: number, label: string) => {
  if (count < min) issues.push(issue('count', path, `${label} must have at least ${min} items.`));
};

const uniqueIds = (ids: string[], path: string, issues: SceneIssue[]) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) issues.push(issue('duplicate-id', `${path}.${index}.id`, `Duplicate id "${id}".`));
    seen.add(id);
  });
};

type Timed = { appearAt?: number };

/** Clamps appearAt into the segment and keeps the values from going backwards. */
const orderAppear = <T extends Timed>(items: T[], duration: number): T[] => {
  const last = Math.max(0, duration - 1);
  let previous = 0;
  return items.map((item) => {
    if (item.appearAt === undefined) return item;
    const next = Math.max(previous, Math.min(last, Math.max(0, Math.round(item.appearAt))));
    previous = next;
    return { ...item, appearAt: next };
  });
};

const fitTimed = (items: TimedText[], width: number, minSize: number, lines: number, duration: number) =>
  orderAppear(
    items.map((item) => ({ ...item, text: fit(item.text, width, minSize, lines) })),
    duration,
  );

const compareSide = (side: CompareSide, width: number, duration: number): CompareSide => ({
  ...side,
  title: fit(side.title, width, 20),
  points: fitTimed(side.points.slice(0, LAYOUT_ITEMS.compare.max), width, 15, 2, duration),
});

const normalizeLayout = (layout: SceneLayout, duration: number): SceneLayout => {
  switch (layout.type) {
    case 'titleCard':
      return {
        ...layout,
        title: fit(layout.title, CONTENT_WIDTH, 36, 2),
        subtitle: layout.subtitle ? fit(layout.subtitle, CONTENT_WIDTH * 0.8, 20, 2) : undefined,
      };
    case 'bullets':
      return {
        ...layout,
        heading: fit(layout.heading, CONTENT_WIDTH, 28),
        items: fitTimed(layout.items.slice(0, LAYOUT_ITEMS.bullets.max), CONTENT_WIDTH - 40, 18, 2, duration),
      };
    case 'flow': {
      const nodes = layout.nodes.slice(0, LAYOUT_ITEMS.flow.max);
      const width = flowBox(Math.max(1, nodes.length), layout.direction).w - 24;
      return {
        ...layout,
        heading: layout.heading ? fit(layout.heading, CONTENT_WIDTH, 26) : undefined,
        nodes: orderAppear(
          nodes.map((node) => ({
            ...node,
            label: fit(node.label, width, 14, 2),
            sublabel: node.sublabel ? fit(node.sublabel, width, 12) : undefined,
          })),
          duration,
        ),
        edges: layout.edges.map((edge) => ({
          ...edge,
          label: edge.label ? fit(edge.label, 120, 11) : undefined,
        })),
      };
    }
    case 'compare': {
      const width = (CONTENT_WIDTH - 32) / 2 - 36;
      return {
        ...layout,
        heading: layout.heading ? fit(layout.heading, CONTENT_WIDTH, 26) : undefined,
        left: compareSide(layout.left, width, duration),
        right: compareSide(layout.right, width, duration),
      };
    }
    case 'hubSpoke': {
      const spokes = layout.spokes.slice(0, LAYOUT_ITEMS.spokes.max);
      const boxes = hubBoxes(Math.max(1, spokes.length));
      return {
        ...layout,
        center: { ...layout.center, label: fit(layout.center.label, boxes.center.w - 24, 14, 2) },
        spokes: orderAppear(
          spokes.map((spoke, index) => {
            const box = boxes.spokes[index];
            const width = (box?.w ?? 168) - 16;
            return {
              ...spoke,
              label: fit(spoke.label, width, 12, 2),
              sublabel: spoke.sublabel ? fit(spoke.sublabel, width, 11) : undefined,
            };
          }),
          duration,
        ),
      };
    }
    case 'chart':
      return normalizeChart(layout, duration);
    case 'timeline': {
      const steps = layout.steps.slice(0, LAYOUT_ITEMS.steps.max);
      const stepWidth = Math.max(80, (CONTENT_WIDTH - 40) / Math.max(1, steps.length) - 16);
      return {
        ...layout,
        heading: layout.heading ? fit(layout.heading, CONTENT_WIDTH, 26) : undefined,
        steps: orderAppear(
          steps.map((step) => ({
            ...step,
            label: fit(step.label, stepWidth, 13, 2),
            detail: step.detail ? fit(step.detail, stepWidth, 12, 2) : undefined,
          })),
          duration,
        ),
      };
    }
    case 'callout': {
      const width = CONTENT_WIDTH - 80 - 64;
      return {
        ...layout,
        title: fit(layout.title, width, 24),
        body: fit(layout.body, width, 16, 4),
      };
    }
  }
};

const normalizeChart = (layout: ChartLayout, duration: number): ChartLayout => {
  const curves = layout.curves.slice(0, LAYOUT_ITEMS.curves.max).map((curve) => ({
    ...curve,
    label: fit(curve.label, 180, 13),
  }));
  const markers = layout.markers.map((marker) => ({
    ...marker,
    label: fit(marker.label, 180, 12),
  }));
  const up = curves.find((curve) => curve.kind === 'upward');
  const down = curves.find((curve) => curve.kind === 'downward');
  const hasEquilibrium = markers.some((marker) => marker.type === 'intersection' && (marker.curveIds?.length ?? 0) >= 2);
  if (up && down && !hasEquilibrium) {
    markers.push({ type: 'intersection', curveIds: [up.id, down.id], label: 'equilibrium' });
  }
  return {
    ...layout,
    heading: layout.heading ? fit(layout.heading, CONTENT_WIDTH, 22) : undefined,
    xLabel: fit(layout.xLabel, PLOT.w, 14),
    yLabel: fit(layout.yLabel, 240, 14),
    curves: orderAppear(curves, duration),
    markers: orderAppear(markers, duration),
  };
};

/** Cheap fixes: timing, text that cannot fit even at the smallest font, extra items, and a missing equilibrium marker. */
export const normalizeScene = (segment: GeneratedSegment): GeneratedSegment => {
  if (!segment.scene?.layout) return segment;
  return { ...segment, scene: { layout: normalizeLayout(segment.scene.layout, segment.durationInFrames) } };
};

const validateLayout = (layout: SceneLayout, issues: SceneIssue[]) => {
  switch (layout.type) {
    case 'titleCard':
      required(issues, 'scene.layout.title', layout.title, 'Title');
      return;
    case 'bullets':
      required(issues, 'scene.layout.heading', layout.heading, 'Heading');
      tooFew(issues, 'scene.layout.items', layout.items.length, LAYOUT_ITEMS.bullets.min, 'Bullets');
      return;
    case 'flow': {
      tooFew(issues, 'scene.layout.nodes', layout.nodes.length, LAYOUT_ITEMS.flow.min, 'Flow nodes');
      uniqueIds(layout.nodes.map((node) => node.id), 'scene.layout.nodes', issues);
      const ids = new Set(layout.nodes.map((node) => node.id));
      layout.edges.forEach((edge, index) => {
        if (!ids.has(edge.from)) issues.push(issue('bad-ref', `scene.layout.edges.${index}.from`, `Unknown node "${edge.from}".`));
        if (!ids.has(edge.to)) issues.push(issue('bad-ref', `scene.layout.edges.${index}.to`, `Unknown node "${edge.to}".`));
      });
      return;
    }
    case 'compare':
      (['left', 'right'] as const).forEach((side) => {
        required(issues, `scene.layout.${side}.title`, layout[side].title, 'Column title');
        tooFew(issues, `scene.layout.${side}.points`, layout[side].points.length, LAYOUT_ITEMS.compare.min, 'Compare points');
      });
      return;
    case 'hubSpoke': {
      required(issues, 'scene.layout.center.label', layout.center.label, 'Center label');
      tooFew(issues, 'scene.layout.spokes', layout.spokes.length, LAYOUT_ITEMS.spokes.min, 'Spokes');
      const ids = [layout.center.id, ...layout.spokes.map((spoke) => spoke.id)];
      const seen = new Set<string>();
      ids.forEach((id, index) => {
        if (!seen.has(id)) {
          seen.add(id);
          return;
        }
        const path = index === 0 ? 'scene.layout.center.id' : `scene.layout.spokes.${index - 1}.id`;
        issues.push(issue('duplicate-id', path, `Duplicate id "${id}".`));
      });
      return;
    }
    case 'chart': {
      required(issues, 'scene.layout.xLabel', layout.xLabel, 'X axis label');
      required(issues, 'scene.layout.yLabel', layout.yLabel, 'Y axis label');
      tooFew(issues, 'scene.layout.curves', layout.curves.length, LAYOUT_ITEMS.curves.min, 'Curves');
      uniqueIds(layout.curves.map((curve) => curve.id), 'scene.layout.curves', issues);
      const curveIds = new Set(layout.curves.map((curve) => curve.id));
      layout.markers.forEach((marker, index) => {
        const refs = marker.curveIds ?? [];
        refs.forEach((id, refIndex) => {
          if (!curveIds.has(id)) {
            issues.push(issue('bad-ref', `scene.layout.markers.${index}.curveIds.${refIndex}`, `Unknown curve "${id}".`));
          }
        });
        if (marker.type === 'intersection' && refs.length < 2) {
          issues.push(issue('bad-ref', `scene.layout.markers.${index}.curveIds`, 'An intersection needs two curve ids.'));
        }
        if (marker.type === 'point' && refs.length < 1) {
          issues.push(issue('bad-ref', `scene.layout.markers.${index}.curveIds`, 'A point marker needs a curve id.'));
        }
      });
      return;
    }
    case 'timeline':
      tooFew(issues, 'scene.layout.steps', layout.steps.length, LAYOUT_ITEMS.steps.min, 'Timeline steps');
      return;
    case 'callout':
      required(issues, 'scene.layout.title', layout.title, 'Title');
      required(issues, 'scene.layout.body', layout.body, 'Body');
      return;
  }
};

export const validateSegment = (segment: GeneratedSegment): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  if (!(segment.durationInFrames > 0)) {
    issues.push(issue('duration', 'durationInFrames', 'Duration must be a positive number of frames.'));
  }
  if (!segment.scene?.layout) {
    issues.push(issue('required', 'scene.layout', 'A layout template is required.'));
    return issues;
  }
  validateLayout(segment.scene.layout, issues);
  return issues;
};
