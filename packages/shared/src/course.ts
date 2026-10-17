import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneIssue } from './scene.js';
import type { ReviewIssue } from './schemas.js';

export type TopicPhase = 'queued' | 'generating' | 'checking' | 'reviewing' | 'ready' | 'failed';

export type CourseSource = {
  id: string;
  name: string;
  content_type: string;
  size: number;
  path: string;
};

export type SegmentRound = {
  n: number;
  segment: GeneratedSegment;
  issues: Array<SceneIssue | ReviewIssue>;
  score: number | null;
  pass: boolean | null;
  keyframeIds: string[];
};

export type SegmentState = {
  id: string;
  title: string;
  status: TopicPhase | 'draft';
  statusDetail: string | null;
  rounds: SegmentRound[];
  segment: GeneratedSegment | null;
};

export type TopicState = {
  id: string;
  title: string;
  summary: string;
  prerequisites: string[];
  sourcePages: number[];
  status: TopicPhase;
  statusDetail: string | null;
  error: string | null;
  lesson: GeneratedLesson | null;
  segments: SegmentState[];
};

export type CourseState = {
  id: string;
  owner: string;
  status: 'created' | 'roadmap' | 'lessons' | 'done' | 'failed';
  fileNames: string[];
  sources: CourseSource[];
  roadmap: Roadmap | null;
  topics: TopicState[];
  error: string | null;
};
