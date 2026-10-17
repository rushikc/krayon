// Response schemas live on the server: POST /api/ai/generate takes a schema name (roadmap, lesson,
// segment) and uses the Gemini schema generated from these zod schemas, so frontend and pipeline
// cannot drift. The *ModelSchema variants fill display-only defaults before validating.
export {
  layoutSchema,
  lessonModelSchema,
  lessonSchema,
  roadmapSchema,
  segmentModelSchema,
  segmentSchema,
} from '@krayon/shared';
export type { ModelSchemaName, ParsedLesson, ParsedRoadmap, ParsedSegment } from '@krayon/shared';
