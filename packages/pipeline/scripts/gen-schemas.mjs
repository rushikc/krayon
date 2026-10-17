// Regenerates src/ai_schemas.json from the zod schemas in @krayon/shared (build shared first).
// The pipeline reads the schemas from @krayon/shared at runtime; this file is a reviewable copy,
// and local-backend/test/schemas.test.ts fails when it drifts.
import { writeFileSync } from 'node:fs';
import { modelResponseSchemas } from '@krayon/shared';

const { roadmap, lesson, segment, review } = modelResponseSchemas;
const file = new URL('../src/ai_schemas.json', import.meta.url);
writeFileSync(file, `${JSON.stringify({ roadmap, lesson, segment, review }, null, 2)}\n`);
console.log(`wrote ${file.pathname}`);
