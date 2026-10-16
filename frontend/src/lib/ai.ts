import type { Schema } from 'firebase/ai';
import type { z } from 'zod';
import { ApiError, apiJson, uploadFile } from './api.ts';
import {
  lessonResponseSchema,
  lessonSchema,
  roadmapResponseSchema,
  roadmapSchema,
  segmentResponseSchemaOnly,
  segmentSchema,
} from './aiSchemas.ts';
import type { GeneratedSegment, RoadmapTopic, SceneIssue } from '../remotion/scene.ts';
import { validateSegment } from './sceneValidator.ts';

// Gemini now runs server-side in local-backend; the browser never sees an API key.
const MODEL = 'gemini-2.5-flash';

export const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const readJson = (text: string): unknown => {
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
  return JSON.parse(trimmed);
};

const issueText = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ');

const generateValidated = async <T>(
  responseSchema: Schema,
  validator: z.ZodType<T>,
  prompt: string,
  file: File,
): Promise<T> => {
  const upload = await uploadFile(file);
  const schemaJson = (responseSchema as Schema & { toJSON?: () => unknown }).toJSON?.() ?? responseSchema;

  const attempt = async (hint?: string) => {
    const result = await apiJson<{ text: string }>('/api/ai/generate', 'POST', {
      model: MODEL,
      uploadId: upload.id,
      responseSchema: schemaJson,
      prompt: hint ? `${prompt}\n\nThe previous JSON failed validation: ${hint}` : prompt,
    });
    let parsed: unknown;
    try {
      parsed = readJson(result.text);
    } catch {
      throw new Error('The model did not return JSON.');
    }
    const checked = validator.safeParse(parsed);
    if (!checked.success) throw new Error(issueText(checked.error));
    return checked.data;
  };

  try {
    return await attempt();
  } catch (error) {
    // Backend or network errors are not fixed by re-prompting.
    if (error instanceof ApiError) throw error;
    const hint = error instanceof Error ? error.message : 'Invalid JSON';
    return await attempt(hint);
  }
};

const roadmapPrompt = `Read the attached document and split it into a study roadmap of smaller topics.
Return 3 to 7 topics.
Each id is unique kebab-case.
prerequisites lists ids of other topics in this same list, or is empty.
sourcePages lists 1-based page numbers that support the topic. For a photo, use [1].
Stay inside what the document actually says.`;

export const generateRoadmap = (file: File) =>
  generateValidated(roadmapResponseSchema, roadmapSchema, roadmapPrompt, file);

const templateGuide = `Each segment uses exactly one scene.layout. Fill its slots. Do not send coordinates.
Optional appearAt is a frame number inside the segment. Omit it to let items appear in order.

titleCard: the opening. Fields: title, optional subtitle.
bullets: a short list of facts. Fields: heading, items[{text, appearAt?}] with 1 to 5 items. A bullet is about 12 words.
flow: a sequence, such as a request path. Fields: optional heading, direction horizontal or vertical, nodes[{id, label, sublabel?, appearAt?}] with 2 to 6 nodes, edges[{from, to, label?}] whose from and to are node ids. A node label is about 6 words.
compare: two sides. Fields: optional heading, left{title, points[{text, appearAt?}]}, right with the same shape. 1 to 5 points on a side.
hubSpoke: one center with parts around it, such as Porter's five forces. Fields: center{id, label}, spokes[{id, label, sublabel?, appearAt?}] with 3 to 6 spokes. Spoke labels are about 6 words.
chart: a graph with axes. Fields: optional heading, xLabel, yLabel, curves[{id, label, kind: upward or downward or flat, shift?: left or right, appearAt?}], markers[{type: intersection or point, curveIds, label, appearAt?}]. Supply slopes upward. Demand slopes downward. Mark their crossing with an intersection marker labeled equilibrium. A shift sets shift on that curve.
timeline: steps over time. Fields: optional heading, steps[{label, detail?, appearAt?}] with 2 to 6 steps.
callout: one statement. Fields: kind definition or example or keyPoint, title, body.

Wrap math in single dollar signs, like $P = Q$.`;

export type LessonProgress = {
  phase: 'writing' | 'checking' | 'repairing';
  detail: string;
};

const lessonPrompt = (topic: RoadmapTopic) => `Create a short lesson for this topic, grounded only in the attached document.
Topic id: ${topic.id}
Title: ${topic.title}
Summary: ${topic.summary}

Return 3 to 5 segments.
durationInFrames is between 90 and 240 at 30 fps.
narration is one or two sentences for the caption.
studyDoc is markdown notes for the same topic.
One template per segment. Node labels are about 6 words. Bullets are about 12 words.

${templateGuide}`;

const segmentPrompt = (topic: RoadmapTopic, segment: GeneratedSegment) => `Explain this one lesson segment in more depth.
Topic: ${topic.title}
Keep the segment id exactly "${segment.id}".
You may increase durationInFrames. Stay between 90 and 450 frames at 30 fps.
Return one segment, not a full lesson. Use exactly one template.
Node labels are about 6 words. Bullets are about 12 words.
Ground every label in the attached document.

${templateGuide}

Current segment:
${JSON.stringify(publicSegment(segment))}`;

const repairPrompt = (segment: GeneratedSegment, issues: SceneIssue[]) => `Fix only these problems. Return the corrected segment, not a full lesson.
Keep the segment id exactly "${segment.id}".
Do not add coordinates. Use the same template unless a problem says the template itself is invalid.

Problems:
${issues.map((item) => `- ${item.path}: ${item.message}`).join('\n')}

${templateGuide}

Current segment:
${JSON.stringify(publicSegment(segment))}`;

const publicSegment = (segment: GeneratedSegment) => ({
  id: segment.id,
  title: segment.title,
  durationInFrames: segment.durationInFrames,
  narration: segment.narration,
  scene: segment.scene,
});

const clampPlayback = (value: number) => Math.min(450, Math.max(90, Math.round(value)));

const withDebug = (segment: GeneratedSegment, issues: SceneIssue[], repairRounds: number): GeneratedSegment => ({
  ...segment,
  durationInFrames: issues.some((item) => item.code === 'duration')
    ? clampPlayback(segment.durationInFrames)
    : Math.round(segment.durationInFrames),
  debug: { issues, repairRounds },
});

const repairSegments = async (
  segments: GeneratedSegment[],
  file: File,
  onProgress?: (progress: LessonProgress) => void,
) => {
  onProgress?.({ phase: 'checking', detail: 'Checking the lesson…' });
  const candidates = segments.map((segment) => ({
    segment,
    issues: validateSegment(segment),
    rounds: 0,
  }));

  for (let round = 0; round < 2; round += 1) {
    const pending = candidates.filter((candidate) => candidate.issues.length > 0);
    if (pending.length === 0) break;
    const positions = pending.map(
      (candidate) => segments.findIndex((item) => item.id === candidate.segment.id) + 1,
    );
    const detail =
      pending.length === 1
        ? `Repairing segment ${positions[0]} of ${segments.length}`
        : `Repairing segments ${positions.join(' and ')} of ${segments.length}`;
    onProgress?.({ phase: 'repairing', detail });
    await Promise.all(
      pending.map(async (candidate) => {
        try {
          const next = await generateValidated(
            segmentResponseSchemaOnly,
            segmentSchema,
            repairPrompt(candidate.segment, candidate.issues),
            file,
          );
          const repaired = { ...next, id: candidate.segment.id };
          const nextIssues = validateSegment(repaired);
          candidate.rounds += 1;
          if (nextIssues.length < candidate.issues.length) {
            candidate.segment = repaired;
            candidate.issues = nextIssues;
          }
        } catch {
          candidate.rounds += 1;
        }
      }),
    );
  }

  return candidates.map((candidate) => withDebug(candidate.segment, candidate.issues, candidate.rounds));
};

export const generateLesson = async (
  topic: RoadmapTopic,
  file: File,
  onProgress?: (progress: LessonProgress) => void,
) => {
  onProgress?.({ phase: 'writing', detail: 'Writing the lesson…' });
  const lesson = await generateValidated(lessonResponseSchema, lessonSchema, lessonPrompt(topic), file);
  const segments = await repairSegments(lesson.segments, file, onProgress);
  return { ...lesson, segments };
};

export const regenerateSegment = async (
  topic: RoadmapTopic,
  file: File,
  segment: GeneratedSegment,
  onProgress?: (progress: LessonProgress) => void,
) => {
  onProgress?.({ phase: 'writing', detail: 'Writing the lesson…' });
  const next = await generateValidated(
    segmentResponseSchemaOnly,
    segmentSchema,
    segmentPrompt(topic, segment),
    file,
  );
  const [repaired] = await repairSegments([{ ...next, id: segment.id }], file, onProgress);
  return repaired ?? { ...next, id: segment.id };
};
