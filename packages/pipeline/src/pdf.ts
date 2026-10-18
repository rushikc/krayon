import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import type { BlobStorage, DocStore } from '@krayon/shared';
import { pageTextKey, resolveKey, sliceKey } from './keys.js';

/** A file attached to a model call. `pages` says which PDF pages it holds; `full` marks the whole document. */
export type SourceFile = {
  data: Uint8Array;
  mimeType: string;
  full?: boolean;
  pages?: { start: number; end: number; total: number };
};

export type SourceInfo = {
  pageCount: number;
  /** Text per 0-based page ('' when a page has no text layer). */
  pageTexts: string[];
  /** PDF /PageLabels per page, or null. */
  labels: string[] | null;
};

export const isPdf = (mimeType: string) => mimeType === 'application/pdf';

export const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();

export const pageTexts = async (bytes: Uint8Array) => {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((page) => page ?? '');
  } finally {
    await pdf.loadingTask.destroy();
  }
};

export const pageLabels = async (bytes: Uint8Array) => {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    return (await pdf.getPageLabels()) ?? null;
  } finally {
    await pdf.loadingTask.destroy();
  }
};

/** A new PDF with pages start..end (0-based, inclusive) of `doc`. */
export const slicePdf = async (doc: PDFDocument, start: number, end: number) => {
  const out = await PDFDocument.create();
  const indexes = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
  const pages = await out.copyPages(doc, indexes);
  for (const page of pages) out.addPage(page);
  return out.save();
};

const SLICE_CACHE_MAX = 200;

/**
 * Per-source PDF access for the pipeline: the full file (structure pass only), page slices, and page text.
 * Page text is kept as a blob so a restart does not re-extract it; slices live in memory.
 */
export const createSourceCache = (blobs: BlobStorage, store: DocStore) => {
  void store;
  const docs = new Map<string, Promise<PDFDocument>>();
  const infos = new Map<string, Promise<SourceInfo>>();
  const slices = new Map<string, Promise<Uint8Array>>();
  const read = async (uid: string, sourceId: string) => {
    const key = resolveKey(sourceId);
    if (!key || !key.startsWith(`users/${uid}/sources/`)) throw new Error(`Missing source ${sourceId}`);
    const blob = await blobs.get(key);
    if (!blob) throw new Error(`Missing source ${sourceId}`);
    return { data: blob.data, contentType: blob.stat.contentType };
  };

  const loadDoc = (uid: string, sourceId: string) => {
    const key = `${uid}/${sourceId}`;
    let doc = docs.get(key);
    if (!doc) {
      doc = read(uid, sourceId).then((blob) => PDFDocument.load(blob.data, { ignoreEncryption: true }));
      docs.set(key, doc);
      doc.catch(() => docs.delete(key));
    }
    return doc;
  };

  const info = (uid: string, sourceId: string): Promise<SourceInfo> => {
    const key = `${uid}/${sourceId}`;
    let found = infos.get(key);
    if (!found) {
      found = (async () => {
        const blob = await read(uid, sourceId);
        if (!isPdf(blob.contentType)) return { pageCount: 1, pageTexts: [''], labels: null };
        const textKey = pageTextKey(uid, sourceId);
        const cached = await blobs.get(textKey);
        if (cached) return JSON.parse(Buffer.from(cached.data).toString('utf8')) as SourceInfo;
        const [texts, labels] = await Promise.all([pageTexts(blob.data), pageLabels(blob.data)]);
        const value: SourceInfo = { pageCount: texts.length, pageTexts: texts, labels };
        await blobs.put(textKey, Buffer.from(JSON.stringify(value)), { contentType: 'application/json' });
        return value;
      })();
      infos.set(key, found);
      found.catch(() => infos.delete(key));
    }
    return found;
  };

  /** The whole source. Only the structure pass may send this to the model. */
  const full = async (uid: string, sourceId: string): Promise<SourceFile> => {
    const blob = await read(uid, sourceId);
    const total = isPdf(blob.contentType) ? (await info(uid, sourceId)).pageCount : 1;
    return { data: blob.data, mimeType: blob.contentType, full: true, pages: { start: 0, end: total - 1, total } };
  };

  /** Pages start..end (0-based, inclusive) as their own PDF. A photo is returned whole. */
  const slice = async (uid: string, sourceId: string, start: number, end: number): Promise<SourceFile> => {
    const blob = await read(uid, sourceId);
    if (!isPdf(blob.contentType)) return { data: blob.data, mimeType: blob.contentType, pages: { start: 0, end: 0, total: 1 } };
    const { pageCount: total } = await info(uid, sourceId);
    const from = Math.max(0, Math.min(start, total - 1));
    const to = Math.max(from, Math.min(end, total - 1));
    const key = sliceKey(uid, sourceId, from, to);
    const stored = await blobs.get(key);
    if (stored) return { data: stored.data, mimeType: 'application/pdf', pages: { start: from, end: to, total } };
    let data = slices.get(key);
    if (!data) {
      data = loadDoc(uid, sourceId).then(async (doc) => {
        const bytes = await slicePdf(doc, from, to);
        await blobs.put(key, bytes, { contentType: 'application/pdf' });
        return bytes;
      });
      slices.set(key, data);
      data.catch(() => slices.delete(key));
      if (slices.size > SLICE_CACHE_MAX) slices.delete(slices.keys().next().value as string);
    }
    return { data: await data, mimeType: 'application/pdf', pages: { start: from, end: to, total } };
  };

  /** Text of pages start..end, each prefixed with its 1-based PDF page number. */
  const text = async (uid: string, sourceId: string, start: number, end: number) => {
    const { pageTexts: texts } = await info(uid, sourceId);
    const parts: string[] = [];
    for (let page = Math.max(0, start); page <= Math.min(end, texts.length - 1); page += 1) {
      parts.push(`[PDF page ${page + 1}]\n${(texts[page] ?? '').trim()}`);
    }
    return parts.join('\n\n');
  };

  const clear = () => {
    docs.clear();
    infos.clear();
    slices.clear();
  };

  return { info, full, slice, text, clear };
};

export type SourceCache = ReturnType<typeof createSourceCache>;
