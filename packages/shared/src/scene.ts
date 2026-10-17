export const layoutTypes = [
  'titleCard',
  'bullets',
  'flow',
  'compare',
  'hubSpoke',
  'chart',
  'timeline',
  'callout',
] as const;

export type LayoutType = (typeof layoutTypes)[number];

export type SceneIssue = {
  code: string;
  path: string;
  message: string;
};

export type TimedText = {
  text: string;
  appearAt?: number;
};

export type TitleCardLayout = {
  type: 'titleCard';
  title: string;
  subtitle?: string;
};

export type BulletsLayout = {
  type: 'bullets';
  heading: string;
  items: TimedText[];
};

export type FlowNode = {
  id: string;
  label: string;
  sublabel?: string;
  appearAt?: number;
};

export type FlowEdge = {
  from: string;
  to: string;
  label?: string;
};

export type FlowLayout = {
  type: 'flow';
  heading?: string;
  direction: 'horizontal' | 'vertical';
  nodes: FlowNode[];
  edges: FlowEdge[];
};

export type CompareSide = {
  title: string;
  points: TimedText[];
};

export type CompareLayout = {
  type: 'compare';
  heading?: string;
  left: CompareSide;
  right: CompareSide;
};

export type HubNode = {
  id: string;
  label: string;
  sublabel?: string;
  appearAt?: number;
};

export type HubSpokeLayout = {
  type: 'hubSpoke';
  center: { id: string; label: string };
  spokes: HubNode[];
};

export type ChartCurve = {
  id: string;
  label: string;
  kind: 'upward' | 'downward' | 'flat';
  shift?: 'left' | 'right';
  appearAt?: number;
};

export type ChartMarker = {
  type: 'intersection' | 'point';
  curveIds?: string[];
  label: string;
  appearAt?: number;
};

export type ChartLayout = {
  type: 'chart';
  heading?: string;
  xLabel: string;
  yLabel: string;
  curves: ChartCurve[];
  markers: ChartMarker[];
};

export type TimelineStep = {
  label: string;
  detail?: string;
  appearAt?: number;
};

export type TimelineLayout = {
  type: 'timeline';
  heading?: string;
  steps: TimelineStep[];
};

export type CalloutLayout = {
  type: 'callout';
  kind: 'definition' | 'example' | 'keyPoint';
  title: string;
  body: string;
};

export type SceneLayout =
  | TitleCardLayout
  | BulletsLayout
  | FlowLayout
  | CompareLayout
  | HubSpokeLayout
  | ChartLayout
  | TimelineLayout
  | CalloutLayout;

export type Scene = {
  layout: SceneLayout;
};

export type SegmentDebug = {
  issues: SceneIssue[];
  repairRounds: number;
};

export type GeneratedSegment = {
  id: string;
  title: string;
  durationInFrames: number;
  narration: string;
  scene: Scene;
  debug?: SegmentDebug;
};

export const isLayoutType = (type: string): type is LayoutType =>
  (layoutTypes as readonly string[]).includes(type);

export const generatedDuration = (segments: GeneratedSegment[]) =>
  segments.reduce((total, segment) => total + segment.durationInFrames, 0);
