import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { currentRequestId, redact, requestContext, truncate } from './logging.js';
import { getLogger } from './logging.js';
import { settings } from './config.js';

const log = getLogger('krayon.http');
const REDACT_HEADERS = new Set(['authorization', 'cookie', 'x-api-key', 'x-goog-api-key', 'x-firebase-appcheck']);

type RequestWithRaw = FastifyRequest & { rawBody?: Buffer; responseBody?: Buffer };

const shorten = (value: unknown, limit = settings.logBodyMax): unknown => {
  const cap = (item: unknown): unknown => {
    if (typeof item === 'string') return truncate(item, 500);
    if (Array.isArray(item)) {
      const head = item.slice(0, 50).map((entry) => cap(entry));
      if (item.length > 50) head.push(`…[+${item.length - 50} items]`);
      return head;
    }
    if (item && typeof item === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(item as Record<string, unknown>)) out[key] = cap(entry);
      return out;
    }
    return item;
  };
  const out = cap(value);
  const encoded = JSON.stringify(out);
  if (encoded.length > limit * 2) return truncate(encoded, limit);
  return out;
};

export const describeBody = (contentType: string, body: Buffer): unknown => {
  if (!body.length) return null;
  const ctype = contentType.toLowerCase();
  if (ctype.includes('multipart/form-data') && ctype.includes('boundary=')) {
    const boundary = ctype.split('boundary=', 2)[1]?.split(';')[0]?.trim().replace(/^"|"$/g, '') ?? '';
    const fields: Record<string, string> = {};
    const files: Array<Record<string, unknown>> = [];
    const marker = Buffer.from(`--${boundary}`);
    for (const part of splitBuffer(body, marker)) {
      const sep = part.indexOf('\r\n\r\n');
      if (sep < 0) continue;
      const head = part.subarray(0, sep).toString('utf8');
      let content = part.subarray(sep + 4);
      if (content.subarray(-2).equals(Buffer.from('\r\n'))) content = content.subarray(0, -2);
      let name: string | undefined;
      let filename: string | undefined;
      let ptype = 'text/plain';
      for (const line of head.split('\r\n')) {
        const low = line.toLowerCase();
        if (low.startsWith('content-disposition')) {
          for (const item of line.split(';')) {
            const [key, ...rest] = item.trim().split('=');
            const value = rest.join('=').replace(/^"|"$/g, '');
            if (key === 'name') name = value;
            if (key === 'filename') filename = value;
          }
        } else if (low.startsWith('content-type')) {
          ptype = line.split(':', 2)[1]?.trim() ?? ptype;
        }
      }
      if (filename !== undefined) {
        files.push({ field: name, filename, content_type: ptype, size: content.length });
      } else if (name) {
        fields[name] = truncate(content.toString('utf8'), 200);
      }
    }
    return { form: redact(fields), files };
  }
  if (ctype.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(body.toString('utf8'));
    return { form: redact(Object.fromEntries(params.entries())) };
  }
  const text = body.toString('utf8');
  if (ctype.includes('json')) {
    try {
      return shorten(redact(JSON.parse(text) as unknown));
    } catch {
      /* fall through */
    }
  }
  return truncate(String(redact(text)));
};

const splitBuffer = (body: Buffer, marker: Buffer) => {
  const parts: Buffer[] = [];
  let start = 0;
  while (start < body.length) {
    const index = body.indexOf(marker, start);
    if (index < 0) break;
    if (index > start) parts.push(body.subarray(start, index));
    start = index + marker.length;
  }
  return parts;
};

export const registerRequestLogging = (app: FastifyInstance) => {
  app.addHook('onRequest', async (request, reply) => {
    const incoming = request.headers['x-request-id'];
    const rid = (typeof incoming === 'string' && incoming.trim()) || randomBytes(6).toString('hex');
    requestContext.enterWith(rid);
    reply.header('x-request-id', rid);
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const target = request as RequestWithRaw;
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('image/') || type.startsWith('application/pdf') || type.startsWith('audio/')) {
      const size = Buffer.isBuffer(payload) ? payload.length : typeof payload === 'string' ? Buffer.byteLength(payload) : 0;
      target.responseBody = Buffer.from(JSON.stringify({ bytes: size, content_type: type }));
      return payload;
    }
    if (typeof payload === 'string') target.responseBody = Buffer.from(payload);
    else if (Buffer.isBuffer(payload)) target.responseBody = payload.subarray(0, 64_000);
    else target.responseBody = Buffer.alloc(0);
    if ((target.responseBody?.length ?? 0) > 64_000 && target.responseBody) {
      target.responseBody = target.responseBody.subarray(0, 64_000);
    }
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    const started = (request as FastifyRequest & { startedAt?: number }).startedAt ?? reply.elapsedTime;
    const duration = Math.round((reply.elapsedTime || started) * 10) / 10;
    const raw = request as RequestWithRaw & { uploadLog?: unknown };
    const requestBody = raw.uploadLog
      ?? (request.body === undefined || request.body === null
        ? null
        : shorten(redact(request.body)));
    const headers = request.headers;
    const safeHeaders: Record<string, string> = {};
    for (const key of ['content-type', 'content-length', 'user-agent', 'x-user-id', 'origin', ...REDACT_HEADERS]) {
      const value = headers[key];
      if (typeof value !== 'string') continue;
      safeHeaders[key] = REDACT_HEADERS.has(key) ? '[REDACTED]' : value;
    }
    const query = request.query && typeof request.query === 'object' ? redact(request.query) : {};
    const status = reply.statusCode;
    const data = {
      event: 'response',
      method: request.method,
      path: request.url.split('?')[0],
      query,
      user: typeof headers['x-user-id'] === 'string' ? headers['x-user-id'] : 'local-user',
      client: request.ip,
      status,
      duration_ms: duration,
      request_headers: safeHeaders,
      request_body: requestBody,
      response_type: reply.getHeader('content-type'),
      response_body: describeBody(String(reply.getHeader('content-type') ?? ''), raw.responseBody ?? Buffer.alloc(0)),
    };
    const msg = `${request.method} ${data.path} -> ${status} (${duration.toFixed(1)} ms)`;
    if (status >= 500) log.error(msg, data);
    else if (status >= 400) log.warning(msg, data);
    else log.info(msg, data);
  });
};

export const httpError = (statusCode: number, detail: string) => {
  const error = new Error(detail) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

export const installErrorHandler = (app: FastifyInstance) => {
  app.setErrorHandler((error: unknown, request, reply: FastifyReply) => {
    const status = (error as { statusCode?: number; message?: string }).statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Request failed';
    if (status >= 500) {
      log.error(`Unhandled exception on ${request.method} ${request.url}`, { event: 'error' }, error);
      reply.status(500).send({ detail: 'Internal server error', requestId: currentRequestId() });
      return;
    }
    reply.status(status).send({ detail: message || 'Request failed' });
  });
  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ detail: 'Not found' });
  });
};
