import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { settings } from './config.js';

export const requestContext = new AsyncLocalStorage<string>();

export const currentRequestId = () => requestContext.getStore() ?? '-';

const LEVELS: Record<string, number> = { DEBUG: 10, INFO: 20, WARNING: 30, ERROR: 40 };

const SECRET_KEY = /(authorization|cookie|api[-_]?key|token|secret|password|credential)/i;
const SECRET_VALUE = /(AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_.-]+|Bearer\s+[0-9A-Za-z_.=-]+)/g;

export const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[REDACTED]' : redact(item);
    }
    return out;
  }
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTED]');
  return value;
};

export const truncate = (text: string, limit = settings.logBodyMax) =>
  text.length <= limit ? text : `${text.slice(0, limit)}…[+${text.length - limit} chars]`;

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

const timestamps = (date = new Date()) => {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const json = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
  const text = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())},${pad(date.getMilliseconds(), 3)}`;
  return { json, text };
};

class RotatingFile {
  constructor(
    private readonly file: string,
    private readonly maxBytes = 5_000_000,
    private readonly backups = 5,
  ) {}

  write(line: string) {
    const bytes = Buffer.byteLength(line);
    if (existsSync(this.file) && statSync(this.file).size + bytes > this.maxBytes) {
      for (let index = this.backups; index >= 1; index -= 1) {
        const source = index === 1 ? this.file : `${this.file}.${index - 1}`;
        if (existsSync(source)) renameSync(source, `${this.file}.${index}`);
      }
    }
    appendFileSync(this.file, line);
  }
}

let textFile: RotatingFile | null = null;
let jsonFile: RotatingFile | null = null;
let ready = false;

export const setupLogging = () => {
  if (ready) return;
  mkdirSync(settings.logDir, { recursive: true });
  mkdirSync(settings.dataDir, { recursive: true });
  textFile = new RotatingFile(path.join(settings.logDir, 'app.log'));
  jsonFile = new RotatingFile(path.join(settings.logDir, 'app.jsonl'));
  ready = true;
};

export type LogFields = Record<string, unknown>;

const write = (level: string, logger: string, msg: string, fields?: LogFields, error?: unknown) => {
  if ((LEVELS[level] ?? 20) < (LEVELS[settings.logLevel] ?? 20)) return;
  setupLogging();
  const { json, text } = timestamps();
  const safeFields = fields ? (redact(fields) as LogFields) : undefined;
  const record: Record<string, unknown> = {
    ts: json,
    level,
    logger,
    request_id: currentRequestId(),
    msg: redact(msg),
  };
  if (safeFields) Object.assign(record, safeFields);
  if (error instanceof Error) {
    record.exc = error.stack ?? error.message;
  } else if (error) {
    record.exc = String(error);
  }
  const line = JSON.stringify(record);
  jsonFile?.write(`${line}\n`);
  const extra = safeFields && Object.keys(safeFields).length > 0
    ? ` ${truncate(JSON.stringify(safeFields), settings.logBodyMax * 2)}`
    : '';
  const textLine = `${text} ${level.padEnd(7)} [${record.request_id}] ${logger}: ${msg}${extra}`;
  const printable = error ? textLine : String(redact(textLine));
  const exc = record.exc ? `\n${record.exc}` : '';
  const full = `${printable}${exc}\n`;
  textFile?.write(full);
  const stream = level === 'ERROR' ? process.stderr : process.stdout;
  stream.write(full);
};

export const getLogger = (name: string) => ({
  debug: (msg: string, fields?: LogFields) => write('DEBUG', name, msg, fields),
  info: (msg: string, fields?: LogFields) => write('INFO', name, msg, fields),
  warning: (msg: string, fields?: LogFields) => write('WARNING', name, msg, fields),
  error: (msg: string, fields?: LogFields, error?: unknown) => write('ERROR', name, msg, fields, error),
});
