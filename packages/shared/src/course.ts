import type { GeneratedLesson, GeneratedSegment, Roadmap, SceneIssue } from './scene.js';
import type { GenerationErrorInfo } from './generation.js';
import type { ReviewIssue } from './schemas.js';

export type TopicPhase = 'idle' | 'queued' | 'generating' | 'checking' | 'reviewing' | 'ready' | 'failed';

export type SegmentStatus = TopicPhase | 'draft' | 'rendering' | 'unreviewed' | 'blocked';

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
  /** True when this round's fix replaced the segment. */
  fixed?: boolean;
  keyframeIds: string[];
};

export type SegmentState = {
  id: string;
  title: string;
  status: SegmentStatus;
  statusDetail: string | null;
  rounds: SegmentRound[];
  segment: GeneratedSegment | null;
  /** Path-qualified message when status is failed. */
  error?: string | null;
  errorInfo?: GenerationErrorInfo | null;
  /** Set when render or review failed but the segment can still play. */
  reviewStatus?: 'unreviewed' | null;
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
  errorInfo?: GenerationErrorInfo | null;
  lesson: GeneratedLesson | null;
  segments: SegmentState[];
};

export type CourseState = {
  id: string;
  owner: string;
  status: 'created' | 'roadmap' | 'lessons' | 'generating' | 'done' | 'failed';
  fileNames: string[];
  sources: CourseSource[];
  roadmap: Roadmap | null;
  topics: TopicState[];
  error: string | null;
};
