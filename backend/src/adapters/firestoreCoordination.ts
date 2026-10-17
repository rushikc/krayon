import { getFirestore } from 'firebase-admin/firestore';
import type { Coordination, CancelScope } from '@krayon/shared';

const leaseId = (path: string) => path.replace(/[^A-Za-z0-9_-]/g, '_');

/** Cancel flags live on the docs. Viewing is the only client-writable state doc. */
export const createFirestoreCoordination = (): Coordination => {
  const db = getFirestore();
  return {
    async isCancelled(scope: CancelScope) {
      const snap = await db.doc(`users/${scope.uid}/courses/${scope.courseId}`).get();
      return snap.data()?.cancel === true;
    },
    async requestCancel(scope) {
      await db.doc(`users/${scope.uid}/courses/${scope.courseId}`).set({ cancel: true }, { merge: true });
    },
    async getViewedCourse(uid) {
      const snap = await db.doc(`users/${uid}/state/viewing`).get();
      const courseId = snap.data()?.courseId;
      return typeof courseId === 'string' ? courseId : null;
    },
    async setViewedCourse(uid, courseId) {
      await db.doc(`users/${uid}/state/viewing`).set({ courseId, updatedAt: Date.now() }, { merge: true });
    },
    async acquireLease(path, owner, ttlMs) {
      const ref = db.doc(`users/${owner}/leases/${leaseId(path)}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const until = Number(snap.data()?.until ?? 0);
        const holder = String(snap.data()?.owner ?? '');
        if (snap.exists && until > Date.now() && holder && holder !== owner) return false;
        tx.set(ref, { path, owner, until: Date.now() + ttlMs });
        return true;
      });
    },
    async releaseLease(path, owner) {
      const ref = db.doc(`users/${owner}/leases/${leaseId(path)}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.owner === owner) await ref.delete();
    },
  };
};
