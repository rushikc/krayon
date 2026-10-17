import type { GeneratedSegment, SceneIssue, SceneLayout } from './scene.js';
import {
  bulletCapacity,
  calloutBodyCapacity,
  chartLabelCapacity,
  comparePointCapacity,
  flowLabelCapacity,
  headingCapacity,
  hubLabelCapacity,
  timelineLabelCapacity,
  titleCapacity,
} from './remotion/templates/metrics.js';

const issue = (code: string, path: string, message: string): SceneIssue => ({ code, path, message });

const tooLong = (issues: SceneIssue[], path: string, text: string, limit: number) => {
  if (text.length > limit) {
    issues.push(issue('too-long', path, `Keep this under ${limit} characters.`));
  }
};

const overflow = (issues: SceneIssue[], path: string, text: string, capacity: number) => {
  if (text.length > capacity) {
    issues.push(issue('overflow', path, `This text does not fit. Use about ${capacity} characters.`));
  }
};

const required = (issues: SceneIssue[], path: string, text: string | undefined, label: string) => {
  if (!text?.trim()) issues.push(issue('required', path, `${label} is required.`));
};

const checkTiming = (
  items: { appearAt?: number }[],
  duration: number,
  path: string,
  issues: SceneIssue[],
) => {
  let previous = -1;
  items.forEach((item, index) => {
    const resolved =
      item.appearAt ?? Math.round((index / Math.max(items.length, 1)) * Math.max(duration, 0) * 0.6);
    if (item.appearAt !== undefined && (item.appearAt < 0 || item.appearAt > duration)) {
      issues.push(issue('timing', `${path}.${index}.appearAt`, 'appearAt must fall inside the segment.'));
    }
    if (resolved < previous) {
      issues.push(issue('timing', `${path}.${index}.appearAt`, 'appearAt values must stay in ascending order.'));
    }
    previous = resolved;
  });
};

const uniqueIds = (ids: string[], path: string, issues: SceneIssue[]) => {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) issues.push(issue('duplicate-id', `${path}.${index}.id`, `Duplicate id "${id}".`));
    seen.add(id);
  });
};

const countBetween = (
  issues: SceneIssue[],
  path: string,
  count: number,
  min: number,
  max: number,
  label: string,
) => {
  if (count < min || count > max) {
    issues.push(issue('count', path, `${label} must have between ${min} and ${max} items.`));
  }
};

const validateLayout = (layout: SceneLayout, duration: number, issues: SceneIssue[]) => {
  switch (layout.type) {
    case 'titleCard': {
      required(issues, 'scene.layout.title', layout.title, 'Title');
      tooLong(issues, 'scene.layout.title', layout.title, 60);
      overflow(issues, 'scene.layout.title', layout.title, titleCapacity());
      if (layout.subtitle) {
        tooLong(issues, 'scene.layout.subtitle', layout.subtitle, 80);
        overflow(issues, 'scene.layout.subtitle', layout.subtitle, titleCapacity());
      }
      return;
    }
    case 'bullets': {
      required(issues, 'scene.layout.heading', layout.heading, 'Heading');
      tooLong(issues, 'scene.layout.heading', layout.heading, 60);
      overflow(issues, 'scene.layout.heading', layout.heading, headingCapacity());
      countBetween(issues, 'scene.layout.items', layout.items.length, 1, 5, 'Bullets');
      layout.items.forEach((item, index) => {
        tooLong(issues, `scene.layout.items.${index}.text`, item.text, 80);
        overflow(issues, `scene.layout.items.${index}.text`, item.text, bulletCapacity());
      });
      checkTiming(layout.items, duration, 'scene.layout.items', issues);
      return;
    }
    case 'flow': {
      if (layout.heading) {
        tooLong(issues, 'scene.layout.heading', layout.heading, 60);
        overflow(issues, 'scene.layout.heading', layout.heading, headingCapacity());
      }
      countBetween(issues, 'scene.layout.nodes', layout.nodes.length, 2, 6, 'Flow nodes');
      const capacity = flowLabelCapacity(layout.nodes.length, layout.direction);
      uniqueIds(layout.nodes.map((node) => node.id), 'scene.layout.nodes', issues);
      const ids = new Set(layout.nodes.map((node) => node.id));
      layout.nodes.forEach((node, index) => {
        tooLong(issues, `scene.layout.nodes.${index}.label`, node.label, 40);
        overflow(issues, `scene.layout.nodes.${index}.label`, node.label, capacity);
        if (node.sublabel) {
          tooLong(issues, `scene.layout.nodes.${index}.sublabel`, node.sublabel, 40);
          overflow(issues, `scene.layout.nodes.${index}.sublabel`, node.sublabel, capacity);
        }
      });
      layout.edges.forEach((edge, index) => {
        if (!ids.has(edge.from)) {
          issues.push(issue('bad-ref', `scene.layout.edges.${index}.from`, `Unknown node "${edge.from}".`));
        }
        if (!ids.has(edge.to)) {
          issues.push(issue('bad-ref', `scene.layout.edges.${index}.to`, `Unknown node "${edge.to}".`));
        }
        if (edge.label) {
          tooLong(issues, `scene.layout.edges.${index}.label`, edge.label, 40);
          overflow(issues, `scene.layout.edges.${index}.label`, edge.label, 16);
        }
      });
      checkTiming(layout.nodes, duration, 'scene.layout.nodes', issues);
      return;
    }
    case 'compare': {
      if (layout.heading) {
        tooLong(issues, 'scene.layout.heading', layout.heading, 60);
        overflow(issues, 'scene.layout.heading', layout.heading, headingCapacity());
      }
      (['left', 'right'] as const).forEach((side) => {
        const column = layout[side];
        required(issues, `scene.layout.${side}.title`, column.title, 'Column title');
        tooLong(issues, `scene.layout.${side}.title`, column.title, 60);
        countBetween(issues, `scene.layout.${side}.points`, column.points.length, 1, 5, 'Compare points');
        column.points.forEach((point, index) => {
          tooLong(issues, `scene.layout.${side}.points.${index}.text`, point.text, 80);
          overflow(issues, `scene.layout.${side}.points.${index}.text`, point.text, comparePointCapacity());
        });
        checkTiming(column.points, duration, `scene.layout.${side}.points`, issues);
      });
      return;
    }
    case 'hubSpoke': {
      required(issues, 'scene.layout.center.label', layout.center.label, 'Center label');
      tooLong(issues, 'scene.layout.center.label', layout.center.label, 40);
      overflow(issues, 'scene.layout.center.label', layout.center.label, hubLabelCapacity());
      countBetween(issues, 'scene.layout.spokes', layout.spokes.length, 3, 6, 'Spokes');
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
      layout.spokes.forEach((spoke, index) => {
        tooLong(issues, `scene.layout.spokes.${index}.label`, spoke.label, 40);
        overflow(issues, `scene.layout.spokes.${index}.label`, spoke.label, hubLabelCapacity());
        if (spoke.sublabel) {
          tooLong(issues, `scene.layout.spokes.${index}.sublabel`, spoke.sublabel, 40);
          overflow(issues, `scene.layout.spokes.${index}.sublabel`, spoke.sublabel, hubLabelCapacity());
        }
      });
      checkTiming(layout.spokes, duration, 'scene.layout.spokes', issues);
      return;
    }
    case 'chart': {
      required(issues, 'scene.layout.xLabel', layout.xLabel, 'X axis label');
      required(issues, 'scene.layout.yLabel', layout.yLabel, 'Y axis label');
      tooLong(issues, 'scene.layout.xLabel', layout.xLabel, 60);
      tooLong(issues, 'scene.layout.yLabel', layout.yLabel, 60);
      overflow(issues, 'scene.layout.xLabel', layout.xLabel, chartLabelCapacity());
      overflow(issues, 'scene.layout.yLabel', layout.yLabel, chartLabelCapacity());
      if (layout.heading) {
        tooLong(issues, 'scene.layout.heading', layout.heading, 60);
        overflow(issues, 'scene.layout.heading', layout.heading, headingCapacity());
      }
      countBetween(issues, 'scene.layout.curves', layout.curves.length, 1, 4, 'Curves');
      uniqueIds(layout.curves.map((curve) => curve.id), 'scene.layout.curves', issues);
      const curveIds = new Set(layout.curves.map((curve) => curve.id));
      const hasUp = layout.curves.some((curve) => curve.kind === 'upward');
      const hasDown = layout.curves.some((curve) => curve.kind === 'downward');
      const hasEquilibrium = layout.markers.some(
        (marker) => marker.type === 'intersection' && (marker.curveIds?.length ?? 0) >= 2,
      );
      if (hasUp && hasDown && !hasEquilibrium) {
        issues.push(
          issue(
            'required',
            'scene.layout.markers',
            'Add an intersection marker that names the upward and downward curves.',
          ),
        );
      }
      layout.curves.forEach((curve, index) => {
        tooLong(issues, `scene.layout.curves.${index}.label`, curve.label, 40);
        overflow(issues, `scene.layout.curves.${index}.label`, curve.label, chartLabelCapacity());
      });
      layout.markers.forEach((marker, index) => {
        tooLong(issues, `scene.layout.markers.${index}.label`, marker.label, 40);
        overflow(issues, `scene.layout.markers.${index}.label`, marker.label, chartLabelCapacity());
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
      checkTiming(layout.curves, duration, 'scene.layout.curves', issues);
      checkTiming(layout.markers, duration, 'scene.layout.markers', issues);
      return;
    }
    case 'timeline': {
      if (layout.heading) {
        tooLong(issues, 'scene.layout.heading', layout.heading, 60);
        overflow(issues, 'scene.layout.heading', layout.heading, headingCapacity());
      }
      countBetween(issues, 'scene.layout.steps', layout.steps.length, 2, 6, 'Timeline steps');
      const capacity = timelineLabelCapacity(layout.steps.length);
      layout.steps.forEach((step, index) => {
        tooLong(issues, `scene.layout.steps.${index}.label`, step.label, 40);
        overflow(issues, `scene.layout.steps.${index}.label`, step.label, capacity);
        if (step.detail) {
          tooLong(issues, `scene.layout.steps.${index}.detail`, step.detail, 80);
          overflow(issues, `scene.layout.steps.${index}.detail`, step.detail, capacity);
        }
      });
      checkTiming(layout.steps, duration, 'scene.layout.steps', issues);
      return;
    }
    case 'callout': {
      required(issues, 'scene.layout.title', layout.title, 'Title');
      required(issues, 'scene.layout.body', layout.body, 'Body');
      tooLong(issues, 'scene.layout.title', layout.title, 60);
      tooLong(issues, 'scene.layout.body', layout.body, 220);
      overflow(issues, 'scene.layout.title', layout.title, headingCapacity());
      overflow(issues, 'scene.layout.body', layout.body, calloutBodyCapacity());
      return;
    }
  }
};

export const validateSegment = (segment: GeneratedSegment): SceneIssue[] => {
  const issues: SceneIssue[] = [];
  if (segment.durationInFrames < 90 || segment.durationInFrames > 450) {
    issues.push(issue('duration', 'durationInFrames', 'Duration must be between 90 and 450 frames.'));
  }
  if (!segment.scene?.layout) {
    issues.push(issue('required', 'scene.layout', 'A layout template is required.'));
    return issues;
  }
  validateLayout(segment.scene.layout, segment.durationInFrames, issues);
  return issues;
};
