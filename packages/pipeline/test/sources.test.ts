import { readFileSync } from 'node:fs';
import type { BlobStorage } from '@krayon/shared';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { createSourceCache } from '../src/pdf.js';
import { assertSliced } from '../src/runtime.js';
import { memoryDocs } from './helpers.js';

const pdfOf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) doc.addPage([200, 200]).drawText(`Page ${index + 1}`, { x: 20, y: 100 });
  return doc.save();
};

const sourceKey = 'users/u/sources/c/0.pdf';

const blobsWith = (data: Uint8Array) => {
  const stored = new Map<string, { data: Uint8Array; stat: { key: string; size: number; contentType: string; updatedAt: number } }>();
  stored.set(sourceKey, { data, stat: { key: sourceKey, size: data.byteLength, contentType: 'application/pdf', updatedAt: 0 } });
  return {
    put: async (key: string, bytes: Uint8Array, opts: { contentType: string }) => {
      const stat = { key, size: bytes.byteLength, contentType: opts.contentType, updatedAt: 0 };
      stored.set(key, { data: bytes, stat });
      return stat;
    },
    get: async (key: string) => stored.get(key) ?? null,
    stat: async (key: string) => stored.get(key)?.stat ?? null,
    stream: async () => null,
    delete: async (key: string) => stored.delete(key),
  } as unknown as BlobStorage;
};

describe('page slices', () => {
  it('sends only the requested pages, and marks only full() as the whole document', async () => {
    const cache = createSourceCache(blobsWith(await pdfOf(8)), memoryDocs().docs);
    const slice = await cache.slice('u', sourceKey, 2, 4);
    expect(slice.full).toBeUndefined();
    expect(slice.pages).toEqual({ start: 2, end: 4, total: 8 });
    expect((await PDFDocument.load(slice.data)).getPageCount()).toBe(3);
    const whole = await cache.slice('u', sourceKey, 0, 7);
    expect(whole.full).toBeUndefined();
    const full = await cache.full('u', sourceKey);
    expect(full).toMatchObject({ full: true, pages: { start: 0, end: 7, total: 8 } });
    expect(await cache.text('u', sourceKey, 1, 2)).toMatch(/^\[PDF page 2\][\s\S]*\[PDF page 3\]/);
  });

  it('lets only the structure call attach the full document', () => {
    const full = [{ data: new Uint8Array(), mimeType: 'application/pdf', full: true }];
    const sliced = [{ data: new Uint8Array(), mimeType: 'application/pdf', pages: { start: 0, end: 1, total: 9 } }];
    expect(() => assertSliced('structure', full)).not.toThrow();
    for (const name of ['chapterText', 'lessonOutline', 'lessonScript', 'studyDoc', 'beats', 'scene', 'review', 'chat']) {
      expect(() => assertSliced(name, full)).toThrow(/may not attach the full document/);
      expect(() => assertSliced(name, sliced)).not.toThrow();
    }
  });

  it('calls sources.full() only from the structure stage', () => {
    for (const file of ['chapters.ts', 'lessonRender.ts', 'pipeline.ts']) {
      const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
      const calls = source.match(/sources\.full\(/g) ?? [];
      expect(calls.length, file).toBe(file === 'chapters.ts' ? 1 : 0);
      if (calls.length) {
        const at = source.indexOf('sources.full(');
        const structureStart = source.indexOf('const structure = ');
        const nextStage = source.indexOf('const writeChapter');
        expect(at).toBeGreaterThan(structureStart);
        expect(at).toBeLessThan(nextStage);
      }
    }
  });
});
