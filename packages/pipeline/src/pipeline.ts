import { genkit } from 'genkit';
import { googleAI, vertexAI } from '@genkit-ai/google-genai';
import { lessonSchema, orderTopics, reviewSchema, roadmapSchema, segmentSchema, validateSegment } from '@krayon/shared';
import type { BlobStorage, DocStore, EventBus, GeneratedSegment, RoadmapTopic, SceneIssue } from '@krayon/shared';
import { z } from 'zod';
import {
  assembleCourse,
  coursePath,
  readSources,
  responseSchemas,
  reviewResponseSchema,
  roundPath,
  saveLesson,
  segmentPath,
  topicPath,
} from './courses.js';
import { createGemini } from './gemini.js';
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

const readModelJson = (text: string) => JSON.parse(text.trim().replace(/^```json\s*/i, '').replace(/```$/, '')) as unknown;

const issueText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`).join('; ');

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

export const createPipeline = (deps: PipelineDeps) => {
  const { docs, blobs, events, config, log } = deps;
  const gemini = createGemini(config, log);
  const { renderKeyframes } = createRenderer(config.remotionEntry, blobs, config.renderKeyframesMax);
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

  const modelJson = async <T>(
    schema: z.ZodType<T>,
    responseSchema: Record<string, unknown>,
    prompt: string,
    files: GeminiFile[],
    model: string,
  ) => {
    let promptText = prompt;
    let last = 'The model response could not be used.';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const text = await gemini.generateJson(promptText, responseSchema, files, model);
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
    files: GeminiFile[];
    prompt?: string;
  };

  const segmentLoop = ai.defineFlow('segmentLoop', async (raw) => {
    const input = raw as LoopInput;
    const { uid, courseId, topic, files } = input;
    assertNotCancelled(courseId, topic.id, input.segment.id);
    let current = input.segment;
    if (input.prompt) {
      current = await ai.run('rewrite', async () => {
        const next = await modelJson(segmentSchema, responseSchemas.segment, segmentPrompt(topic, current, input.prompt), files, config.model);
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
            await modelJson(segmentSchema, responseSchemas.segment, repairPrompt(best, issues), files, config.model),
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

    let best = current;
    let bestScore = -1;
    let bestIssues = validateSegment(current).length;

    for (let round = 1; round <= config.maxReviewRounds; round += 1) {
      assertNotCancelled(courseId, topic.id, current.id);
      const rendered = await ai.run('render', async () => {
        events.emit({ type: 'segment.render', courseId, topicId: topic.id, segmentId: current.id, round, flow: 'segmentLoop', step: 'render' });
        return renderKeyframes(uid, current);
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
          [...files, ...keyframes],
          config.reviewModel,
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
    }

    docs.set(segmentPath(uid, courseId, topic.id, best.id), {
      title: best.title,
      status: 'ready',
      statusDetail: null,
      segment: best,
    });
    events.emit({ type: 'segment.ready', courseId, topicId: topic.id, segmentId: best.id, flow: 'segmentLoop', step: 'ready' });
    return best;
  });

  const lessonFlow = ai.defineFlow('lessonFlow', async (raw) => {
    const { uid, courseId, topic, files } = raw as { uid: string; courseId: string; topic: RoadmapTopic; files: GeminiFile[] };
    assertNotCancelled(courseId, topic.id);
    events.emit({ type: 'topic.started', courseId, topicId: topic.id, flow: 'lessonFlow', step: 'started' });
    docs.set(topicPath(uid, courseId, topic.id), { status: 'generating', statusDetail: 'Writing the lesson', error: null }, true);
    try {
      const draft = await ai.run('draft', () =>
        modelJson(lessonSchema, responseSchemas.lesson, lessonPrompt(topic), files, config.model),
      );
      events.emit({ type: 'lesson.drafted', courseId, topicId: topic.id, flow: 'lessonFlow', step: 'draft' });
      const segments: GeneratedSegment[] = [];
      for (const segment of draft.segments) {
        assertNotCancelled(courseId, topic.id, segment.id);
        docs.set(segmentPath(uid, courseId, topic.id, segment.id), {
          title: segment.title,
          status: 'checking',
          statusDetail: null,
          segment,
        });
        segments.push(await segmentLoop({ uid, courseId, topic, segment, files }));
      }
      const lesson = { studyDoc: draft.studyDoc, segments };
      saveLesson(docs, uid, courseId, topic.id, lesson);
      events.emit({ type: 'topic.ready', courseId, topicId: topic.id, lesson, flow: 'lessonFlow', step: 'ready' });
      return lesson;
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      const message = error instanceof Error ? error.message : String(error);
      docs.set(topicPath(uid, courseId, topic.id), { status: 'failed', statusDetail: null, error: message }, true);
      events.emit({ type: 'topic.failed', courseId, topicId: topic.id, error: message, flow: 'lessonFlow', step: 'failed' });
      return null;
    }
  });

  const roadmapFlow = ai.defineFlow('roadmapFlow', async (raw) => {
    const { uid, courseId } = raw as { uid: string; courseId: string };
    const course = assembleCourse(docs, uid, courseId);
    if (!course) throw new Error('Course not found');
    const files = readSources(blobs, uid, course).map((source) => ({ data: source.data, mimeType: source.contentType }));
    events.emit({ type: 'roadmap.started', courseId, flow: 'roadmapFlow', step: 'started' });
    docs.set(coursePath(uid, courseId), { status: 'roadmap' }, true);
    const roadmap = await ai.run('draft', () =>
      modelJson(roadmapSchema, responseSchemas.roadmap, roadmapPrompt, files, config.model),
    );
    docs.set(coursePath(uid, courseId), { roadmap, status: 'lessons' }, true);
    for (const topic of roadmap.topics) {
      docs.set(topicPath(uid, courseId, topic.id), {
        title: topic.title,
        summary: topic.summary,
        prerequisites: topic.prerequisites,
        sourcePages: topic.sourcePages,
        status: 'queued',
        statusDetail: 'Queued',
        error: null,
        studyDoc: '',
      });
      events.emit({ type: 'topic.queued', courseId, topicId: topic.id, flow: 'roadmapFlow', step: 'queued' });
    }
    events.emit({ type: 'roadmap.ready', courseId, roadmap, flow: 'roadmapFlow', step: 'ready' });
    const ordered = orderTopics(roadmap.topics);
    await pool(ordered, config.topicConcurrency, async (topic) => {
      try {
        await lessonFlow({ uid, courseId, topic, files });
      } catch (error) {
        if (error instanceof Cancelled) return;
        throw error;
      }
    });
    docs.set(coursePath(uid, courseId), { status: 'done' }, true);
    events.emit({ type: 'course.done', courseId, flow: 'roadmapFlow', step: 'done' });
    return null;
  });

  return {
    gemini,
    runCourse: (uid: string, courseId: string) => roadmapFlow({ uid, courseId }),
    runRegenerate: async (uid: string, courseId: string, topicId: string, segmentId: string, prompt?: string) => {
      const course = assembleCourse(docs, uid, courseId);
      const topic = course?.topics.find((item) => item.id === topicId);
      const segment = topic?.segments.find((item) => item.id === segmentId)?.segment;
      if (!course || !topic || !segment) throw new Error('Segment not found');
      const files = readSources(blobs, uid, course).map((source) => ({ data: source.data, mimeType: source.contentType }));
      const replacement = await segmentLoop({ uid, courseId, topic, segment, files, prompt });
      const lesson = topic.lesson;
      if (lesson) {
        saveLesson(docs, uid, courseId, topicId, {
          ...lesson,
          segments: lesson.segments.map((item) => (item.id === segmentId ? replacement : item)),
        });
      }
      return replacement;
    },
  };
};
