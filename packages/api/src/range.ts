import type { FastifyReply } from 'fastify';
import type { BlobStorage } from '@krayon/shared';
import { httpError } from './errors.js';

export type ByteRange = { start: number; end: number };

/** `bytes=start-end`, `bytes=start-`, or `bytes=-suffix`. Null when the header is absent. */
export const parseByteRange = (header: string | undefined, size: number): ByteRange | 'bad' | null => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return 'bad';
  const startRaw = match[1] ?? '';
  const endRaw = match[2] ?? '';
  if (startRaw === '' && endRaw === '') return 'bad';
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isInteger(suffix) || suffix <= 0) return 'bad';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(startRaw);
  const end = endRaw === '' ? size - 1 : Number(endRaw);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return 'bad';
  return { start, end: Math.min(end, size - 1) };
};

const readStream = async (stream: AsyncIterable<Uint8Array>) => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

/** Sends one byte range from storage. Reads only that range, not the whole blob. */
export const sendRange = async (
  blobs: BlobStorage,
  reply: FastifyReply,
  key: string,
  rangeHeader: string | undefined,
  contentType: string,
) => {
  const stat = await blobs.stat(key);
  if (!stat) throw httpError(404, 'Not found');
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  reply.type(contentType);
  const range = parseByteRange(rangeHeader, stat.size);
  if (range === 'bad') {
    reply.header('Content-Range', `bytes */${stat.size}`);
    return reply.code(416).send();
  }
  const start = range?.start ?? 0;
  const end = range?.end ?? stat.size - 1;
  const stream = await blobs.stream(key, { start, end });
  if (!stream) throw httpError(404, 'Not found');
  const data = await readStream(stream);
  if (!range) {
    reply.header('Content-Length', String(data.length));
    return reply.send(data);
  }
  reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  reply.header('Content-Length', String(data.length));
  return reply.code(206).send(data);
};

/** Buffer helper kept for tests that already hold the bytes. */
export const sendBytes = (reply: FastifyReply, data: Buffer, rangeHeader: string | undefined, contentType: string) => {
  const size = data.length;
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  reply.type(contentType);
  const range = parseByteRange(rangeHeader, size);
  if (range === 'bad') {
    reply.header('Content-Range', `bytes */${size}`);
    return reply.code(416).send();
  }
  if (!range) {
    reply.header('Content-Length', String(size));
    return reply.send(data);
  }
  const slice = data.subarray(range.start, range.end + 1);
  reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
  reply.header('Content-Length', String(slice.length));
  return reply.code(206).send(slice);
};
