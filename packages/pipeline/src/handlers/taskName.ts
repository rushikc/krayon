import { createHash } from 'node:crypto';

/** Cloud Tasks ids are [A-Za-z0-9_-] and at most 500 characters. Longer names are hashed. */
export const taskName = (parts: Array<string | number | null | undefined>) => {
  const raw = parts
    .filter((part) => part !== undefined && part !== null && String(part) !== '')
    .map((part) => String(part))
    .join('-')
    .replace(/[^A-Za-z0-9_-]/g, '_');
  if (raw.length > 0 && raw.length <= 500) return raw;
  return createHash('sha256').update(raw || 'task').digest('hex');
};
