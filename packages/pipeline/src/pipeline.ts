import { genkit } from 'genkit';
import { googleAI, vertexAI } from '@genkit-ai/google-genai';
import { orderTopics, reviewSchema, roadmapSchema, segmentSchema, validateSegment } from '@krayon/shared';
import type { BlobStorage, DocStore, EventBus, GeneratedSegment, RoadmapTopic, SceneIssue } from '@krayon/shared';
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
  MAX_OUTPUT_TOKENS,
  createGemini,
  isRetryableGenerateError,
  thinkingConfigFor,
} from './gemini.js';
import type { GeminiConfig, GeminiFile, PipelineLogger } from './gemini.js';
import { lessonPrompt, repairPrompt, reviewPrompt, roadmapPrompt, segmentPrompt } from './prompts.js';
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

const readModelJson = (text: string) => JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')) as unknown;

const issueText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`).join('; ');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pool = async <T>(items: T[], limit: number, run: (item: T) => Promise<void>) => {
  const queue = [...items];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
};

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

const schemaIssues = (error: z.ZodError): SceneIssue[] =>
  error.issues.map((issue) => ({
    code: 'schema',
    path: issue.path.join('.') || 'segment',
    message: issue.message,
  }));

export const createPipeline = (deps: PipelineDeps) => {
  const { docs, blobs, events, config, log } = deps;
  const gemini = createGemini(config, log);
  const renderer = createRenderer(config.remotionEntry, blobs, config.renderKeyframesMax);
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
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
      const started = performance.now();
      try {
        const response = await ai.generate({
          model: `${plugin}/${model}`,
          prompt: toParts(prompt, files),
          config: {
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            ...thinkingConfigFor(model),
          },
          output: { jsonSchema: responseSchema },
          abortSignal: controller.signal,
        });
        if (response.finishReason === 'length') throw new Error('MAX_TOKENS');
        const usage = response.usage;
        log.info(`Gemini ${model} ${Math.round(performance.now() - started)} ms`, {
          event: 'gemini',
          model,
          finish_reason: response.finishReason,
          usage: usage
            ? { prompt: usage.inputTokens, output: usage.outputTokens, total: usage.totalTokens }
            : undefined,
        });
        return response.text;
      } catch (error) {
        lastError = error;
        if (!isRetryableGenerateError(error) || attempt === 2) break;
        await sleep(400 * 2 ** attempt);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  const modelJson = async <T>(
    schema: z.ZodType<T>,
    responseSchema: Record<string, unknown>,
    prompt: string,
    uid: string,
    sourceIds: string[],
    model: string,
    extraFiles: GeminiFile[] = [],
  ) => {
    const files = [...loadSources(uid, sourceIds), ...extraFiles];
    let promptText = prompt;
    let last = 'The model response could not be used.';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const text = await generateText(promptText, files, model, responseSchema);
      let value: unknown;
      try {
        value = readModelJson(text);
      } catch {
        last = 'response: The model did not return JSON.';
        promptText = `${prompt}\n\nThe previous response was not JSON. Return one JSON object that matches the schema.`;
        continue;
      }
      const parsed = schema.safeParse(value);
      if (parsed.success) return parsed.data;
      last = issueText(parsed.error);
      promptText = `${prompt}\n\nThe previous JSON failed validation: ${last}\nReturn one corrected JSON object. Keep every required array for the chosen layout type.`;
    }
    throw new Error(last);
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
    try {
      if (input.prompt) {
        current = await ai.run('rewrite', async () => {
          const next = await modelJson(
            segmentSchema,
            responseSchemas.segment,
            segmentPrompt(topic, current, input.prompt),
            uid,
            sourceIds,
            config.model,
          );
          return keepId(next, input.segment.id);
        });
      }

      current = await ai.run('check', async () => {
        events.emit({ type: 'segment.check', courseId, topicId: topic.id, segmentId: current.id, flow: 'segmentLoop', step: 'check' });
        docs.set(segmentPath(uid, courseId, topic.id, current.id), { status: 'checking', statusDetail: 'Checking the segment' }, true);
        let best = current;
        let issues = validateSegment(best);
        let rounds = 0;
        for (let round = 0; round < config.maxRepairRounds && issues.length > 0; round += 1) {
          assertNotCancelled(courseId, topic.id, current.id);
          rounds += 1;
          try {
            const next = keepId(
              await modelJson(segmentSchema, responseSchemas.segment, repairPrompt(best, issues), uid, sourceIds, config.model),
              input.segment.id,
            );
            const nextIssues = validateSegment(next);
            if (nextIssues.length <= issues.length) {
              best = next;
              issues = nextIssues;
            }
          } catch {
            /* keep the previous segment */
          }
        }
        return { ...best, debug: { issues, repairRounds: rounds } };
      });
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Segment failed: ${message}`, {
        event: 'segment.failed',
        courseId,
        topicId: topic.id,
        segmentId: input.segment.id,
        error: message,
      }, error);
      if (input.restoreOnFailure) throw error;
      docs.set(segmentPath(uid, courseId, topic.id, input.segment.id), {
        status: 'failed',
        statusDetail: null,
        error: message,
      }, true);
      events.emit({
        type: 'segment.failed',
        courseId,
        topicId: topic.id,
        segmentId: input.segment.id,
        error: message,
        flow: 'segmentLoop',
        step: 'failed',
      });
      return null;
    }

    let best = current;
    let bestScore = -1;
    let bestIssues = validateSegment(current).length;

    for (let round = 1; round <= config.maxReviewRounds; round += 1) {
      assertNotCancelled(courseId, topic.id, current.id);
      try {
        const rendered = await ai.run('render', async () => {
          events.emit({
            type: 'segment.render',
            courseId,
            topicId: topic.id,
            segmentId: current.id,
            round,
            flow: 'segmentLoop',
            step: 'render',
          });
          return renderer.renderKeyframes(uid, current);
        });
        const review = await ai.run('review', async () => {
          const detail = `reviewing round ${round} of ${config.maxReviewRounds}`;
          docs.set(topicPath(uid, courseId, topic.id), { status: 'reviewing', statusDetail: detail }, true);
          docs.set(segmentPath(uid, courseId, topic.id, current.id), { status: 'reviewing', statusDetail: detail }, true);
          const keyframes = rendered.keyframeIds.map((id) => {
            const blob = blobs.get(uid, id);
            if (!blob) throw new Error(`Missing keyframe ${id}`);
            return { data: blob.data, mimeType: 'image/png' };
          });
          return modelJson(
            reviewSchema,
            reviewResponseSchema,
            reviewPrompt(current, rendered.frames),
            uid,
            sourceIds,
            config.reviewModel,
            keyframes,
          );
        });
        docs.set(roundPath(uid, courseId, topic.id, current.id, round), {
          segment: current,
          issues: review.issues,
          score: review.score,
          pass: review.pass,
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
          detail: `reviewing round ${round} of ${config.maxReviewRounds}`,
          flow: 'segmentLoop',
          step: 'review',
        });
        const issueCount = validateSegment(current).length;
        if (issueCount < bestIssues || (issueCount === bestIssues && review.score >= bestScore)) {
          best = current;
          bestScore = review.score;
          bestIssues = issueCount;
        }
        if (review.score >= config.reviewPassScore) break;
        if (!review.patchedSegment || round === config.maxReviewRounds) break;
        const patched = await ai.run('fix', async () => {
          const checked = segmentSchema.safeParse(review.patchedSegment);
          if (!checked.success) return null;
          const next = keepId(checked.data, input.segment.id);
          const issues: SceneIssue[] = validateSegment(next);
          if (issues.length > 0) return null;
          events.emit({ type: 'segment.fixed', courseId, topicId: topic.id, segmentId: current.id, round, flow: 'segmentLoop', step: 'fix' });
          return next;
        });
        if (!patched) break;
        current = patched;
      } catch (error) {
        if (error instanceof Cancelled) throw error;
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Review stopped: ${message}`, {
          event: 'segment.review',
          courseId,
          topicId: topic.id,
          segmentId: current.id,
          round,
          error: message,
        }, error);
        break;
      }
    }

    docs.set(segmentPath(uid, courseId, topic.id, best.id), {
      title: best.title,
      status: 'ready',
      statusDetail: null,
      error: null,
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
    docs.set(topicPath(uid, courseId, topic.id), { status: 'generating', statusDetail: 'Writing the lesson', error: null }, true);
    const failTopic = (message: string) => {
      docs.set(topicPath(uid, courseId, topic.id), { status: 'failed', statusDetail: null, error: message }, true);
      events.emit({ type: 'topic.failed', courseId, topicId: topic.id, error: message, flow: 'lessonFlow', step: 'failed' });
    };
    try {
      const draft = await ai.run('draft', () =>
        modelJson(looseLessonSchema, responseSchemas.lesson, lessonPrompt(topic), uid, sourceIds, config.model),
      );
      events.emit({ type: 'lesson.drafted', courseId, topicId: topic.id, flow: 'lessonFlow', step: 'draft' });
      const slugged = slugifySegments(draft.segments);
      let cancelled = false;
      const finished = await Promise.all(slugged.map(async (record, index) => {
        if (cancelled) return null;
        const id = String(record.id);
        try {
          assertNotCancelled(courseId, topic.id, id);
          const parsed = segmentSchema.safeParse(record);
          let segment = parsed.success ? parsed.data : null;
          let issues = parsed.success ? validateSegment(parsed.data) : schemaIssues(parsed.error);
          for (let round = 0; round < config.maxRepairRounds && (!segment || issues.length > 0); round += 1) {
            assertNotCancelled(courseId, topic.id, id);
            try {
              const base = segment ?? ({ ...record, id } as GeneratedSegment);
              const next = keepId(
                await modelJson(segmentSchema, responseSchemas.segment, repairPrompt(base, issues), uid, sourceIds, config.model),
                id,
              );
              segment = next;
              issues = validateSegment(next);
            } catch {
              /* the next round retries; a bad segment does not fail the lesson */
            }
          }
          if (!segment || issues.length > 0) {
            const message = issues[0]?.message ?? 'Segment could not be produced';
            docs.set(segmentPath(uid, courseId, topic.id, id), {
              title: typeof record.title === 'string' ? record.title : id,
              status: 'failed',
              statusDetail: null,
              error: message,
              order: index,
            });
            events.emit({
              type: 'segment.failed',
              courseId,
              topicId: topic.id,
              segmentId: id,
              error: message,
              flow: 'lessonFlow',
              step: 'failed',
            });
            return null;
          }
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
        failTopic('No usable segments');
        return null;
      }
      const lesson = { studyDoc: draft.studyDoc, segments };
      saveLesson(docs, uid, courseId, topic.id, lesson);
      events.emit({ type: 'topic.ready', courseId, topicId: topic.id, lesson, flow: 'lessonFlow', step: 'ready' });
      return lesson;
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      failTopic(error instanceof Error ? error.message : String(error));
      return null;
    }
  });

  const roadmapFlow = ai.defineFlow('roadmapFlow', async (raw) => {
    const { uid, courseId } = raw as { uid: string; courseId: string };
    const course = assembleCourse(docs, uid, courseId);
    if (!course) throw new Error('Course not found');
    const sourceIds = course.sources.map((source) => source.id);
    events.emit({ type: 'roadmap.started', courseId, flow: 'roadmapFlow', step: 'started' });
    docs.set(coursePath(uid, courseId), { status: 'roadmap' }, true);
    let roadmap: z.infer<typeof roadmapSchema>;
    try {
      roadmap = await ai.run('draft', () =>
        modelJson(roadmapSchema, responseSchemas.roadmap, roadmapPrompt, uid, sourceIds, config.model),
      );
    } catch (error) {
      if (error instanceof Cancelled) return null;
      const message = error instanceof Error ? error.message : String(error);
      docs.set(coursePath(uid, courseId), { status: 'failed', error: message }, true);
      events.emit({ type: 'course.failed', courseId, error: message, flow: 'roadmapFlow', step: 'failed' });
      return null;
    }
    docs.set(coursePath(uid, courseId), { roadmap, status: 'lessons' }, true);
    const ordered = orderTopics(roadmap.topics);
    ordered.forEach((topic, order) => {
      docs.set(topicPath(uid, courseId, topic.id), {
        title: topic.title,
        summary: topic.summary,
        prerequisites: topic.prerequisites,
        sourcePages: topic.sourcePages,
        status: 'queued',
        statusDetail: 'Queued',
        error: null,
        studyDoc: '',
        order,
      });
      events.emit({ type: 'topic.queued', courseId, topicId: topic.id, flow: 'roadmapFlow', step: 'queued' });
    });
    events.emit({ type: 'roadmap.ready', courseId, roadmap, flow: 'roadmapFlow', step: 'ready' });
    await pool(ordered, config.topicConcurrency, async (topic) => {
      try {
        await lessonFlow({ uid, courseId, topic, sourceIds });
      } catch (error) {
        if (error instanceof Cancelled) return;
        throw error;
      }
    });
    if (events.isCancelled(courseId)) return null;
    docs.set(coursePath(uid, courseId), { status: 'done' }, true);
    events.emit({ type: 'course.done', courseId, flow: 'roadmapFlow', step: 'done' });
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
    const restore = () => {
      docs.set(topicPath(uid, courseId, topicId), priorTopic, true);
      docs.set(segmentPath(uid, courseId, topicId, segmentId), priorSegment, true);
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
        restore();
        events.emit({
          type: 'segment.failed',
          courseId,
          topicId,
          segmentId,
          error: 'Segment could not be produced',
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
      restore();
      if (!(error instanceof Cancelled)) {
        const message = error instanceof Error ? error.message : String(error);
        events.emit({
          type: 'segment.failed',
          courseId,
          topicId,
          segmentId,
          error: message,
          flow: 'segmentLoop',
          step: 'failed',
        });
      }
      throw error;
    } finally {
      events.endRun(courseId, runId);
    }
  };

  return { gemini, warmup: renderer.warmup, runCourse, runRegenerate };
};
