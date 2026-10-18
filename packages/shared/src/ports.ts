import type { PipelineEvent } from './events.js';
import type { GeneratedSegment } from './scene.js';

export type DocData = Record<string, unknown>;

export type DocRecord = {
  id: string;
  path: string;
  data: DocData;
  updatedAt: number;
};

export type WhereOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in';
export type Where = [field: string, op: WhereOp, value: unknown];

export type BatchOp =
  | { op: 'set'; path: string; data: DocData; merge?: boolean }
  | { op: 'update'; path: string; data: DocData }
  | { op: 'delete'; path: string };

/** Firestore rule: all reads happen before writes. */
export interface DocTx {
  get(path: string): Promise<DocRecord | null>;
  query(collection: string, where?: Where[], opts?: { limit?: number }): Promise<DocRecord[]>;
  set(path: string, data: DocData, opts?: { merge?: boolean }): void;
  update(path: string, patch: DocData): void;
  delete(path: string): void;
}

export interface DocStore {
  get(path: string): Promise<DocRecord | null>;
  set(path: string, data: DocData, opts?: { merge?: boolean }): Promise<void>;
  /** Throws when the document is missing. */
  update(path: string, patch: DocData): Promise<void>;
  delete(path: string): Promise<boolean>;
  list(collection: string): Promise<DocRecord[]>;
  query(collection: string, where: Where[], opts?: { limit?: number }): Promise<DocRecord[]>;
  collectionGroup(name: string, where: Where[], opts?: { limit?: number }): Promise<DocRecord[]>;
  transact<T>(fn: (tx: DocTx) => Promise<T>): Promise<T>;
  batch(ops: BatchOp[]): Promise<void>;
  deleteTree(prefix: string): Promise<number>;
}

export type BlobStat = {
  key: string;
  size: number;
  contentType: string;
  updatedAt: number;
};

export interface BlobStorage {
  put(key: string, data: Uint8Array, opts: { contentType: string }): Promise<BlobStat>;
  get(key: string): Promise<{ data: Uint8Array; stat: BlobStat } | null>;
  stat(key: string): Promise<BlobStat | null>;
  stream(key: string, range?: { start: number; end: number }): Promise<AsyncIterable<Uint8Array> | null>;
  delete(key: string): Promise<boolean>;
  /** Deletes every object whose key is `prefix` or starts with `prefix`. */
  deletePrefix(prefix: string): Promise<number>;
}

export type TaskQueue = 'ai-user' | 'ai-auto' | 'ai-background' | 'tts';

export type TaskKind =
  | 'course.structure'
  | 'chapter.write'
  | 'lesson.plan'
  | 'segment.voice'
  | 'lesson.retime'
  | 'segment.build'
  | 'lesson.finalize'
  | 'segment.narrate';

export type WorkPriority = {
  userClicked?: boolean;
  courseId?: string;
  kind?: 'auto' | 'chapter' | 'background';
  enqueuedAt?: number;
  index?: number;
};

export type TaskPayload = {
  uid: string;
  courseId: string;
  chapterId?: string;
  lessonId?: string;
  segmentId?: string;
  gen?: number;
  priority?: WorkPriority;
  epoch?: number;
  jobId?: string;
  prompt?: string;
  /** Rerender wipes segments. A retry leaves ready segments alone. */
  force?: boolean;
};

export type TaskRequest = {
  kind: TaskKind;
  payload: TaskPayload;
  queue: TaskQueue;
  dedupeKey?: string;
  delaySeconds?: number;
};

export interface TaskDispatcher {
  dispatch(task: TaskRequest): Promise<{ taskId: string; deduped: boolean }>;
}

export type AuthUser = { uid: string; email?: string };

export type RequestCtx = {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  url: string;
};

/** Throws 401 or 403. `renders` accepts `?token=` and skips App Check (GET /api/renders/:id only). */
export interface AuthVerifier {
  verify(req: RequestCtx, opts?: { renders?: boolean }): Promise<AuthUser>;
}

export type PipelineEmit = Omit<PipelineEvent, 'seq' | 'ts'> & {
  flow?: string;
  step?: string;
};

export interface Notifier {
  emit(event: PipelineEmit): Promise<void>;
}

export type CancelScope = {
  uid: string;
  courseId: string;
  lessonId?: string;
  segmentId?: string;
  epoch?: number;
};

export interface Coordination {
  isCancelled(scope: CancelScope): Promise<boolean>;
  requestCancel(scope: CancelScope): Promise<void>;
  getViewedCourse(uid: string): Promise<string | null>;
  setViewedCourse(uid: string, courseId: string | null): Promise<void>;
  acquireLease(path: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(path: string, owner: string): Promise<void>;
}

export interface Clock {
  now(): number;
}

export interface KeyframeRenderer {
  renderStills(input: {
    uid: string;
    lessonId: string;
    segmentId: string;
    attempt: number;
    round: number;
    segment: GeneratedSegment;
    priority?: WorkPriority;
  }): Promise<{ frames: number[]; keys: string[] }>;
  health(): Promise<{ ok: boolean; error?: string }>;
}

/** Raw synthesizer. Caching lives in the pipeline. */
export interface TtsClient {
  synthesize(text: string, opts: { voice: string; rate: number; priority?: WorkPriority }): Promise<{ data: Uint8Array; seconds: number }>;
  health(): Promise<{ ok: boolean; error?: string }>;
}

export type ModelFile = {
  data: Uint8Array;
  mimeType: string;
  full?: boolean;
  pages?: { start: number; end: number; total: number };
};

/** Injectable so tests run with no Gemini. */
export interface ModelClient {
  generateJson(req: {
    prompt: string;
    files: ModelFile[];
    model: string;
    responseSchema: Record<string, unknown>;
    long?: boolean;
    callType: string;
    priority: WorkPriority;
  }): Promise<{ text: string; finishReason?: string; usage?: { prompt?: number; output?: number; total?: number; thinking_tokens?: number } }>;
}

/**
 * Temporary, until the local WebSocket transport moves behind Notifier.
 * Coordination's cancel and viewed-course methods replace the rest.
 */
export interface EventBus {
  emit(event: PipelineEmit): PipelineEvent;
  subscribe(courseId: string, listener: (event: PipelineEvent) => void): () => void;
  beginRun(courseId: string): string;
  endRun(courseId: string, runId: string): void;
  requestCancel(courseId: string, lessonId?: string, segmentId?: string): void;
  isCancelled(courseId: string, lessonId?: string, segmentId?: string): boolean;
  viewedCourse(): string | null;
  setViewedCourse(courseId: string | null): void;
}

/** Temporary local job runner. Cloud Tasks uses TaskDispatcher. */
export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown> | unknown;

export interface JobQueue {
  register(kind: string, handler: JobHandler): void;
  submit(owner: string, kind: string, payload: Record<string, unknown>): string | Promise<string>;
}

/** Temporary header stub. Firebase Auth uses AuthVerifier. */
export interface AuthProvider {
  currentUser(header: string | string[] | undefined): AuthUser;
}
