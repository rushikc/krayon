import type { PipelineEvent } from './events.js';

export type DocRecord = {
  id: string;
  data: Record<string, unknown>;
  updatedAt: number;
};

export interface DocStore {
  get(docPath: string): DocRecord | null;
  set(docPath: string, data: Record<string, unknown>, merge?: boolean): DocRecord;
  delete(docPath: string): boolean;
  list(collection: string): DocRecord[];
  clear(): Record<string, number>;
}

export type BlobMeta = {
  id: string;
  name: string;
  content_type: string;
  size: number;
  path: string;
};

export interface BlobStorage {
  put(owner: string, name: string, contentType: string, data: Uint8Array): BlobMeta;
  get(owner: string, blobId: string): { blob: BlobMeta; data: Uint8Array } | null;
  clear(): { files: number; bytes: number };
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<unknown> | unknown;

export interface JobQueue {
  register(kind: string, handler: JobHandler): void;
  submit(owner: string, kind: string, payload: Record<string, unknown>): string;
}

export type AuthUser = { uid: string; email: string };

export interface AuthProvider {
  currentUser(header: string | string[] | undefined): AuthUser;
}

export type PipelineEmit = Omit<PipelineEvent, 'seq' | 'ts'> & {
  flow?: string;
  step?: string;
};

export interface EventBus {
  emit(event: PipelineEmit): PipelineEvent;
  subscribe(courseId: string, listener: (event: PipelineEvent) => void): () => void;
  beginRun(courseId: string): string;
  endRun(courseId: string, runId: string): void;
  requestCancel(courseId: string, topicId?: string, segmentId?: string): void;
  isCancelled(courseId: string, topicId?: string, segmentId?: string): boolean;
}
