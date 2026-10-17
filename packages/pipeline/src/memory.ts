import type { BatchOp, BlobStat, BlobStorage, DocData, DocRecord, DocStore, DocTx, Where } from '@krayon/shared';

const idOf = (docPath: string) => docPath.slice(docPath.lastIndexOf('/') + 1);

const record = (docPath: string, data: DocData, updatedAt = Date.now() / 1000): DocRecord => ({
  id: idOf(docPath),
  path: docPath,
  data,
  updatedAt,
});

const collectionOf = (docPath: string) => docPath.slice(0, docPath.lastIndexOf('/'));

const compare = (left: unknown, op: Where[1], right: unknown) => {
  if (op === 'in') return Array.isArray(right) && right.includes(left);
  if (op === '==') return left === right;
  if (op === '!=') return left !== right;
  const a = typeof left === 'number' ? left : Number(left);
  const b = typeof right === 'number' ? right : Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === '<') return a < b;
  if (op === '<=') return a <= b;
  if (op === '>') return a > b;
  return a >= b;
};

const matches = (data: DocData, where: Where[] | undefined) => (where ?? []).every(([field, op, value]) => compare(data[field], op, value));

/** In-memory DocStore. list() returns direct children only. Writes land before the returned promise resolves. */
export const memoryDocs = () => {
  const rows = new Map<string, { data: DocData; updatedAt: number }>();
  let tail: Promise<void> = Promise.resolve();

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const read = (docPath: string): DocRecord | null => {
    const row = rows.get(docPath);
    return row ? record(docPath, row.data, row.updatedAt) : null;
  };

  const children = (collection: string) =>
    [...rows.entries()]
      .filter(([docPath]) => collectionOf(docPath) === collection)
      .map(([docPath, row]) => record(docPath, row.data, row.updatedAt));

  const filter = (collection: string | null, where: Where[] | undefined, opts?: { limit?: number }) => {
    const found = [...rows.entries()]
      .filter(([docPath, row]) => (collection === null || collectionOf(docPath) === collection) && matches(row.data, where))
      .map(([docPath, row]) => record(docPath, row.data, row.updatedAt));
    return opts?.limit ? found.slice(0, opts.limit) : found;
  };

  const group = (name: string, where: Where[] | undefined, opts?: { limit?: number }) => {
    const found = [...rows.entries()]
      .filter(([docPath, row]) => collectionOf(docPath).split('/').at(-1) === name && matches(row.data, where))
      .map(([docPath, row]) => record(docPath, row.data, row.updatedAt));
    return opts?.limit ? found.slice(0, opts.limit) : found;
  };

  const applySet = (docPath: string, data: DocData, merge = false) => {
    const next = merge ? { ...rows.get(docPath)?.data, ...data } : { ...data };
    rows.set(docPath, { data: next, updatedAt: Date.now() / 1000 });
  };

  const apply = (ops: BatchOp[]) => {
    for (const op of ops) {
      if (op.op === 'delete') rows.delete(op.path);
      else if (op.op === 'update') {
        const current = rows.get(op.path);
        if (!current) throw new Error(`No document at ${op.path}`);
        rows.set(op.path, { data: { ...current.data, ...op.data }, updatedAt: Date.now() / 1000 });
      } else applySet(op.path, op.data, op.merge);
    }
  };

  const docs: DocStore = {
    get: (docPath) => enqueue(async () => read(docPath)),
    set: (docPath, data, opts) => enqueue(async () => applySet(docPath, data, opts?.merge)),
    update: (docPath, patch) => enqueue(async () => apply([{ op: 'update', path: docPath, data: patch }])),
    delete: (docPath) => enqueue(async () => rows.delete(docPath)),
    list: (collection) => enqueue(async () => children(collection.replace(/^\/+|\/+$/g, ''))),
    query: (collection, where, opts) => enqueue(async () => filter(collection.replace(/^\/+|\/+$/g, ''), where, opts)),
    collectionGroup: (name, where, opts) => enqueue(async () => group(name, where, opts)),
    transact: (fn) =>
      enqueue(async () => {
        const writes: BatchOp[] = [];
        const overlay = (docPath: string): DocRecord | null => {
          const pending = [...writes].reverse().find((op) => op.path === docPath);
          if (!pending) return read(docPath);
          if (pending.op === 'delete') return null;
          const current = read(docPath);
          if (pending.op === 'set' && !pending.merge) return record(docPath, pending.data);
          const base = current?.data ?? {};
          if (pending.op === 'update' && !current) return null;
          return record(docPath, { ...base, ...pending.data });
        };
        const tx: DocTx = {
          get: async (docPath) => overlay(docPath),
          query: async (collection, where, opts) => filter(collection, where, opts),
          set: (docPath, data, opts) => writes.push({ op: 'set', path: docPath, data, merge: opts?.merge }),
          update: (docPath, patch) => writes.push({ op: 'update', path: docPath, data: patch }),
          delete: (docPath) => writes.push({ op: 'delete', path: docPath }),
        };
        const result = await fn(tx);
        apply(writes);
        return result;
      }),
    batch: (ops) => enqueue(async () => apply(ops)),
    deleteTree: (prefix) =>
      enqueue(async () => {
        const match = [...rows.keys()].filter((docPath) => docPath === prefix || docPath.startsWith(`${prefix}/`));
        for (const docPath of match) rows.delete(docPath);
        return match.length;
      }),
  };

  return { rows, docs };
};

export const memoryBlobs = (): BlobStorage & { files: Map<string, { data: Uint8Array; stat: BlobStat }> } => {
  const files = new Map<string, { data: Uint8Array; stat: BlobStat }>();
  const storage: BlobStorage = {
    put: async (key, data, opts) => {
      const stat: BlobStat = { key, size: data.byteLength, contentType: opts.contentType, updatedAt: Date.now() };
      files.set(key, { data, stat });
      return stat;
    },
    get: async (key) => files.get(key) ?? null,
    stat: async (key) => files.get(key)?.stat ?? null,
    stream: async (key, range) => {
      const found = files.get(key);
      if (!found) return null;
      const start = range?.start ?? 0;
      const end = range?.end ?? found.data.byteLength - 1;
      const slice = found.data.subarray(start, end + 1);
      return (async function* stream() {
        yield slice;
      })();
    },
    delete: async (key) => files.delete(key),
  };
  return Object.assign(storage, { files });
};
