import { genkit } from 'genkit';
import { googleAI, vertexAI } from '@genkit-ai/google-genai';
import {
  GenerationError,
  orderTopics,
  reviewSchema,
  roadmapSchema,
  segmentModelSchema,
  toGenerationError,
  validateSegment,
  zodIssues,
} from '@krayon/shared';
import type {
  BlobStorage,
  DocStore,
  EventBus,
  GeneratedSegment,
  GenerationErrorInfo,
  GenerationIssue,
  RoadmapTopic,
} from '@krayon/shared';
import { z } from 'zod';
import {
  assembleCourse,
  coursePath,
  responseSchemas,
  reviewResponseSchema,
  roundPath,
  saveLesson,
  segmentPath,
  topicPath,
} from './courses.js';
import {
  GENERATE_TIMEOUT_MS,
  GeminiNotConfigured,
  MAX_OUTPUT_TOKENS,
  createGemini,
  runGeminiCall,
  thinkingConfigFor,
} from './gemini.js';
import { SAFETY_MESSAGE, applyStepFailure, classifyStepFailure, courseResult } from './outcomes.js';
import type { GeminiConfig, GeminiFile, PipelineLogger } from './gemini.js';
import { generateValidated } from './generate.js';
import type { ValidatedRequest } from './generate.js';
import {
  lessonPrompt,
  repairPrompt,
  retrySegmentPrompt,
  reviewPrompt,
  roadmapPrompt,
  segmentPrompt,
} from './prompts.js';
import type { SegmentLike } from './prompts.js';
import { createRenderer } from './render.js';

export class Cancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'Cancelled';
  }
}

export type PipelineConfig = GeminiConfig & {
  reviewModel: string;
  maxRepairRounds: number;
  maxReviewRounds: number;
  reviewPassScore: number;
  topicConcurrency: number;
  renderKeyframesMax: number;
  renderTimeoutMs: number;
  remotionEntry: string;
};

export type PipelineDeps = {
  docs: DocStore;
  blobs: BlobStorage;
  events: EventBus;
  config: PipelineConfig;
  log: PipelineLogger;
};

const looseLessonSchema = z.object({
  studyDoc: z.string().default(''),
  segments: z.array(z.unknown()).min(1),
});

/** Review output is parsed loosely; patchedSegment is validated separately in the fix step. */
const reviewModelSchema = reviewSchema.extend({ patchedSegment: z.unknown().optional() });

/** validateSegment issues as generation issues (path + message). */
const sceneIssues = (segment: GeneratedSegment): GenerationIssue[] =>
  validateSegment(segment).map(({ path, message }) => ({ path, message }));

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Retry prompt for one segment: repair the last attempt (or the fallback when it was not JSON). */
const segmentRetry = (fallback: SegmentLike) => (issues: GenerationIssue[], previous: unknown) =>
  repairPrompt(asRecord(previous) ?? fallback, issues);

const isCancelled = (error: unknown) => error instanceof Cancelled;

const keepId = (segment: GeneratedSegment, id: string): GeneratedSegment => ({ ...segment, id });

const slugifySegments = (segments: unknown[]) => {
  const used = new Set<string>();
  return segments.map((raw, index) => {
    const record = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
    const source = typeof record.id === 'string' && record.id.trim() ? record.id : `segment-${index + 1}`;
    const base = source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `segment-${index + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    used.add(id);
    record.id = id;
    return record;
  });
};

export const createPipeline = (deps: PipelineDeps) => {
  const { docs, blobs, events, config, log } = deps;
  const gemini = createGemini(config, log);
  const renderer = createRenderer(config.remotionEntry, blobs, config.renderKeyframesMax, {
    timeoutMs: config.renderTimeoutMs,
  });
  const plugin = config.useVertex && config.project ? 'vertexai' : 'googleai';
  const ai = genkit({
    plugins: [
      config.useVertex && config.project
        ? vertexAI({ projectId: config.project, location: config.location })
        : googleAI({ apiKey: config.apiKey || 'missing' }),
    ],
  });

  const assertNotCancelled = (courseId: string, topicId?: string, segmentId?: string) => {
    if (events.isCancelled(courseId, topicId, segmentId)) throw new Cancelled();
  };

  const loadSources = (uid: string, ids: string[]): GeminiFile[] =>
    ids.map((id) => {
      const blob = blobs.get(uid, id);
      if (!blob) throw new Error(`Missing source ${id}`);
      return { data: blob.data, mimeType: blob.blob.content_type || 'application/octet-stream' };
    });

  const toParts = (prompt: string, files: GeminiFile[]) => {
    const parts: Array<{ text: string } | { media: { url: string; contentType: string } }> = [];
    for (const file of files) {
      const mime = file.mimeType || 'application/octet-stream';
      parts.push({
        media: { contentType: mime, url: `data:${mime};base64,${Buffer.from(file.data).toString('base64')}` },
      });
    }
    parts.push({ text: prompt });
    return parts;
  };

  const generateText = async (prompt: string, files: GeminiFile[], model: string, responseSchema: Record<string, unknown>) => {
    const response = await runGeminiCall({
      model,
      log,
      call: async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
        try {
          return await ai.generate({
            model: `${plugin}/${model}`,
            prompt: toParts(prompt, files),
            config: {
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              ...thinkingConfigFor(model),
            },
            output: { jsonSchema: responseSchema },
            abortSignal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      },
      outcome: (value) => ({
        finishReason: value.finishReason === 'length' ? 'MAX_TOKENS' : value.finishReason,
        usage: value.usage
          ? { prompt: value.usage.inputTokens, output: value.usage.outputTokens, total: value.usage.totalTokens }
          : undefined,
      }),
    });
    return response.text;
  };

  type ModelRequest<T> = Omit<ValidatedRequest<T>, 'generate' | 'log' | 'attempts'> & {
    responseSchema: Record<string, unknown>;
    uid: string;
    sourceIds: string[];
    model?: string;
    extraFiles?: GeminiFile[];
    attempts?: number;
  };

  /** One validated model call (see generateValidated): JSON + zod + optional check, with retries and logs. */
  const modelJson = <T>(request: ModelRequest<T>) => {
    const files = [...loadSources(request.uid, request.sourceIds), ...(request.extraFiles ?? [])];
    const model = request.model ?? config.model;
    return generateValidated({
      ...request,
      attempts: request.attempts ?? 2,
      generate: (prompt) => generateText(prompt, files, model, request.responseSchema),
      log,
    });
  };

  /** Model calls allowed to repair one segment: the first try plus maxRepairRounds retries. */
  const repairAttempts = () => Math.max(0, config.maxRepairRounds) + 1;

  const failSegment = (input: {
    uid: string;
    courseId: string;
    topicId: string;
    segmentId: string;
    failure: GenerationErrorInfo;
    flow: string;
    /** Replace the doc (fresh draft) instead of merging into it. */
    doc?: Record<string, unknown>;
  }) => {
    const { uid, courseId, topicId, segmentId, failure, flow } = input;
    const path = segmentPath(uid, courseId, topicId, segmentId);
    const fields = { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure };
    if (input.doc) docs.set(path, { ...input.doc, ...fields });
    else docs.set(path, fields, true);
    events.emit({
      type: 'segment.failed',
      courseId,
      topicId,
      segmentId,
      error: failure.message,
      errorInfo: failure,
      flow,
      step: 'failed',
    });
  };

  /** Turns any thrown error into stored failure info; logs errors that generateValidated did not log. */
  const failureOf = (error: unknown, fields: Record<string, unknown>): GenerationErrorInfo => {
    const failure = toGenerationError(error).toInfo();
    if (!(error instanceof GenerationError)) {
      log.error(`Generation step failed: ${failure.message}`, { ...fields, event: 'ai.failed', code: failure.code }, error);
    }
    return failure;
  };

  type LoopInput = {
    uid: string;
    courseId: string;
    topic: RoadmapTopic;
    segment: GeneratedSegment;
    sourceIds: string[];
    prompt?: string;
    restoreOnFailure?: boolean;
  };

  const segmentLoop = ai.defineFlow('segmentLoop', async (raw) => {
    const input = raw as LoopInput;
    const { uid, courseId, topic, sourceIds } = input;
    assertNotCancelled(courseId, topic.id, input.segment.id);
    let current = input.segment;
    const fields = { courseId, topicId: topic.id, segmentId: input.segment.id };
    try {
      if (input.prompt) {
        const prompt = input.prompt;
        current = await ai.run('rewrite', async () => {
          const next = await modelJson({
            name: 'segment',
            schema: segmentModelSchema,
            responseSchema: responseSchemas.segment,
            prompt: segmentPrompt(topic, current, prompt),
            retryPrompt: segmentRetry(current),
            check: sceneIssues,
            acceptBest: true,
            attempts: repairAttempts(),
            uid,
            sourceIds,
            fields,
          });
          return keepId(next.value, input.segment.id);
        });
      }

      current = await ai.run('check', async () => {
        events.emit({ type: 'segment.check', courseId, topicId: topic.id, segmentId: current.id, flow: 'segmentLoop', step: 'check' });
        docs.set(segmentPath(uid, courseId, topic.id, current.id), { status: 'checking', statusDetail: 'Checking the segment' }, true);
        let best = current;
        let issues = sceneIssues(best);
        let rounds = 0;
        if (issues.length > 0 && config.maxRepairRounds > 0) {
          assertNotCancelled(courseId, topic.id, current.id);
          try {
            const next = await modelJson({
              name: 'repair',
              schema: segmentModelSchema,
              responseSchema: responseSchemas.segment,
              prompt: repairPrompt(best, issues),
              retryPrompt: segmentRetry(best),
              check: sceneIssues,
              acceptBest: true,
              attempts: config.maxRepairRounds,
              uid,
              sourceIds,
              fields,
            });
            rounds = next.attempts;
            if (next.issues.length <= issues.length) {
              best = keepId(next.value, input.segment.id);
              issues = next.issues;
            }
          } catch (error) {
            if (isCancelled(error)) throw error;
            const failure = failureOf(error, fields);
            (log.warn ?? log.info)(`Repair failed, keeping the previous segment: ${failure.message}`, {
              ...fields,
              event: 'segment.repair',
              code: failure.code,
              issues: failure.issues.slice(0, 10),
            });
          }
        }
        return { ...best, debug: { issues: validateSegment(best), repairRounds: rounds } };
      });
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = failureOf(error, fields);
      log.error(`Segment failed: ${failure.code} ${failure.message}`, {
        ...fields,
        event: 'segment.failed',
        code: failure.code,
        attempts: failure.attempts,
        issues: failure.issues.slice(0, 10),
      });
      if (input.restoreOnFailure) throw error;
      if (classifyStepFailure(error).status === 'blocked') {
        applyStepFailure(docs, uid, courseId, topic.id, input.segment.id, current, error);
        events.emit({
          type: 'segment.failed',
          courseId,
          topicId: topic.id,
          segmentId: input.segment.id,
          error: SAFETY_MESSAGE,
          flow: 'segmentLoop',
          step: 'blocked',
        });
        return null;
      }
      failSegment({ uid, courseId, topicId: topic.id, segmentId: input.segment.id, failure, flow: 'segmentLoop' });
      return null;
    }

    let best = current;
    let bestScore = -1;
    let bestIssues = validateSegment(current).length;

    for (let round = 1; round <= config.maxReviewRounds; round += 1) {
      assertNotCancelled(courseId, topic.id, current.id);
      try {
        const rendered = await ai.run('render', async () => {
          const detail = 'Rendering keyframes';
          if (!input.restoreOnFailure) docs.set(topicPath(uid, courseId, topic.id), { statusDetail: detail }, true);
          docs.set(segmentPath(uid, courseId, topic.id, current.id), { status: 'rendering', statusDetail: detail }, true);
          events.emit({
            type: 'segment.render',
            courseId,
            topicId: topic.id,
            segmentId: current.id,
            round,
            detail,
            flow: 'segmentLoop',
            step: 'render',
          });
          return renderer.renderKeyframes(uid, current);
        });
        const review = await ai.run('review', async () => {
          const detail = `reviewing round ${round} of ${config.maxReviewRounds}`;
          // Regenerate/retry of one segment leaves a ready topic ready, so its lesson stays visible.
          if (!input.restoreOnFailure) docs.set(topicPath(uid, courseId, topic.id), { status: 'reviewing', statusDetail: detail }, true);
          docs.set(segmentPath(uid, courseId, topic.id, current.id), { status: 'reviewing', statusDetail: detail }, true);
          const keyframes = rendered.keyframeIds.map((id) => {
            const blob = blobs.get(uid, id);
            if (!blob) throw new Error(`Missing keyframe ${id}`);
            return { data: blob.data, mimeType: 'image/png' };
          });
          const result = await modelJson({
            name: 'review',
            schema: reviewModelSchema,
            responseSchema: reviewResponseSchema,
            prompt: reviewPrompt(current, rendered.frames),
            model: config.reviewModel,
            extraFiles: keyframes,
            uid,
            sourceIds,
            fields: { ...fields, round },
          });
          return result.value;
        });
        const issueCount = validateSegment(current).length;
        if (issueCount < bestIssues || (issueCount === bestIssues && review.score >= bestScore)) {
          best = current;
          bestScore = review.score;
          bestIssues = issueCount;
        }
        let fixed = false;
        const passing = review.score >= config.reviewPassScore;
        if (!passing && review.patchedSegment && round < config.maxReviewRounds) {
          const patched = await ai.run('fix', async () => {
            const checked = segmentModelSchema.safeParse(review.patchedSegment);
            if (!checked.success) {
              log.info('Review patch rejected', { ...fields, event: 'segment.fix', round, issues: zodIssues(checked.error).slice(0, 10) });
              return null;
            }
            const next = keepId(checked.data, input.segment.id);
            const issues = sceneIssues(next);
            if (issues.length > 0) {
              log.info('Review patch rejected', { ...fields, event: 'segment.fix', round, issues: issues.slice(0, 10) });
              return null;
            }
            events.emit({ type: 'segment.fixed', courseId, topicId: topic.id, segmentId: current.id, round, fixed: true, flow: 'segmentLoop', step: 'fix' });
            return next;
          });
          if (patched) {
            fixed = true;
            current = patched;
          }
        }
        docs.set(roundPath(uid, courseId, topic.id, current.id, round), {
          segment: fixed ? current : best,
          issues: review.issues,
          score: review.score,
          pass: review.pass,
          fixed,
          keyframeIds: rendered.keyframeIds,
        });
        events.emit({
          type: 'segment.review',
          courseId,
          topicId: topic.id,
          segmentId: current.id,
          round,
          score: review.score,
          pass: review.pass,
          fixed,
          detail: `reviewing round ${round} of ${config.maxReviewRounds}`,
          flow: 'segmentLoop',
          step: 'review',
        });
        if (passing || !fixed) break;
      } catch (error) {
        if (isCancelled(error)) throw error;
        const outcome = applyStepFailure(docs, uid, courseId, topic.id, current.id, best, error);
        log.error(`Review stopped: ${outcome.status} ${outcome.message}`, {
          ...fields,
          event: 'segment.review',
          round,
          status: outcome.status,
          error: outcome.message,
        }, error instanceof GenerationError ? undefined : error);
        if (outcome.status === 'blocked') {
          events.emit({
            type: 'segment.failed',
            courseId,
            topicId: topic.id,
            segmentId: current.id,
            error: outcome.message,
            flow: 'segmentLoop',
            step: 'blocked',
          });
          return null;
        }
        return best;
      }
    }

    docs.set(segmentPath(uid, courseId, topic.id, best.id), {
      title: best.title,
      status: 'ready',
      statusDetail: null,
      error: null,
      errorInfo: null,
      draft: null,
      segment: best,
    }, true);
    events.emit({ type: 'segment.ready', courseId, topicId: topic.id, segmentId: best.id, flow: 'segmentLoop', step: 'ready' });
    return best;
  });

  const lessonFlow = ai.defineFlow('lessonFlow', async (raw) => {
    const { uid, courseId, topic, sourceIds } = raw as {
      uid: string;
      courseId: string;
      topic: RoadmapTopic;
      sourceIds: string[];
    };
    assertNotCancelled(courseId, topic.id);
    events.emit({ type: 'topic.started', courseId, topicId: topic.id, flow: 'lessonFlow', step: 'started' });
    docs.set(topicPath(uid, courseId, topic.id), { status: 'generating', statusDetail: 'Writing the lesson', error: null, errorInfo: null }, true);
    const topicFields = { courseId, topicId: topic.id };
    const failTopic = (failure: GenerationErrorInfo) => {
      log.error(`Topic failed: ${failure.code} ${failure.message}`, { ...topicFields, event: 'topic.failed', code: failure.code, issues: failure.issues.slice(0, 10) });
      docs.set(topicPath(uid, courseId, topic.id), { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, true);
      events.emit({ type: 'topic.failed', courseId, topicId: topic.id, error: failure.message, errorInfo: failure, flow: 'lessonFlow', step: 'failed' });
    };
    try {
      const draft = await ai.run('draft', async () => {
        const result = await modelJson({
          name: 'lesson',
          schema: looseLessonSchema,
          responseSchema: responseSchemas.lesson,
          prompt: lessonPrompt(topic),
          uid,
          sourceIds,
          fields: topicFields,
        });
        return result.value;
      });
      events.emit({ type: 'lesson.drafted', courseId, topicId: topic.id, flow: 'lessonFlow', step: 'draft' });
      const slugged = slugifySegments(draft.segments);
      let cancelled = false;
      const finished = await Promise.all(slugged.map(async (record, index) => {
        if (cancelled) return null;
        const id = String(record.id);
        const fields = { ...topicFields, segmentId: id };
        const title = typeof record.title === 'string' && record.title ? record.title : id;
        try {
          assertNotCancelled(courseId, topic.id, id);
          const parsed = segmentModelSchema.safeParse(record);
          let segment = parsed.success ? keepId(parsed.data, id) : null;
          const issues = segment ? sceneIssues(segment) : zodIssues(parsed.error!);
          if (issues.length > 0) {
            (log.warn ?? log.info)(`Draft segment ${id} invalid: ${issues.slice(0, 3).map((i) => `${i.path}: ${i.message}`).join('; ')}`, {
              ...fields,
              event: 'segment.invalid',
              issues: issues.slice(0, 10),
              raw: JSON.stringify(record).slice(0, 1500),
            });
            const base: SegmentLike = segment ?? record;
            try {
              if (config.maxRepairRounds <= 0) throw new GenerationError('SCHEMA_INVALID', issues, 0);
              const repaired = await modelJson({
                name: 'repair',
                schema: segmentModelSchema,
                responseSchema: responseSchemas.segment,
                prompt: repairPrompt(base, issues),
                retryPrompt: segmentRetry(base),
                check: sceneIssues,
                attempts: repairAttempts(),
                uid,
                sourceIds,
                fields,
              });
              segment = keepId(repaired.value, id);
            } catch (error) {
              if (isCancelled(error)) throw error;
              const failure = failureOf(error, fields);
              failSegment({
                uid,
                courseId,
                topicId: topic.id,
                segmentId: id,
                failure,
                flow: 'lessonFlow',
                doc: { title, order: index, segment: null, draft: record },
              });
              return null;
            }
          }
          if (!segment) return null;
          docs.set(segmentPath(uid, courseId, topic.id, segment.id), {
            title: segment.title,
            status: 'checking',
            statusDetail: null,
            segment,
            order: index,
          });
          return await segmentLoop({ uid, courseId, topic, segment, sourceIds });
        } catch (error) {
          if (error instanceof Cancelled) {
            cancelled = true;
            return null;
          }
          throw error;
        }
      }));
      if (cancelled || events.isCancelled(courseId, topic.id)) throw new Cancelled();
      const segments = finished.filter((item): item is GeneratedSegment => Boolean(item));
      if (segments.length === 0) {
        failTopic({
          code: 'SCHEMA_INVALID',
          message: 'No usable segments',
          issues: [{ path: 'segments', message: 'Every segment failed; see the segment errors' }],
          attempts: 1,
        });
        return null;
      }
      const lesson = { studyDoc: draft.studyDoc, segments };
      saveLesson(docs, uid, courseId, topic.id, lesson);
      events.emit({ type: 'topic.ready', courseId, topicId: topic.id, lesson, flow: 'lessonFlow', step: 'ready' });
      return lesson;
    } catch (error) {
      if (isCancelled(error)) throw error;
      failTopic(failureOf(error, topicFields));
      return null;
    }
  });

  const busyPhase = new Set(['generating', 'checking', 'reviewing']);
  const drainTails = new Map<string, Promise<void>>();

  const oldestQueued = (uid: string, courseId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    if (!course) return null;
    const rows = docs
      .list(`${coursePath(uid, courseId)}/topics`)
      .filter((row) => row.data.status === 'queued')
      .sort((a, b) => Number(a.data.enqueuedAt ?? 0) - Number(b.data.enqueuedAt ?? 0) || a.id.localeCompare(b.id));
    const id = rows[0]?.id;
    if (!id) return null;
    const topic = course.roadmap?.topics.find((item) => item.id === id) ?? course.topics.find((item) => item.id === id);
    if (!topic) return null;
    return {
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      prerequisites: topic.prerequisites,
      sourcePages: topic.sourcePages,
    };
  };

  const settleCourse = (uid: string, courseId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    if (!course) return;
    const open = new Set(['idle', 'queued', 'generating', 'checking', 'reviewing']);
    if (course.topics.some((topic) => open.has(topic.status))) {
      const running = course.topics.some((topic) => topic.status !== 'idle' && topic.status !== 'ready' && topic.status !== 'failed');
      docs.set(coursePath(uid, courseId), { status: running ? 'generating' : 'lessons' }, true);
      return;
    }
    const result = courseResult(course.topics);
    docs.set(coursePath(uid, courseId), { status: result.status, error: result.error }, true);
    events.emit({
      type: result.type,
      courseId,
      error: result.error ?? undefined,
      failedTopics: result.failedTopics,
      flow: 'roadmapFlow',
      step: result.status,
    });
  };

  const drainOnce = async (uid: string, courseId: string) => {
    for (;;) {
      if (events.isCancelled(courseId)) return;
      const course = assembleCourse(docs, uid, courseId);
      if (!course) return;
      if (course.topics.some((topic) => busyPhase.has(topic.status))) return;
      const next = oldestQueued(uid, courseId);
      if (!next) {
        settleCourse(uid, courseId);
        return;
      }
      try {
        await lessonFlow({ uid, courseId, topic: next, sourceIds: course.sources.map((source) => source.id) });
      } catch (error) {
        if (isCancelled(error)) return;
        throw error;
      }
    }
  };

  const drainCourse = (uid: string, courseId: string) => {
    const prev = drainTails.get(courseId) ?? Promise.resolve();
    const next = prev.then(() => drainOnce(uid, courseId), () => drainOnce(uid, courseId));
    const tracked = next.finally(() => {
      if (drainTails.get(courseId) === tracked) drainTails.delete(courseId);
    });
    drainTails.set(courseId, tracked);
    return tracked;
  };

  const roadmapFlow = ai.defineFlow('roadmapFlow', async (raw) => {
    const { uid, courseId } = raw as { uid: string; courseId: string };
    const course = assembleCourse(docs, uid, courseId);
    if (!course) throw new Error('Course not found');
    const sourceIds = course.sources.map((source) => source.id);
    events.emit({ type: 'roadmap.started', courseId, flow: 'roadmapFlow', step: 'started' });
    docs.set(coursePath(uid, courseId), { status: 'roadmap' }, true);
    let roadmap: z.infer<typeof roadmapSchema>;
    try {
      roadmap = await ai.run('draft', async () => {
        const result = await modelJson({
          name: 'roadmap',
          schema: roadmapSchema,
          responseSchema: responseSchemas.roadmap,
          prompt: roadmapPrompt,
          uid,
          sourceIds,
          fields: { courseId },
        });
        return result.value;
      });
    } catch (error) {
      if (isCancelled(error)) return null;
      const failure = failureOf(error, { courseId });
      log.error(`Course failed: ${failure.code} ${failure.message}`, { courseId, event: 'course.failed', code: failure.code });
      docs.set(coursePath(uid, courseId), { status: 'failed', error: failure.message, errorInfo: failure }, true);
      events.emit({ type: 'course.failed', courseId, error: failure.message, errorInfo: failure, flow: 'roadmapFlow', step: 'failed' });
      return null;
    }
    docs.set(coursePath(uid, courseId), { roadmap, status: 'lessons' }, true);
    const ordered = orderTopics(roadmap.topics);
    const startedAt = Date.now();
    ordered.forEach((topic, order) => {
      const first = order === 0;
      docs.set(topicPath(uid, courseId, topic.id), {
        title: topic.title,
        summary: topic.summary,
        prerequisites: topic.prerequisites,
        sourcePages: topic.sourcePages,
        status: first ? 'queued' : 'idle',
        statusDetail: first ? 'Queued' : null,
        enqueuedAt: first ? startedAt : null,
        error: null,
        studyDoc: '',
        order,
      });
      if (first) events.emit({ type: 'topic.queued', courseId, topicId: topic.id, flow: 'roadmapFlow', step: 'queued' });
    });
    events.emit({ type: 'roadmap.ready', courseId, roadmap, flow: 'roadmapFlow', step: 'ready' });
    await drainCourse(uid, courseId);
    return null;
  });

  const runCourse = async (uid: string, courseId: string) => {
    const runId = events.beginRun(courseId);
    try {
      return await roadmapFlow({ uid, courseId });
    } finally {
      events.endRun(courseId, runId);
    }
  };

  const runRegenerate = async (uid: string, courseId: string, topicId: string, segmentId: string, prompt?: string) => {
    const course = assembleCourse(docs, uid, courseId);
    const topic = course?.topics.find((item) => item.id === topicId);
    const segmentState = topic?.segments.find((item) => item.id === segmentId);
    const segment = segmentState?.segment;
    if (course && topic && segmentState && !segment) return runRetry(uid, courseId, topicId, segmentId);
    if (!course || !topic || !segment || !segmentState) throw new Error('Segment not found');
    const priorTopic = {
      status: topic.status,
      statusDetail: topic.statusDetail,
      error: topic.error,
    };
    const priorSegment = {
      status: segmentState.status,
      statusDetail: segmentState.statusDetail,
      segment,
    };
    const sourceIds = course.sources.map((source) => source.id);
    const roadmapTopic = course.roadmap?.topics.find((item) => item.id === topicId) ?? {
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      prerequisites: topic.prerequisites,
      sourcePages: topic.sourcePages,
    };
    // Keeps the previous segment; the failure stays on it so the UI can show it with Retry.
    const restore = (failure: GenerationErrorInfo) => {
      docs.set(topicPath(uid, courseId, topicId), priorTopic, true);
      docs.set(segmentPath(uid, courseId, topicId, segmentId), { ...priorSegment, error: failure.message, errorInfo: failure }, true);
    };
    const runId = events.beginRun(courseId);
    try {
      const replacement = await segmentLoop({
        uid,
        courseId,
        topic: roadmapTopic,
        segment,
        sourceIds,
        prompt,
        restoreOnFailure: true,
      });
      if (!replacement) {
        const failure: GenerationErrorInfo = {
          code: 'UPSTREAM',
          message: 'Segment could not be produced',
          issues: [{ path: 'segment', message: 'Segment could not be produced' }],
          attempts: 1,
        };
        restore(failure);
        events.emit({
          type: 'segment.failed',
          courseId,
          topicId,
          segmentId,
          error: failure.message,
          errorInfo: failure,
          flow: 'segmentLoop',
          step: 'failed',
        });
        return segment;
      }
      const lesson = topic.lesson;
      if (lesson) {
        saveLesson(docs, uid, courseId, topicId, {
          ...lesson,
          segments: lesson.segments.map((item) => (item.id === segmentId ? replacement : item)),
        });
      }
      return replacement;
    } catch (error) {
      const failure = toGenerationError(error).toInfo();
      if (isCancelled(error)) {
        docs.set(topicPath(uid, courseId, topicId), priorTopic, true);
        docs.set(segmentPath(uid, courseId, topicId, segmentId), priorSegment, true);
      } else {
        restore(failure);
        events.emit({
          type: 'segment.failed',
          courseId,
          topicId,
          segmentId,
          error: failure.message,
          errorInfo: failure,
          flow: 'segmentLoop',
          step: 'failed',
        });
      }
      throw error;
    } finally {
      events.endRun(courseId, runId);
    }
  };

  const roadmapTopicOf = (course: NonNullable<ReturnType<typeof assembleCourse>>, topicId: string): RoadmapTopic | null => {
    const topic = course.topics.find((item) => item.id === topicId);
    if (!topic) return null;
    return course.roadmap?.topics.find((item) => item.id === topicId) ?? {
      id: topic.id,
      title: topic.title,
      summary: topic.summary,
      prerequisites: topic.prerequisites,
      sourcePages: topic.sourcePages,
    };
  };

  /** Ready segments of a topic in stored order, as the lesson the UI shows. */
  const topicLesson = (uid: string, courseId: string, topicId: string) => {
    const segments = docs
      .list(`${topicPath(uid, courseId, topicId)}/segments`)
      .sort((a, b) => Number(a.data.order ?? 0) - Number(b.data.order ?? 0) || a.id.localeCompare(b.id))
      .filter((doc) => (doc.data.status === 'ready' || doc.data.status === 'unreviewed') && doc.data.segment)
      .map((doc) => doc.data.segment as GeneratedSegment);
    const studyDoc = String(docs.get(topicPath(uid, courseId, topicId))?.data.studyDoc ?? '');
    return { studyDoc, segments };
  };

  /**
   * Regenerates one failed segment (no usable segment yet) from its stored draft and errors, then
   * runs the normal check/render/review loop. On success the topic becomes ready with the segment in
   * its original position; on failure the segment stays failed with fresh error info.
   */
  const runRetry = async (uid: string, courseId: string, topicId: string, segmentId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    const roadmapTopic = course ? roadmapTopicOf(course, topicId) : null;
    const path = segmentPath(uid, courseId, topicId, segmentId);
    const doc = docs.get(path);
    if (!course || !roadmapTopic || !doc) throw new Error('Segment not found');
    const sourceIds = course.sources.map((source) => source.id);
    const fields = { courseId, topicId, segmentId, retry: true };
    const title = String(doc.data.title ?? segmentId);
    const previous = asRecord(doc.data.segment) ?? asRecord(doc.data.draft);
    const priorIssues = ((doc.data.errorInfo as GenerationErrorInfo | undefined)?.issues ?? []).slice(0, 10);
    const runId = events.beginRun(courseId);
    log.info(`Retrying segment ${segmentId}`, { ...fields, event: 'segment.retry' });
    docs.set(path, { status: 'generating', statusDetail: 'Retrying', error: null, errorInfo: null }, true);
    try {
      const result = await modelJson({
        name: 'retry',
        schema: segmentModelSchema,
        responseSchema: responseSchemas.segment,
        prompt: retrySegmentPrompt(roadmapTopic, segmentId, title, previous, priorIssues),
        retryPrompt: segmentRetry(previous ?? { id: segmentId, title }),
        check: sceneIssues,
        attempts: repairAttempts(),
        uid,
        sourceIds,
        fields,
      });
      const segment = keepId(result.value, segmentId);
      docs.set(path, { title: segment.title, status: 'checking', statusDetail: null, segment, draft: null }, true);
      const ready = await segmentLoop({ uid, courseId, topic: roadmapTopic, segment, sourceIds, restoreOnFailure: true });
      if (!ready) throw new Error('Segment could not be produced');
      const lesson = topicLesson(uid, courseId, topicId);
      docs.set(topicPath(uid, courseId, topicId), { status: 'ready', statusDetail: null, error: null, errorInfo: null }, true);
      events.emit({ type: 'topic.ready', courseId, topicId, lesson, flow: 'retry', step: 'ready' });
      return ready;
    } catch (error) {
      if (isCancelled(error)) {
        docs.set(path, { status: 'failed', statusDetail: null }, true);
        throw error;
      }
      const failure = failureOf(error, fields);
      log.error(`Segment retry failed: ${failure.code} ${failure.message}`, { ...fields, event: 'segment.failed', code: failure.code });
      failSegment({ uid, courseId, topicId, segmentId, failure, flow: 'retry' });
      return null;
    } finally {
      events.endRun(courseId, runId);
    }
  };

  /** Puts an idle lesson on the queue. It renders when the lesson already running finishes. */
  const runTopic = async (uid: string, courseId: string, topicId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    const stored = course?.topics.find((item) => item.id === topicId);
    if (!course || !stored) throw new Error('Topic not found');
    if (stored.status !== 'idle') throw new Error('Topic is not waiting');
    docs.set(topicPath(uid, courseId, topicId), {
      status: 'queued',
      statusDetail: 'Queued',
      enqueuedAt: Date.now(),
      error: null,
      errorInfo: null,
    }, true);
    events.emit({ type: 'topic.queued', courseId, topicId, flow: 'render', step: 'queued' });
    await drainCourse(uid, courseId);
  };

  /** Regenerates a whole topic (for example when the lesson draft failed). Old segment docs are replaced. */
  const runTopicRetry = async (uid: string, courseId: string, topicId: string) => {
    const course = assembleCourse(docs, uid, courseId);
    const topic = course ? roadmapTopicOf(course, topicId) : null;
    if (!course || !topic) throw new Error('Topic not found');
    const runId = events.beginRun(courseId);
    log.info(`Retrying topic ${topicId}`, { courseId, topicId, event: 'topic.retry' });
    try {
      for (const segment of docs.list(`${topicPath(uid, courseId, topicId)}/segments`)) {
        const path = segmentPath(uid, courseId, topicId, segment.id);
        for (const round of docs.list(`${path}/rounds`)) docs.delete(`${path}/rounds/${round.id}`);
        docs.delete(path);
      }
      events.emit({ type: 'topic.queued', courseId, topicId, flow: 'retry', step: 'queued' });
      return await lessonFlow({ uid, courseId, topic, sourceIds: course.sources.map((source) => source.id) });
    } finally {
      events.endRun(courseId, runId);
    }
  };

  /**
   * POST /api/ai/generate with a named schema: validated like the pipeline (zod + retries),
   * through the @google/genai client. Throws GenerationError.
   */
  const generateNamed = async <T>(
    name: string,
    schema: z.ZodType<T>,
    responseSchema: Record<string, unknown>,
    prompt: string,
    files: GeminiFile[],
    model?: string | null,
  ) => {
    if (gemini.backend() === 'none') throw new GeminiNotConfigured('No AI backend configured');
    return generateValidated({
      name,
      prompt,
      schema,
      attempts: 2,
      generate: (text) => gemini.generateJson(text, responseSchema, files, model),
      log,
      fields: { schema_name: name },
    });
  };

  return {
    gemini,
    warmup: renderer.warmup,
    rendererHealth: renderer.health,
    closeRenderer: renderer.close,
    runCourse,
    resumeCourse: drainCourse,
    runTopic,
    runRegenerate,
    runRetry,
    runTopicRetry,
    generateNamed,
  };
};
