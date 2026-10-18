import type { AuthProvider, BlobStorage, Coordination, DocStore, EventBus, JobQueue } from '@krayon/shared';
import type { Pipeline, UsageCaps } from '@krayon/pipeline';

export type ApiLogger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warning: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>, error?: unknown) => void;
};

export type ApiDeps = {
  docs: DocStore;
  blobs: BlobStorage;
  jobs: JobQueue;
  events: EventBus;
  pipeline: Pipeline;
  auth: AuthProvider;
  coordination: Coordination;
  log: ApiLogger;
  requestId: () => string | undefined;
  maxUploadBytes: number;
  corsOrigins: string[];
  caps: UsageCaps;
  adcFailure: () => Promise<string | null>;
  health: () => Record<string, unknown>;
};
