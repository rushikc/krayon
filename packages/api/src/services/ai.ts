import { randomUUID } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { looseUploadKey, reserveUsage } from '@krayon/pipeline';
import type { ApiDeps } from '../deps.js';
import { authHeader } from '../user.js';
import { httpError } from '../errors.js';
import { readUpload } from './uploads.js';

export const postUpload = (deps: ApiDeps) => async (request: FastifyRequest) => {
  const user = deps.auth.currentUser(authHeader(request));
  const file = await request.file();
  if (!file) throw httpError(422, 'file is required');
  await reserveUsage(deps.docs, 'upload', deps.caps, user.uid);
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
