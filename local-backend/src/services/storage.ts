import { createReadStream } from 'node:fs';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BlobStat, BlobStorage } from '@krayon/shared';
import { getLogger } from '../logging.js';

const log = getLogger('krayon.storage');

const safeKey = (key: string) => {
  if (!key || key.startsWith('/') || key.includes('..') || key.includes('\\') || key.includes('\0')) {
    throw new Error('Invalid storage key');
  }
  return key;
};

export class LocalStorage implements BlobStorage {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  private file(key: string) {
    return path.join(this.root, safeKey(key));
  }

  private metaFile(key: string) {
    return `${this.file(key)}.meta.json`;
  }

  async put(key: string, data: Uint8Array, opts: { contentType: string }): Promise<BlobStat> {
    const file = this.file(key);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, data);
    const stat: BlobStat = { key, size: data.byteLength, contentType: opts.contentType, updatedAt: Date.now() };
    writeFileSync(this.metaFile(key), JSON.stringify(stat));
    log.debug(`put ${key}`, { event: 'storage.put', path: key, content_type: opts.contentType, size: data.byteLength });
    return stat;
  }

  async stat(key: string): Promise<BlobStat | null> {
    try {
      const meta = JSON.parse(readFileSync(this.metaFile(key), 'utf8')) as BlobStat;
      const size = statSync(this.file(key)).size;
      return { ...meta, key, size };
    } catch {
      return null;
    }
  }

  async get(key: string) {
    const stat = await this.stat(key);
    if (!stat) return null;
    try {
      const data = readFileSync(this.file(key));
      log.debug(`get ${key}`, { event: 'storage.get', path: key, found: true });
      return { data, stat };
    } catch {
      return null;
    }
  }

  async stream(key: string, range?: { start: number; end: number }) {
    const stat = await this.stat(key);
    if (!stat) return null;
    return createReadStream(this.file(key), range ? { start: range.start, end: range.end } : undefined);
  }

  async delete(key: string) {
    const file = this.file(key);
    let deleted = false;
    try {
      rmSync(file, { force: true });
      rmSync(this.metaFile(key), { force: true });
      deleted = true;
    } catch {
      deleted = false;
    }
    return deleted;
  }

  /** Local admin reset. Not part of the BlobStorage port. */
  clear() {
    const walk = (dir: string): string[] => {
      let found: string[] = [];
      let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true }).map((entry) => ({
          name: String(entry.name),
          isDirectory: () => entry.isDirectory(),
        }));
      } catch {
        return found;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) found = found.concat(walk(full));
        else found.push(full);
      }
      return found;
    };
    const files = walk(this.root);
    const contents = files.filter((file) => !file.endsWith('.meta.json'));
    const bytes = contents.reduce((total, file) => {
      try {
        return total + statSync(file).size;
      } catch {
        return total;
      }
    }, 0);
    rmSync(this.root, { recursive: true, force: true });
    mkdirSync(this.root, { recursive: true });
    const result = { files: contents.length, bytes };
    log.debug('clear', { event: 'storage.clear', ...result });
    return result;
  }
}
