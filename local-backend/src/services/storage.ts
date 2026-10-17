import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BlobMeta, BlobStorage } from '@krayon/shared';
import { getLogger } from '../logging.js';

export type { BlobMeta };

const log = getLogger('krayon.storage');

const safe = (value: string) => value.replace(/[^A-Za-z0-9_.-]/g, '_');

export class LocalStorage implements BlobStorage {
  constructor(private readonly root: string) {
    mkdirSync(root, { recursive: true });
  }

  private dir(owner: string, blobId: string) {
    return path.join(this.root, 'uploads', safe(owner), safe(blobId));
  }

  put(owner: string, name: string, contentType: string, data: Uint8Array): BlobMeta {
    const id = randomUUID().replace(/-/g, '');
    const folder = this.dir(owner, id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(path.join(folder, 'content'), data);
    const blob: BlobMeta = {
      id,
      name,
      content_type: contentType,
      size: data.length,
      path: `uploads/${owner}/${id}`,
    };
    writeFileSync(path.join(folder, 'meta.json'), JSON.stringify(blob));
    log.debug(`put ${blob.path}`, {
      event: 'storage.put',
      path: blob.path,
      name,
      content_type: contentType,
      size: data.length,
    });
    return blob;
  }

  get(owner: string, blobId: string): { blob: BlobMeta; data: Buffer } | null {
    const folder = this.dir(owner, blobId);
    const content = path.join(folder, 'content');
    try {
      const data = readFileSync(content);
      const blob = JSON.parse(readFileSync(path.join(folder, 'meta.json'), 'utf8')) as BlobMeta;
      log.debug(`get ${owner}/${blobId}`, { event: 'storage.get', owner, id: blobId, found: true });
      return { blob, data };
    } catch {
      log.debug(`get miss ${owner}/${blobId}`, { event: 'storage.get', owner, id: blobId, found: false });
      return null;
    }
  }

  clear(): { files: number; bytes: number } {
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
    const contents = files.filter((file) => path.basename(file) === 'content');
    const bytes = files.reduce((total, file) => {
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
