import type { z } from 'zod';

/** Why a model call did not produce a usable value. */
export type GenerationErrorCode = 'SCHEMA_INVALID' | 'NOT_JSON' | 'MAX_TOKENS' | 'UPSTREAM' | 'TIMEOUT';

export type GenerationIssue = { path: string; message: string };

/** Stored on failed segment/topic docs, sent on *.failed events and in /api/ai/generate error bodies. */
export type GenerationErrorInfo = {
  code: GenerationErrorCode;
  message: string;
  issues: GenerationIssue[];
  attempts: number;
};

export class GenerationError extends Error {
  readonly code: GenerationErrorCode;
  readonly issues: GenerationIssue[];
  readonly attempts: number;

  constructor(code: GenerationErrorCode, issues: GenerationIssue[], attempts: number, options?: { cause?: unknown }) {
    super(issuesText(issues) || code, options);
    this.name = 'GenerationError';
    this.code = code;
    this.issues = issues;
    this.attempts = attempts;
  }

  toInfo(): GenerationErrorInfo {
    return { code: this.code, message: this.message, issues: this.issues, attempts: this.attempts };
  }
}

export const zodIssues = (error: z.ZodError, prefix = ''): GenerationIssue[] =>
  error.issues.map((issue) => ({
    path: [prefix, ...issue.path.map(String)].filter(Boolean).join('.') || 'response',
    message: issue.message,
  }));

/** "scene.layout.title: Invalid input: expected string, received undefined; ..." */
export const issuesText = (issues: GenerationIssue[], limit = 5) =>
  issues
    .slice(0, limit)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ') + (issues.length > limit ? `; and ${issues.length - limit} more` : '');

/** 422 when the model answered but the answer is unusable, 502 when the upstream call failed. */
export const generationErrorStatus = (code: GenerationErrorCode) => (code === 'SCHEMA_INVALID' || code === 'NOT_JSON' ? 422 : 502);

/** Classifies an exception from a model call (after transport retries). */
export const generationErrorCode = (error: unknown): GenerationErrorCode => {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/MAX_TOKENS/i.test(text)) return 'MAX_TOKENS';
  if (/AbortError|aborted|timed? ?out|DEADLINE_EXCEEDED/i.test(text)) return 'TIMEOUT';
  return 'UPSTREAM';
};

export const toGenerationError = (error: unknown, attempts = 1): GenerationError => {
  if (error instanceof GenerationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new GenerationError(generationErrorCode(error), [{ path: 'response', message: message.slice(0, 500) }], attempts, { cause: error });
};
