import type { FastifyReply } from 'fastify';

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

/** Sends a buffer with byte-range support. Used by GET /api/audio/:blobId. */
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
