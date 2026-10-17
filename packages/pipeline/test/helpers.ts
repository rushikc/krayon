import type { DocRecord, DocStore } from '@krayon/shared';

/** In-memory DocStore with the same path rules as the SQLite one: list() returns direct children only. */
export const memoryDocs = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const record = (docPath: string, data: Record<string, unknown>): DocRecord => ({
    id: docPath.slice(docPath.lastIndexOf('/') + 1),
    data,
    updatedAt: 0,
  });
  const docs: DocStore = {
    get: (docPath) => {
      const data = rows.get(docPath);
      return data ? record(docPath, data) : null;
    },
    set: (docPath, data, merge) => {
      const next = merge ? { ...rows.get(docPath), ...data } : { ...data };
      rows.set(docPath, next);
      return record(docPath, next);
    },
    delete: (docPath) => rows.delete(docPath),
    list: (collection) =>
      [...rows.entries()]
        .filter(([docPath]) => docPath.startsWith(`${collection}/`) && !docPath.slice(collection.length + 1).includes('/'))
        .map(([docPath, data]) => record(docPath, data)),
    clear: () => {
      const documents = rows.size;
      rows.clear();
      return { documents };
    },
  };
  return { rows, docs };
};

export const quietLog = { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined };

/** Sentences of `words` words each, numbered so every one is distinct. */
export const sentences = (count: number, words: number) =>
  Array.from({ length: count }, (_, index) => `Sentence ${index + 1} ${Array.from({ length: Math.max(0, words - 3) }, () => 'word').join(' ')} end.`);

export const script = (count: number, words: number) => sentences(count, words).join(' ');
