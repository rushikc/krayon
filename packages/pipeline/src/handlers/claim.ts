import type { DocData, DocStore } from '@krayon/shared';

const LEASE_MS = 15 * 60 * 1000;

/**
 * Claims a stage. A finished stage, or a lease another worker still holds, is a no-op.
 * The lease is about 15 minutes. Call renewLease between model calls.
 */
export const claimStage = async (
  docs: DocStore,
  path: string,
  owner: string,
  isDone: (data: DocData) => boolean,
  gen?: { field: string; value: number },
): Promise<'ok' | 'skip'> =>
  docs.transact(async (tx) => {
    const row = await tx.get(path);
    if (!row) return 'skip';
    const storedGen = gen ? Number(row.data[gen.field] ?? 0) : 0;
    const newer = gen != null && gen.value > storedGen;
    if (!newer && isDone(row.data)) return 'skip';
    const until = typeof row.data.leaseUntil === 'number' ? row.data.leaseUntil : 0;
    const holder = typeof row.data.leaseOwner === 'string' ? row.data.leaseOwner : '';
    if (holder && holder !== owner && until > Date.now()) return 'skip';
    tx.set(
      path,
      { leaseOwner: owner, leaseUntil: Date.now() + LEASE_MS, ...(gen ? { [gen.field]: gen.value } : {}) },
      { merge: true },
    );
    return 'ok';
  });

export const renewLease = async (docs: DocStore, path: string, owner?: string) => {
  await docs.set(path, { ...(owner ? { leaseOwner: owner } : {}), leaseUntil: Date.now() + LEASE_MS }, { merge: true });
};

export const clearLease = async (docs: DocStore, path: string) => {
  await docs.set(path, { leaseOwner: null, leaseUntil: 0 }, { merge: true });
};
