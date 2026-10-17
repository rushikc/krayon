import type { CourseState, SegmentState, TopicState } from '../../src/course.js';
import type { GeneratedLesson, GeneratedSegment, Roadmap, RoadmapTopic, SceneLayout } from '../../src/scene.js';

const segment = (id: string, title: string, layout: SceneLayout): GeneratedSegment => ({
  id,
  title,
  durationInFrames: 180,
  narration: 'A short caption.',
  scene: { layout },
});

export const layoutSegments: GeneratedSegment[] = [
  segment('title-card', 'Supply', { type: 'titleCard', title: 'Supply', subtitle: 'Basics' }),
  segment('bullets', 'Demand shifts', {
    type: 'bullets',
    heading: 'Demand shifts',
    items: [{ text: 'Price rises', appearAt: 12 }],
  }),
  segment('flow', 'Request path', {
    type: 'flow',
    heading: 'Request path',
    direction: 'horizontal',
    nodes: [
      { id: 'client', label: 'Client' },
      { id: 'server', label: 'Server' },
    ],
    edges: [{ from: 'client', to: 'server', label: 'calls' }],
  }),
  segment('compare', 'Sides', {
    type: 'compare',
    heading: 'Sides',
    left: { title: 'Supply', points: [{ text: 'Sellers' }] },
    right: { title: 'Demand', points: [{ text: 'Buyers' }] },
  }),
  segment('hub', 'Market', {
    type: 'hubSpoke',
    center: { id: 'market', label: 'Market' },
    spokes: [
      { id: 'price', label: 'Price' },
      { id: 'quantity', label: 'Quantity' },
      { id: 'cost', label: 'Cost' },
    ],
  }),
  segment('chart', 'Curves', {
    type: 'chart',
    heading: 'Curves',
    xLabel: 'Quantity',
    yLabel: 'Price',
    curves: [{ id: 'demand', label: 'Demand', kind: 'downward' }],
    markers: [],
  }),
  segment('timeline', 'Adjustment', {
    type: 'timeline',
    heading: 'Adjustment',
    steps: [{ label: 'Shift' }, { label: 'Settle' }],
  }),
  segment('callout', 'Elasticity', {
    type: 'callout',
    kind: 'definition',
    title: 'Elasticity',
    body: 'Response to price.',
  }),
];

const labels: Record<string, string> = {
  'title-card': 'Supply',
  bullets: 'Demand shifts',
  flow: 'Client',
  compare: 'Supply',
  hub: 'Market',
  chart: 'Quantity',
  timeline: 'Shift',
  callout: 'Elasticity',
};

export const labelFor = (item: GeneratedSegment) => labels[item.id] ?? item.title;

export const lesson: GeneratedLesson = {
  studyDoc: 'Market notes.',
  segments: layoutSegments,
};

const supplyTopic: RoadmapTopic = {
  id: 'supply',
  title: 'Supply',
  summary: 'How sellers react.',
  prerequisites: [],
  sourcePages: [1],
};

const demandTopic: RoadmapTopic = {
  id: 'demand',
  title: 'Demand',
  summary: 'How buyers react.',
  prerequisites: ['supply'],
  sourcePages: [2],
};

const equilibriumTopic: RoadmapTopic = {
  id: 'equilibrium',
  title: 'Equilibrium',
  summary: 'Where they meet.',
  prerequisites: ['demand'],
  sourcePages: [3],
};

export const roadmapTopics: RoadmapTopic[] = [supplyTopic, demandTopic, equilibriumTopic];

export const roadmap: Roadmap = { title: 'Supply and demand', category: 'Economy', topics: roadmapTopics };

const segmentState = (item: GeneratedSegment, status: SegmentState['status'] = 'ready'): SegmentState => ({
  id: item.id,
  title: item.title,
  status,
  statusDetail: null,
  rounds: [],
  segment: item,
});

const topicState = (topic: RoadmapTopic, status: TopicState['status'], segments: GeneratedSegment[]): TopicState => ({
  id: topic.id,
  title: topic.title,
  summary: topic.summary,
  prerequisites: topic.prerequisites,
  sourcePages: topic.sourcePages,
  status,
  statusDetail: null,
  error: null,
  lesson: segments.length ? { studyDoc: 'Notes for supply.', segments } : null,
  segments: segments.map((item) => segmentState(item)),
});

export const snapshotCourse: CourseState = {
  id: 'course-1',
  owner: 'local-user',
  status: 'lessons',
  fileNames: ['notes.pdf'],
  sources: [],
  roadmap,
  topics: [topicState(supplyTopic, 'queued', layoutSegments.slice(0, 2)), topicState(demandTopic, 'queued', [])],
  error: null,
};
