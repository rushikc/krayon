import { getAI, getGenerativeModel, AgentPlatformBackend } from 'firebase/ai';
import type { Schema } from 'firebase/ai';
import type { z } from 'zod';
import { firebaseApp } from './firebase.ts';
import {
  lessonResponseSchema,
  lessonSchema,
  roadmapResponseSchema,
  roadmapSchema,
  segmentResponseSchemaOnly,
  segmentSchema,
} from './aiSchemas.ts';
import type { GeneratedSegment, RoadmapTopic } from '../remotion/scene.ts';

const MODEL = 'gemini-2.5-flash';

const getModel = (responseSchema: Schema) =>
  getGenerativeModel(getAI(firebaseApp, { backend: new AgentPlatformBackend() }), {
    model: MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

export const MAX_INLINE_BYTES = 20 * 1024 * 1024;

const fileToInlinePart = async (file: File) => {
  const mimeType =
    file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return {
    type: 'inlineData' as const,
    inlineData: {
      mimeType,
      data: btoa(binary),
    },
  };
};

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
  const model = getModel(responseSchema);
  const filePart = await fileToInlinePart(file);

  const attempt = async (hint?: string) => {
    const result = await model.generateContent([
      filePart,
      {
        type: 'text' as const,
        text: hint ? `${prompt}\n\nThe previous JSON failed validation: ${hint}` : prompt,
      },
    ]);
    let parsed: unknown;
    try {
      parsed = readJson(result.response.text());
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

const lessonPrompt = (topic: RoadmapTopic) => `Create a short lesson for this topic, grounded only in the attached document.
Topic id: ${topic.id}
Title: ${topic.title}
Summary: ${topic.summary}

Return 3 to 5 segments.
durationInFrames is between 90 and 240 at 30 fps.
narration is one or two sentences for the caption.
scene.elements may only use types title, text, box, arrow, badge, equation, lineGraph, and image.
Each element start and end are frame numbers inside that segment, with end greater than start.
equation uses latex. lineGraph uses points of x and y. image uses a short ref label, not a URL.
studyDoc is markdown notes for the same topic.`;

export const generateLesson = (topic: RoadmapTopic, file: File) =>
  generateValidated(lessonResponseSchema, lessonSchema, lessonPrompt(topic), file);

const segmentPrompt = (topic: RoadmapTopic, segment: GeneratedSegment) => `Explain this one lesson segment in more depth.
Topic: ${topic.title}
Keep the segment id exactly "${segment.id}".
You may increase durationInFrames. Stay between 90 and 450 frames at 30 fps.
Use only scene element types title, text, box, arrow, badge, equation, lineGraph, and image.
Return one segment, not a full lesson.

Current segment:
${JSON.stringify(segment)}`;

export const regenerateSegment = (topic: RoadmapTopic, file: File, segment: GeneratedSegment) =>
  generateValidated(segmentResponseSchemaOnly, segmentSchema, segmentPrompt(topic, segment), file);
