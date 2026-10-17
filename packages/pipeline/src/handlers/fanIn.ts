import type { DocStore } from '@krayon/shared';

/** Recounts terminal segments inside a transaction so a redelivered task cannot double-count. */
export const recountSegments = async (docs: DocStore, lessonDoc: string, segmentCollection: string) =>
  docs.transact(async (tx) => {
    const rows = await tx.query(segmentCollection);
    const segmentsReady = rows.filter((row) => row.data.status === 'ready').length;
    const segmentsSettled = rows.filter((row) => row.data.status === 'ready' || row.data.status === 'failed').length;
    const segmentsVoiced = rows.filter((row) => row.data.audio || row.data.voice === 'failed' || row.data.status === 'ready' || row.data.status === 'failed').length;
    tx.set(lessonDoc, { segmentsReady, segmentCount: rows.length, segmentsSettled, segmentsVoiced }, { merge: true });
    return { total: rows.length, ready: segmentsReady, settled: segmentsSettled, voiced: segmentsVoiced };
  });
