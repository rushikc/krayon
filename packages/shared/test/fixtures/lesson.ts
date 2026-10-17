import type { ChapterState, CourseState, LessonDetail, LessonSummary, SegmentState } from '../../src/course.js';
import type { GeneratedSegment, SceneLayout } from '../../src/scene.js';

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

const segmentState = (item: GeneratedSegment, index: number, status: SegmentState['status'] = 'ready'): SegmentState => ({
  id: `s0${index + 1}`,
  lessonId: 'course-1-c1-l1',
  index,
  title: item.title,
  narration: item.narration,
  durationInFrames: item.durationInFrames,
  startFrame: index * item.durationInFrames,
  sourcePages: [1],
  status,
  statusDetail: null,
  segment: status === 'ready' ? item : null,
  rounds: [],
  error: null,
  errorInfo: null,
  reviewStatus: null,
});

export const lessonSummary = (chapterId: string, index: number, status: LessonSummary['status'] = 'outlined'): LessonSummary => ({
  id: `${chapterId}-l${index + 1}`,
  courseId: 'course-1',
  chapterId,
  index,
  title: `Lesson ${index + 1}`,
  sourcePages: [index + 1],
  status,
  statusDetail: null,
  durationFrames: 0,
  segmentCount: 0,
  segmentsReady: 0,
  wordCount: 500,
  shortSource: false,
  error: null,
  errorInfo: null,
  progress: null,
});

export const chapterState = (index: number, lessons: LessonSummary[], status: ChapterState['status'] = 'ready'): ChapterState => ({
  id: `course-1-c${index + 1}`,
  courseId: 'course-1',
  index,
  title: `Chapter ${index + 1}`,
  pdfPageStart: index * 10,
  pdfPageEnd: index * 10 + 9,
  skip: false,
  status,
  statusDetail: null,
  error: null,
  errorInfo: null,
  lessons,
});

export const snapshotCourse: CourseState = {
  id: 'course-1',
  owner: 'local-user',
  status: 'writing',
  stage: 'chapters',
  title: 'Supply and demand',
  category: 'Economy',
  fileNames: ['notes.pdf'],
  sources: [],
  pageCount: 20,
  chapters: [
    chapterState(0, [lessonSummary('course-1-c1', 0), lessonSummary('course-1-c1', 1)]),
    chapterState(1, [], 'pending'),
  ],
  error: null,
  errorInfo: null,
};

export const lessonDetail = (statuses: SegmentState['status'][]): LessonDetail => ({
  ...lessonSummary('course-1-c1', 0, 'rendering'),
  chapterTitle: 'Chapter 1',
  explanationSummary: 'Script.',
  studyDoc: 'Notes.',
  segments: statuses.map((status, index) => segmentState(layoutSegments[index], index, status)),
});
