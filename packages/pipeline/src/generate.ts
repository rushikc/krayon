import { GenerationError, issuesText, toGenerationError, zodIssues } from '@krayon/shared';
import type { GenerationErrorCode, GenerationIssue } from '@krayon/shared';
import type { z } from 'zod';
import type { PipelineLogger } from './gemini.js';

/** Characters of raw model output kept in attempt logs. */
export const RAW_LOG_CHARS = 1500;

export const readModelJson = (text: string) =>
  JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')) as unknown;

export type ValidatedRequest<T> = {
  /** Log label: roadmap, lesson, segment, repair, review, api. */
  name: string;
  prompt: string;
  /** One model call; transport retries (429/5xx/MAX_TOKENS) happen inside it. `attempt` starts at 1. */
  generate: (prompt: string, attempt: number) => Promise<string>;
  schema: z.ZodType<T>;
  /** Extra checks after zod, such as validateSegment. Issues trigger another attempt. */
  check?: (value: T, attempt: number, attempts: number) => GenerationIssue[];
  /** Total model calls, at least 1. */
  attempts: number;
  /** Builds the next prompt from the issues and the last parsed value (undefined when not JSON). */
  retryPrompt?: (issues: GenerationIssue[], previous: unknown) => string;
  /** Return the best zod-valid value even if `check` still reports issues. */
  acceptBest?: boolean;
  log: PipelineLogger;
  /** courseId, topicId, segmentId... added to every log line. */
  fields?: Record<string, unknown>;
};

export type Validated<T> = { value: T; issues: GenerationIssue[]; attempts: number };

const defaultRetry = (prompt: string) => (issues: GenerationIssue[], previous: unknown) =>
  `${prompt}

Your previous response could not be used:
${issues.map((issue) => `- ${issue.path}: ${issue.message}`).join('\n')}
${previous === undefined ? 'Return exactly one JSON object.' : 'Return one corrected JSON object. Fill every required field for the chosen layout type.'}`;

/**
 * Calls the model, parses JSON, validates with zod (+ optional check), and retries with the
 * path-qualified issues fed back. Every failed attempt is logged at warn (event ai.attempt);
 * the final failure at error (event ai.failed). Throws GenerationError.
 */
export const generateValidated = async <T>(request: ValidatedRequest<T>): Promise<Validated<T>> => {
  const { log, name } = request;
  const attempts = Math.max(1, request.attempts);
  const retryPrompt = request.retryPrompt ?? defaultRetry(request.prompt);
  const warn = log.warn ?? log.info;
  let prompt = request.prompt;
  let code: GenerationErrorCode = 'SCHEMA_INVALID';
  let issues: GenerationIssue[] = [];
  let best: { value: T; issues: GenerationIssue[] } | undefined;

  const fail = (error: GenerationError) => {
    log.error(`AI ${name} failed after ${error.attempts} attempt(s): ${error.code} ${error.message}`, {
      ...request.fields,
      event: 'ai.failed',
      schema: name,
      code: error.code,
      attempts: error.attempts,
      issues: error.issues.slice(0, 10),
    });
    return error;
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let text: string;
    try {
      text = await request.generate(prompt, attempt);
    } catch (error) {
      if (error instanceof Error && error.name === 'Cancelled') throw error;
      throw fail(toGenerationError(error, attempt));
    }

    let value: unknown;
    let parsedJson = true;
    try {
      value = readModelJson(text);
    } catch {
      parsedJson = false;
    }
    let previous: unknown = value;
    if (!parsedJson) {
      code = 'NOT_JSON';
      issues = [{ path: 'response', message: 'The model did not return JSON.' }];
      previous = undefined;
    } else {
      const parsed = request.schema.safeParse(value);
      code = 'SCHEMA_INVALID';
      if (!parsed.success) {
        issues = zodIssues(parsed.error);
      } else {
        const extra = request.check?.(parsed.data, attempt, attempts) ?? [];
        if (extra.length === 0) {
          if (attempt > 1) {
            log.info(`AI ${name} valid on attempt ${attempt}`, { ...request.fields, event: 'ai.repaired', schema: name, attempt });
          }
          return { value: parsed.data, issues: [], attempts: attempt };
        }
        if (!best || extra.length <= best.issues.length) best = { value: parsed.data, issues: extra };
        previous = parsed.data;
        issues = extra;
      }
    }

    warn(`AI ${name} attempt ${attempt}/${attempts} invalid: ${code} ${issuesText(issues, 3)}`, {
      ...request.fields,
      event: 'ai.attempt',
      schema: name,
      attempt,
      max_attempts: attempts,
      code,
      issues: issues.slice(0, 10),
      raw: text.slice(0, RAW_LOG_CHARS),
    });
    if (attempt < attempts) prompt = retryPrompt(issues, previous);
  }

  if (best && request.acceptBest) {
    log.info(`AI ${name} kept the best value with ${best.issues.length} issue(s)`, {
      ...request.fields,
      event: 'ai.accepted',
      schema: name,
      attempts,
      issues: best.issues.slice(0, 10),
    });
    return { value: best.value, issues: best.issues, attempts };
  }
  throw fail(new GenerationError(code, issues, attempts));
};
