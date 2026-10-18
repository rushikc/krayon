import { getFirestore, type Firestore, type Query } from 'firebase-admin/firestore';
import type { BatchOp, DocData, DocRecord, DocStore, Where } from '@krayon/shared';

const record = (path: string, id: string, data: DocData | undefined, updatedAt: number): DocRecord | null =>
  data ? { id, path, data, updatedAt } : null;

const applyWhere = (query: Query, where?: Where[]) => {
  let next = query;
  for (const [field, op, value] of where ?? []) next = next.where(field, op, value);
  return next;
};

/** Firestore documents at the same paths the local store uses. `jobs/{id}` stays top-level. */
let settingsApplied = false;

export const createFirestoreDocStore = (db: Firestore = getFirestore()): DocStore => {
  if (!settingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    settingsApplied = true;
  }
  return {
  async get(path) {
    const snap = await db.doc(path).get();
    if (!snap.exists) return null;
    return record(path, snap.id, snap.data(), snap.updateTime?.seconds ?? 0);
  },
  async set(path, data, opts) {
    await db.doc(path).set(data, { merge: opts?.merge === true });
  },
  async update(path, patch) {
    const snap = await db.doc(path).get();
    if (!snap.exists) throw new Error(`No document at ${path}`);
    await db.doc(path).update(patch);
  },
  async delete(path) {
    const snap = await db.doc(path).get();
    if (!snap.exists) return false;
    await db.doc(path).delete();
    return true;
  },
  async list(collection) {
    const snap = await db.collection(collection).get();
    return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data(), updatedAt: doc.updateTime?.seconds ?? 0 }));
  },
  async query(collection, where, opts) {
    let query = applyWhere(db.collection(collection), where);
    if (opts?.limit) query = query.limit(opts.limit);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data(), updatedAt: doc.updateTime?.seconds ?? 0 }));
  },
  async collectionGroup(name, where, opts) {
    let query = applyWhere(db.collectionGroup(name), where);
    if (opts?.limit) query = query.limit(opts.limit);
    const snap = await query.get();
    return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data(), updatedAt: doc.updateTime?.seconds ?? 0 }));
  },
  async transact(fn) {
    return db.runTransaction(async (tx) => {
      const writes: BatchOp[] = [];
      const result = await fn({
        get: async (path) => {
          const snap = await tx.get(db.doc(path));
          if (!snap.exists) return null;
          return record(path, snap.id, snap.data(), snap.updateTime?.seconds ?? 0);
        },
        query: async (collection, where, opts) => {
          let query = applyWhere(db.collection(collection), where);
          if (opts?.limit) query = query.limit(opts.limit);
          const snap = await tx.get(query);
          return snap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data(), updatedAt: doc.updateTime?.seconds ?? 0 }));
        },
        set: (path, data, opts) => writes.push({ op: 'set', path, data, merge: opts?.merge }),
        update: (path, data) => writes.push({ op: 'update', path, data }),
        delete: (path) => writes.push({ op: 'delete', path }),
      });
      for (const op of writes) {
        if (op.op === 'delete') tx.delete(db.doc(op.path));
        else if (op.op === 'update') tx.update(db.doc(op.path), op.data);
        else tx.set(db.doc(op.path), op.data, { merge: op.merge === true });
      }
      return result;
    });
  },
  async batch(ops) {
    const batch = db.batch();
    for (const op of ops) {
      if (op.op === 'delete') batch.delete(db.doc(op.path));
      else if (op.op === 'update') batch.update(db.doc(op.path), op.data);
      else batch.set(db.doc(op.path), op.data, { merge: op.merge === true });
    }
    await batch.commit();
  },
  async deleteTree(prefix) {
    const snap = await db.collection(prefix).get();
    let n = 0;
    for (const doc of snap.docs) {
      await db.recursiveDelete(doc.ref);
      n += 1;
    }
    return n;
  },
  };
};
