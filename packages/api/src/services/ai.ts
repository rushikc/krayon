import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { GeminiNotConfigured, looseUploadKey } from '@krayon/pipeline';
import { mediaKey, modelResponseSchemas, segmentModelSchema } from '@krayon/shared';
import { z } from 'zod';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { generationErrorResponse, httpError } from '../errors.js';
import { readUpload } from './uploads.js';

const generateBody = z.object({
  prompt: z.string(),
  uploadId: z.string().nullish(),
  responseSchema: z.record(z.string(), z.unknown()).nullish(),
  schema: z.enum(['segment']).nullish(),
  model: z.string().nullish(),
});

const namedSchemas = { segment: segmentModelSchema } as const;

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw httpError(422, result.error.issues.map((issue) => issue.message).join('; '));
  return result.data;
};

export const postUpload = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = deps.auth.currentUser(authHeader(request));
  const file = await request.file();
  if (!file) throw httpError(422, 'file is required');
  const read = await readUpload(file, deps.maxUploadBytes);
  (request as { uploadLog?: unknown }).uploadLog = {
    files: [{ field: 'file', filename: file.filename, content_type: file.mimetype, size: read.data.length }],
  };
  const key = looseUploadKey(user.uid, randomUUID().replace(/-/g, ''), read.name, read.type);
  const stat = await deps.blobs.put(key, read.data, { contentType: read.type });
  const blob = { id: key, name: read.name, content_type: read.type, size: stat.size, path: key };
  await deps.docs.set(`users/${user.uid}/uploads/${key.split('/').pop()}`, blob);
  return blob;
};

export const aiGenerate = (deps: ApiDeps) => async (request: FastifyRequest, reply: FastifyReply) => {
  const user = deps.auth.currentUser(authHeader(request));
  const body = parse(generateBody, request.body);
  let files: { data: Buffer; mimeType: string }[] | undefined;
  if (body.uploadId) {
    const uploadKey = mediaKey(body.uploadId) ?? (body.uploadId.includes('/') ? body.uploadId : null);
    if (!uploadKey?.startsWith(`users/${user.uid}/`)) throw httpError(404, 'Upload not found. Upload the file again.');
    const found = await deps.blobs.get(uploadKey);
    if (!found) throw httpError(404, 'Upload not found. Upload the file again.');
    files = [{ data: Buffer.from(found.data), mimeType: found.stat.contentType }];
  }
  const fail = (error: unknown) => {
    if (error instanceof GeminiNotConfigured) return reply.code(503).send({ detail: error.message, code: 'UPSTREAM' });
    const mapped = generationErrorResponse(error, deps.requestId());
    deps.log.warning(`AI generate failed: ${mapped.status} ${mapped.body.code}`, {
      event: 'ai.generate',
      schema_name: body.schema ?? null,
      status: mapped.status,
      code: mapped.body.code,
    });
    const detail = body.schema ? mapped.body.message : `Gemini request failed: ${mapped.body.message}`;
    return reply.code(mapped.status).send({ ...mapped.body, detail });
  };
  if (body.schema) {
    try {
      const result = await deps.pipeline.generateNamed(
        body.schema,
        namedSchemas[body.schema] as z.ZodType<unknown>,
        modelResponseSchemas[body.schema],
        body.prompt,
        files ?? [],
        body.model,
      );
      return { text: JSON.stringify(result.value), data: result.value, attempts: result.attempts };
    } catch (error) {
      return fail(error);
    }
  }
  try {
    const text = await deps.pipeline.gemini.generateJson(body.prompt, body.responseSchema ?? undefined, files, body.model);
    return { text };
  } catch (error) {
    return fail(error);
  }
};
