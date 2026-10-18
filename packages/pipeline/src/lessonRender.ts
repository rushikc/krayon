import {
  FPS,
  mediaKey,
  GenerationError,
  LESSON_SECONDS,
  SEGMENT_FRAMES,
  audioClamped,
  beatsSchema,
  framesFor,
  framesForAudio,
  modelResponseSchemas,
  normalizeScene,
  reviewSchema,
  sceneModelSchema,
  validateSegment,
  toModelSchema,
  wordCount,
  zodIssues,
} from '@krayon/shared';
import type { GeneratedSegment, GenerationErrorInfo, GenerationIssue, SegmentAudio } from '@krayon/shared';
import { z } from 'zod';
import { beatsFromRanges, fallbackBeats, normalizeBeats, splitSentences } from './beats.js';
import { SAFETY_MESSAGE, classifyStepFailure } from './outcomes.js';
import { beatsPrompt, learnerScenePrompt, regenerateNarrationPrompt, repairPrompt, retryScenePrompt, reviewPrompt, scenePrompt } from './prompts.js';
import type { SceneInput, SegmentLike } from './prompts.js';
import type { Priority } from './queue.js';
import { renewLease } from './handlers/claim.js';
import { Cancelled, isCancelled } from './runtime.js';
import type { Runtime } from './runtime.js';
import { lessonPath, locateLesson, roundPath, segmentIdFor, segmentPath, segmentsPath } from './store.js';

/** Most pages attached to one scene or review call. */
const SEGMENT_PAGES = 4;

/** Review output is parsed loosely; patchedSegment is validated separately in the fix step. */
const reviewModelSchema = reviewSchema.extend({ patchedSegment: z.unknown().optional() });
const narrationSchema = z.object({
  narration: z.string().min(1).describe('Spoken narration for this one segment. It may be longer than the current version.'),
});
const narrationResponseSchema = toModelSchema(narrationSchema);

const sceneIssues = (segment: GeneratedSegment): GenerationIssue[] =>
  validateSegment(segment).map(({ path, message }) => ({ path, message }));

type LessonDoc = {
  courseId: string;
  chapterId: string;
  sourceId: string;
  title: string;
  status: string;
  pdfPageStart: number;
  pdfPageEnd: number;
  explanationSummary: string;
  priority?: Priority;
};

type SegmentDoc = {
  index: number;
  title: string;
  visual: string;
  narration: string;
  durationInFrames: number;
  startFrame: number;
  sourcePages: number[];
  pdfPages: number[];
  status: string;
  voice?: string;
  audio?: SegmentAudio | null;
  segment?: GeneratedSegment | null;
  draft?: SegmentLike | null;
  errorInfo?: GenerationErrorInfo | null;
};

type SegmentRun = {
  uid: string;
  courseId: string;
  lessonId: string;
  segmentId: string;
  lesson: LessonDoc;
  priority: Priority;
  epoch: number;
  /** Learner "explain more" request: rewrite the ready segment, keep it on failure. */
  learner?: { request?: string };
};

export const createLessonStages = (rt: Runtime) => {
  const { docs, blobs, config, log } = rt;
  const running = new Map<string, Promise<void>>();
  const repairAttempts = () => Math.max(0, config.maxRepairRounds) + 1;

  const assemble = (segmentId: string, doc: SegmentDoc, value: { title: string; scene: GeneratedSegment['scene'] }): GeneratedSegment =>
    normalizeScene({
      id: segmentId,
      title: value.title,
      durationInFrames: doc.durationInFrames,
      narration: doc.narration,
      scene: value.scene,
    });

  const pagesFor = (lesson: LessonDoc, doc: SegmentDoc) => {
    const pages = doc.pdfPages.filter((page) => page >= lesson.pdfPageStart && page <= lesson.pdfPageEnd);
    const start = pages.length ? Math.min(...pages) : lesson.pdfPageStart;
    const end = pages.length ? Math.min(Math.max(...pages), start + SEGMENT_PAGES - 1) : Math.min(lesson.pdfPageEnd, start + 2);
    return { start, end };
  };

  /** Ready-segment count and total on the lesson doc, for the roadmap progress. */
  const countReady = async (uid: string, courseId: string, lessonId: string) => {
    const rows = (await docs.list(segmentsPath(uid, courseId, lessonId)));
    const ready = rows.filter((row) => row.data.status === 'ready').length;
    await docs.set(lessonPath(uid, courseId, lessonId), { segmentsReady: ready, segmentCount: rows.length }, { merge: true });
    return { ready, total: rows.length };
  };

  /** Beats call: sentence ranges over the verbatim script, then timing normalisation. Writes the segment docs. */
  const planSegments = async (uid: string, courseId: string, lessonId: string, lesson: LessonDoc, priority: Priority, instructions?: string) => {
    const sentences = splitSentences(lesson.explanationSummary);
    const fields = { courseId, lessonId };
    const toPdfPage = (page: number) => Math.min(lesson.pdfPageEnd, Math.max(lesson.pdfPageStart, lesson.pdfPageStart + page - 1));
    let beats;
    try {
      const result = await rt.modelJson({
        name: 'beats',
        schema: beatsSchema,
        responseSchema: modelResponseSchemas.beats,
        prompt: beatsPrompt({ title: lesson.title, sentences, start: lesson.pdfPageStart, end: lesson.pdfPageEnd, instructions }),
        files: [await rt.sources.slice(uid, lesson.sourceId, lesson.pdfPageStart, lesson.pdfPageEnd)],
        long: true,
        priority,
        fields,
      });
      beats = beatsFromRanges(sentences, result.value.beats, toPdfPage);
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, fields);
      (log.warn ?? log.info)(`Beats failed; splitting the script by sentences: ${failure.message}`, { ...fields, event: 'lesson.beats_fallback', code: failure.code });
      beats = fallbackBeats(sentences);
    }
    const timed = normalizeBeats(beats);
    for (const old of (await docs.list(segmentsPath(uid, courseId, lessonId)))) await docs.delete(segmentPath(uid, courseId, lessonId, old.id));
    for (const [index, beat] of timed.entries()) {
      await docs.set(segmentPath(uid, courseId, lessonId, segmentIdFor(index)), {
        index,
        title: beat.title,
        visual: beat.visual,
        narration: beat.narration,
        durationInFrames: beat.durationInFrames,
        startFrame: beat.startFrame,
        pdfPages: beat.pages,
        sourcePages: beat.pages.map((page) => page + 1),
        status: 'pending',
        statusDetail: null,
        segment: null,
        error: null,
        errorInfo: null,
      });
    }
    const last = timed[timed.length - 1];
    const durationFrames = last ? last.startFrame + last.durationInFrames : 0;
    await docs.set(lessonPath(uid, courseId, lessonId), { durationFrames, segmentCount: timed.length, segmentsReady: 0 }, { merge: true });
    log.info(`Planned ${timed.length} segments`, {
      ...fields,
      event: 'lesson.beats',
      segments: timed.length,
      seconds: Math.round(durationFrames / 30),
      words: timed.map((beat) => beat.words),
    });
  };

  const setSegment = async (run: SegmentRun, patch: Record<string, unknown>) => {
    await docs.set(segmentPath(run.uid, run.courseId, run.lessonId, run.segmentId), patch, { merge: true });
  };

  /** Records narration for segments that do not already have audio. Uses the lesson priority so a clicked lesson jumps the TTS queue. */
  const voiceSegments = async (uid: string, courseId: string, lessonId: string, priority: Priority) => {
    if (!config.ttsEnabled) return;
    const rows = (await docs.list(segmentsPath(uid, courseId, lessonId))).sort((a, b) => Number(a.data.index) - Number(b.data.index));
    await Promise.all(
      rows.map(async (row) => {
        if (row.data.audio || row.data.status === 'ready') return;
        const path = segmentPath(uid, courseId, lessonId, row.id);
        const narration = String(row.data.narration ?? '');
        await docs.set(path, { voice: 'voicing', statusDetail: 'Recording narration' }, { merge: true });
        await rt.emitSegment(uid, courseId, lessonId, row.id, 'segment.voicing', { step: 'voice' });
        try {
          const audio = await rt.tts.voice(uid, narration, priority);
          await docs.set(path, { audio, voice: 'voiced', statusDetail: null }, { merge: true });
          await rt.emitSegment(uid, courseId, lessonId, row.id, 'segment.voiced', { step: 'voice' });
        } catch (error) {
          if (isCancelled(error)) throw error;
          const failure = rt.failureOf(error, { courseId, lessonId, segmentId: row.id });
          await docs.set(path, { status: 'failed', voice: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
          await rt.emitSegment(uid, courseId, lessonId, row.id, 'segment.voice_failed', {
            error: failure.message,
            errorInfo: failure,
            step: 'voice',
          });
        }
      }),
    );
  };

  /** Sets each segment's duration from its audio (or the silent estimate) and rebuilds startFrame. */
  const retime = async (uid: string, courseId: string, lessonId: string) => {
    const rows = (await docs.list(segmentsPath(uid, courseId, lessonId))).sort((a, b) => Number(a.data.index) - Number(b.data.index));
    let start = 0;
    for (const row of rows) {
      const narration = String(row.data.narration ?? '');
      const audio = row.data.audio as SegmentAudio | undefined;
      const duration = config.ttsEnabled && audio ? framesForAudio(audio.seconds) : framesFor(wordCount(narration));
      if (config.ttsEnabled && audio && audioClamped(audio.seconds)) {
        (log.warn ?? log.info)(`Segment audio clamped to ${SEGMENT_FRAMES.sanityMax} frames`, {
          courseId,
          lessonId,
          segmentId: row.id,
          event: 'segment.audio_long',
          seconds: audio.seconds,
        });
      }
      const stored = row.data.segment;
      const segment = stored && typeof stored === 'object' ? { ...(stored as GeneratedSegment), durationInFrames: duration } : stored;
      await docs.set(segmentPath(uid, courseId, lessonId, row.id), { durationInFrames: duration, startFrame: start, segment }, { merge: true });
      start += duration;
    }
    await docs.set(lessonPath(uid, courseId, lessonId), { durationFrames: start }, { merge: true });
    if (start / FPS > LESSON_SECONDS.max) {
      (log.warn ?? log.info)(`Lesson is longer than ${LESSON_SECONDS.max} seconds`, {
        courseId,
        lessonId,
        event: 'lesson.long',
        seconds: Math.round(start / FPS),
      });
    }
  };

  /** Scene call (with path-qualified repair), then render + review rounds. Throws on a failure that keeps the segment from playing. */
  const segmentOnce = async (run: SegmentRun, attempt: number): Promise<GeneratedSegment> => {
    const { uid, courseId, lessonId, segmentId, lesson, priority } = run;
    const fields = { courseId, lessonId, segmentId, attempt };
    const doc = (await docs.get(segmentPath(uid, courseId, lessonId, segmentId)))?.data as SegmentDoc | undefined;
    if (!doc) throw new Error(`Missing segment ${segmentId}`);
    const { start, end } = pagesFor(lesson, doc);
    const files = [await rt.sources.slice(uid, lesson.sourceId, start, end)];
    const input: SceneInput = {
      lessonTitle: lesson.title,
      title: doc.title,
      visual: doc.visual,
      narration: doc.narration,
      durationInFrames: doc.durationInFrames,
      start,
      end,
      pageText: await rt.sources.text(uid, lesson.sourceId, start, end),
    };
    const previous = doc.segment ?? doc.draft ?? null;
    const prompt = run.learner && doc.segment
      ? learnerScenePrompt(input, doc.segment, run.learner.request)
      : attempt > 1 || doc.errorInfo
        ? retryScenePrompt(input, previous, (doc.errorInfo?.issues ?? []).slice(0, 10))
        : scenePrompt(input);

    await renewLease(docs, segmentPath(uid, courseId, lessonId, segmentId));
    await setSegment(run, { status: 'drafting', statusDetail: 'Designing the visual' });
    await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.check', { step: 'draft' });
    let current: GeneratedSegment;
    let lastDraft: unknown;
    try {
      const result = await rt.modelJson({
        name: 'scene',
        schema: sceneModelSchema,
        responseSchema: modelResponseSchemas.scene,
        prompt,
        files,
        check: (value) => {
          lastDraft = value;
          return sceneIssues(assemble(segmentId, doc, value));
        },
        retryPrompt: (issues, prior) => repairPrompt(prior ? assemble(segmentId, doc, prior as never) : (previous ?? { title: doc.title }), issues),
        attempts: repairAttempts(),
        priority,
        fields,
      });
      current = assemble(segmentId, doc, result.value);
    } catch (error) {
      if (lastDraft && !run.learner) await setSegment(run, { draft: assemble(segmentId, doc, lastDraft as never) });
      throw error;
    }
    await setSegment(run, { status: 'checking', statusDetail: 'Checking the segment', segment: run.learner ? doc.segment : current, draft: null });
    await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.check', { step: 'check' });

    let best = current;
    let bestScore = -1;
    let bestIssues = sceneIssues(current).length;
    let unreviewed = false;
    for (let round = 1; round <= config.maxReviewRounds; round += 1) {
      if (rt.events.isCancelled(courseId, lessonId, segmentId)) throw new Cancelled();
      try {
        await renewLease(docs, segmentPath(uid, courseId, lessonId, segmentId));
        await setSegment(run, { status: 'rendering', statusDetail: 'Rendering keyframes' });
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.render', { round, step: 'render' });
        const rendered = await rt.renderer.renderKeyframes(uid, current, priority, fields);
        const detail = `Reviewing, round ${round} of ${config.maxReviewRounds}`;
        await renewLease(docs, segmentPath(uid, courseId, lessonId, segmentId));
        await setSegment(run, { status: 'reviewing', statusDetail: detail });
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.review', { round, detail, step: 'reviewing' });
        const keyframes = [];
        for (const id of rendered.keyframeIds) {
          const key = mediaKey(id);
          const blob = key ? await blobs.get(key) : null;
          if (!blob) throw new Error(`Missing keyframe ${id}`);
          keyframes.push({ data: blob.data, mimeType: 'image/png' });
        }
        const review = (
          await rt.modelJson({
            name: 'review',
            schema: reviewModelSchema,
            responseSchema: modelResponseSchemas.review,
            prompt: reviewPrompt(current, rendered.frames, start, end),
            model: config.reviewModel,
            files: [...files, ...keyframes],
            priority,
            fields: { ...fields, round },
          })
        ).value;
        const issueCount = sceneIssues(current).length;
        if (issueCount < bestIssues || (issueCount === bestIssues && review.score >= bestScore)) {
          best = current;
          bestScore = review.score;
          bestIssues = issueCount;
        }
        let fixed = false;
        const passing = review.score >= config.reviewPassScore;
        if (!passing && review.patchedSegment && round < config.maxReviewRounds) {
          const checked = sceneModelSchema.safeParse(review.patchedSegment);
          const next = checked.success ? assemble(segmentId, doc, checked.data) : null;
          const issues = next ? sceneIssues(next) : zodIssues(checked.error!);
          if (next && issues.length === 0) {
            fixed = true;
            current = next;
            await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.fixed', { round, fixed: true, step: 'fix' });
          } else {
            log.info('Review patch rejected', { ...fields, event: 'segment.fix', round, issues: issues.slice(0, 10) });
          }
        }
        await docs.set(roundPath(uid, courseId, lessonId, segmentId, round), {
          segment: fixed ? current : best,
          issues: review.issues,
          score: review.score,
          pass: review.pass,
          fixed,
          keyframeIds: rendered.keyframeIds,
        });
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.review', {
          round,
          score: review.score,
          pass: review.pass,
          fixed,
          detail,
          step: 'review',
        });
        if (passing || !fixed) break;
      } catch (error) {
        if (isCancelled(error)) throw error;
        const outcome = classifyStepFailure(error);
        log.error(`Review stopped: ${outcome.status} ${outcome.message}`, { ...fields, event: 'segment.review', round, status: outcome.status, error: outcome.message }, error instanceof GenerationError ? undefined : error);
        if (outcome.status === 'blocked') throw new GenerationError('UPSTREAM', [{ path: 'segment', message: SAFETY_MESSAGE }], round);
        unreviewed = true;
        break;
      }
    }
    await setSegment(run, {
      title: best.title,
      status: 'ready',
      statusDetail: null,
      error: null,
      errorInfo: null,
      draft: null,
      segment: best,
      reviewStatus: unreviewed ? 'unreviewed' : null,
    });
    return best;
  };

  /** One segment with SEGMENT_RETRIES retries. Returns false when it ends failed. */
  const runSegment = async (run: SegmentRun) => {
    const { uid, courseId, lessonId, segmentId } = run;
    const attempts = 1 + Math.max(0, config.segmentRetries);
    const startedAt = Date.now();
    let failure: GenerationErrorInfo | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      rt.assertLive(run.epoch);
      try {
        await segmentOnce(run, attempt);
        const counts = await countReady(uid, courseId, lessonId);
        log.info('Segment ready', { courseId, lessonId, segmentId, event: 'segment.ready', attempt, duration_ms: Date.now() - startedAt });
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.ready', { step: 'ready', ...counts });
        return true;
      } catch (error) {
        if (isCancelled(error)) throw error;
        failure = rt.failureOf(error, { courseId, lessonId, segmentId });
        const blocked = classifyStepFailure(error).status === 'blocked' || failure.issues.some((issue) => issue.message === SAFETY_MESSAGE);
        await setSegment(run, { errorInfo: failure, error: failure.message });
        if (blocked) break;
        if (attempt < attempts) {
          (log.warn ?? log.info)(`Segment attempt ${attempt}/${attempts} failed: ${failure.code} ${failure.message}`, {
            courseId,
            lessonId,
            segmentId,
            event: 'segment.retry',
            attempt,
            code: failure.code,
          });
        }
      }
    }
    log.error(`Segment failed: ${failure?.code} ${failure?.message}`, {
      courseId,
      lessonId,
      segmentId,
      event: 'segment.failed',
      code: failure?.code,
      issues: failure?.issues.slice(0, 10),
      duration_ms: Date.now() - startedAt,
    });
    await setSegment(run, { status: 'failed', statusDetail: null, error: failure?.message ?? 'Segment failed', errorInfo: failure });
    await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.failed', { error: failure?.message, errorInfo: failure ?? undefined, step: 'failed' });
    return false;
  };

  /** The lesson's segments, all ready or all settled. Ready only when every segment is ready. */
  const renderNow = async (uid: string, courseId: string, lessonId: string, priority: Priority, instructions?: string) => {
    const path = lessonPath(uid, courseId, lessonId);
    const startedAt = Date.now();
    const epoch = rt.currentEpoch();
    const runId = rt.events.beginRun(courseId);
    const fields = { courseId, lessonId };
    try {
      const lesson = (await docs.get(path))?.data as LessonDoc | undefined;
      if (!lesson) throw new Error('Lesson not found');
      await docs.set(path, { status: 'rendering', statusDetail: 'Planning the video', error: null, errorInfo: null }, { merge: true });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.rendering', { step: 'plan' });
      if ((await docs.list(segmentsPath(uid, courseId, lessonId))).length === 0) await planSegments(uid, courseId, lessonId, lesson, priority, instructions);
      rt.assertLive(epoch);
      await voiceSegments(uid, courseId, lessonId, priority);
      rt.assertLive(epoch);
      await retime(uid, courseId, lessonId);
      const pending = (await docs.list(segmentsPath(uid, courseId, lessonId)))
        .filter((row) => row.data.status !== 'ready' && row.data.status !== 'failed')
        .sort((a, b) => Number(a.data.index) - Number(b.data.index));
      const { ready, total } = await countReady(uid, courseId, lessonId);
      await docs.set(path, { statusDetail: `Rendering ${ready} of ${total} segments` }, { merge: true });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.rendering', { ready, total, step: 'segments' });
      await Promise.all(
        pending.map((row) =>
          runSegment({ uid, courseId, lessonId, segmentId: row.id, lesson, priority, epoch }).then(async (ok) => {
            if (!ok) return;
            const counts = await countReady(uid, courseId, lessonId);
            await docs.set(path, { statusDetail: `Rendering ${counts.ready} of ${counts.total} segments` }, { merge: true });
            await rt.emitLesson(uid, courseId, lessonId, 'lesson.rendering', { ...counts, step: 'segments' });
          }),
        ),
      );
      rt.assertLive(epoch);
      const counts = await countReady(uid, courseId, lessonId);
      if (counts.ready === counts.total && counts.total > 0) {
        await docs.set(path, { status: 'ready', statusDetail: null, error: null, errorInfo: null }, { merge: true });
        log.info('Lesson ready', { ...fields, event: 'lesson.ready', duration_ms: Date.now() - startedAt, segments: counts.total });
        await rt.emitLesson(uid, courseId, lessonId, 'lesson.ready', { ...counts, step: 'ready' });
        return;
      }
      const failed = counts.total - counts.ready;
      const failure: GenerationErrorInfo = {
        code: 'SCHEMA_INVALID',
        message: `${failed} of ${counts.total} segments could not be made.`,
        issues: (await docs.list(segmentsPath(uid, courseId, lessonId)))
          .filter((row) => row.data.status === 'failed')
          .map((row) => ({ path: `segments.${row.id}`, message: String(row.data.error ?? 'Failed') })),
        attempts: 1 + Math.max(0, config.segmentRetries),
      };
      await docs.set(path, { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
      log.error(`Lesson failed: ${failure.message}`, { ...fields, event: 'lesson.failed', duration_ms: Date.now() - startedAt, failed });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.failed', { ...counts, error: failure.message, errorInfo: failure, step: 'failed' });
    } catch (error) {
      if (isCancelled(error)) {
        if (rt.currentEpoch() === epoch) {
          await docs.set(path, { status: 'queued', statusDetail: 'Queued' }, { merge: true });
          await rt.emitLesson(uid, courseId, lessonId, 'lesson.queued', { step: 'cancelled' });
        }
        return;
      }
      const failure = rt.failureOf(error, fields);
      await docs.set(path, { status: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
      log.error(`Lesson failed: ${failure.code} ${failure.message}`, { ...fields, event: 'lesson.failed', code: failure.code });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.failed', { error: failure.message, errorInfo: failure, step: 'failed' });
    } finally {
      rt.events.endRun(courseId, runId);
    }
  };

  /**
   * Queues a lesson render. Idempotent: a lesson that is ready, still being written, or already rendering is left alone.
   * A failed lesson re-runs only its failed segments.
   */
  const wipeSegments = async (uid: string, courseId: string, lessonId: string) => {
    for (const row of (await docs.list(segmentsPath(uid, courseId, lessonId)))) {
      const base = segmentPath(uid, courseId, lessonId, row.id);
      for (const round of (await docs.list(`${base}/rounds`))) await docs.delete(`${base}/rounds/${round.id}`);
      await docs.delete(base);
    }
  };

  const renderLesson = (uid: string, lessonId: string, options: { userClicked?: boolean; auto?: boolean; force?: boolean; instructions?: string } = {}) => {
    const active = running.get(lessonId);
    if (active) return active;
    const work = (async () => {
      const found = await locateLesson(docs, uid, lessonId);
      if (!found) throw new Error('Lesson not found');
      const { courseId, doc } = found;
      if (doc.data.status === 'writing') return;
      if (!options.force && doc.data.status === 'ready') return;
      if (options.force) await wipeSegments(uid, courseId, lessonId);
    const stored = doc.data.priority as Priority | undefined;
    const priority: Priority = {
      courseId,
      userClicked: options.userClicked || stored?.userClicked || false,
      kind: options.auto ? 'auto' : (stored?.kind ?? 'background'),
      enqueuedAt: stored?.enqueuedAt ?? Date.now(),
    };
    if (doc.data.status === 'failed') {
      for (const row of (await docs.list(segmentsPath(uid, courseId, lessonId)))) {
        if (row.data.status === 'failed') await docs.set(segmentPath(uid, courseId, lessonId, row.id), { status: 'pending', error: null }, { merge: true });
      }
    }
    await docs.set(lessonPath(uid, courseId, lessonId), { status: 'queued', statusDetail: 'Queued', priority, error: null, errorInfo: null }, { merge: true });
    await rt.emitLesson(uid, courseId, lessonId, 'lesson.queued', { step: 'queued' });
      await renderNow(uid, courseId, lessonId, priority, options.instructions);
    })().finally(() => {
      if (running.get(lessonId) === work) running.delete(lessonId);
    });
    running.set(lessonId, work);
    return work;
  };

  /** Rebuilds one ready segment: new narration, new audio, then a new picture. The old cut stays if it fails. */
  const regenerateSegment = async (uid: string, lessonId: string, segmentId: string, request?: string) => {
    const found = await locateLesson(docs, uid, lessonId);
    if (!found) throw new Error('Lesson not found');
    const { courseId, doc } = found;
    const path = segmentPath(uid, courseId, lessonId, segmentId);
    const lessonDoc = lessonPath(uid, courseId, lessonId);
    const prior = (await docs.get(path))?.data;
    if (!prior) throw new Error('Segment not found');
    if (!prior.segment) {
      await renderLesson(uid, lessonId, { userClicked: true });
      return (await docs.get(path))?.data.segment as GeneratedSegment | null;
    }
    const lesson = doc.data as unknown as LessonDoc;
    const title = String(prior.title ?? 'this segment');
    const priority: Priority = { courseId, userClicked: true, enqueuedAt: Date.now() };
    const run: SegmentRun = {
      uid,
      courseId,
      lessonId,
      segmentId,
      lesson,
      priority,
      learner: { request },
      epoch: rt.currentEpoch(),
    };
    const restore = async (failure: GenerationErrorInfo | null) => {
      await docs.set(path, {
        status: prior.status,
        statusDetail: null,
        segment: prior.segment,
        narration: prior.narration,
        audio: prior.audio ?? null,
        durationInFrames: prior.durationInFrames,
        startFrame: prior.startFrame,
        error: failure?.message ?? null,
        errorInfo: failure,
      }, { merge: true });
      await retime(uid, courseId, lessonId);
      await docs.set(lessonDoc, { status: 'ready', statusDetail: null }, { merge: true });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.ready', { step: 'restored' });
      if (failure) await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.failed', { error: failure.message, errorInfo: failure, step: 'regenerate' });
    };
    try {
      await docs.set(path, { status: 'drafting', statusDetail: 'Rewriting the narration', audio: null }, { merge: true });
      const counts = await countReady(uid, courseId, lessonId);
      await docs.set(lessonDoc, { status: 'rendering', statusDetail: `Regenerating ${title}`, error: null, errorInfo: null }, { merge: true });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.rendering', { ...counts, detail: `Regenerating ${title}`, step: 'regenerate' });
      const rewritten = await rt.modelJson({
        name: 'narration',
        schema: narrationSchema,
        responseSchema: narrationResponseSchema,
        prompt: regenerateNarrationPrompt({
          lessonTitle: lesson.title,
          script: lesson.explanationSummary,
          title,
          narration: String(prior.narration ?? ''),
          request,
        }),
        priority,
        fields: { courseId, lessonId, segmentId },
      });
      await docs.set(path, { narration: rewritten.value.narration, audio: null, statusDetail: 'Recording narration' }, { merge: true });
      if (config.ttsEnabled) {
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.voicing', { step: 'voice' });
        const audio = await rt.tts.voice(uid, rewritten.value.narration, priority);
        await docs.set(path, { audio, voice: 'voiced', statusDetail: null }, { merge: true });
        await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.voiced', { step: 'voice' });
      }
      await retime(uid, courseId, lessonId);
      const next = await segmentOnce(run, 1);
      await docs.set(lessonDoc, { status: 'ready', statusDetail: null, error: null, errorInfo: null }, { merge: true });
      await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.ready', { step: 'regenerated', ...await countReady(uid, courseId, lessonId) });
      await rt.emitLesson(uid, courseId, lessonId, 'lesson.ready', { step: 'regenerated', ...await countReady(uid, courseId, lessonId) });
      return next;
    } catch (error) {
      if (!isCancelled(error)) await restore(rt.failureOf(error, { courseId, lessonId, segmentId }));
      throw error;
    }
  };

  const isRendering = (lessonId: string) => running.has(lessonId);
  const clear = () => running.clear();

  const voiceOne = async (uid: string, courseId: string, lessonId: string, segmentId: string, priority: Priority) => {
    const path = segmentPath(uid, courseId, lessonId, segmentId);
    const row = await docs.get(path);
    if (!row || row.data.audio || row.data.status === 'ready') return;
    if (!config.ttsEnabled) return;
    const narration = String(row.data.narration ?? '');
    await renewLease(docs, path);
    await docs.set(path, { voice: 'voicing', statusDetail: 'Recording narration' }, { merge: true });
    await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.voicing', { step: 'voice' });
    try {
      const audio = await rt.tts.voice(uid, narration, priority);
      await docs.set(path, { audio, voice: 'voiced', statusDetail: null }, { merge: true });
      await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.voiced', { step: 'voice' });
    } catch (error) {
      if (isCancelled(error)) throw error;
      const failure = rt.failureOf(error, { courseId, lessonId, segmentId });
      await docs.set(path, { status: 'failed', voice: 'failed', statusDetail: null, error: failure.message, errorInfo: failure }, { merge: true });
      await rt.emitSegment(uid, courseId, lessonId, segmentId, 'segment.voice_failed', { error: failure.message, errorInfo: failure, step: 'voice' });
    }
  };

  const buildSegment = async (uid: string, courseId: string, lessonId: string, segmentId: string, priority: Priority, epoch: number) => {
    const lesson = (await docs.get(lessonPath(uid, courseId, lessonId)))?.data as LessonDoc | undefined;
    if (!lesson) throw new Error('Lesson not found');
    return runSegment({ uid, courseId, lessonId, segmentId, lesson, priority, epoch });
  };

  return {
    renderLesson,
    regenerateSegment,
    isRendering,
    clear,
    planSegments,
    voiceSegments,
    voiceOne,
    retime,
    buildSegment,
    countReady,
  };
};

export type LessonStages = ReturnType<typeof createLessonStages>;
