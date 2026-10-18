import type { DocStore } from '@krayon/shared';

export type UsageCaps = {
  uploadsPerVisitorDay: number;
  coursesGlobalDay: number;
  lessonRendersGlobalDay: number;
  regeneratesGlobalDay: number;
  askGlobalDay: number;
};

export const capsOff: UsageCaps = {
  uploadsPerVisitorDay: 0,
  coursesGlobalDay: 0,
  lessonRendersGlobalDay: 0,
  regeneratesGlobalDay: 0,
  askGlobalDay: 0,
};

export class DemoLimitError extends Error {
  readonly code = 'demo_limit' as const;
  readonly statusCode = 429;
  constructor() {
    super('Demo limit reached for today, try again tomorrow.');
  }
}

/** IST calendar day, YYYY-MM-DD. */
export const usageDay = (now = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/**
 * Increments one counter inside a transaction. A cap of 0 is off.
 * `visitorUid` is only used for the per-visitor upload cap.
 */
export const reserveUsage = async (
  docs: DocStore,
  kind: 'upload' | 'course' | 'render' | 'regenerate' | 'ask',
  caps: UsageCaps,
  visitorUid: string,
) => {
  const limit =
    kind === 'upload'
      ? caps.uploadsPerVisitorDay
      : kind === 'course'
        ? caps.coursesGlobalDay
        : kind === 'render'
          ? caps.lessonRendersGlobalDay
          : kind === 'regenerate'
            ? caps.regeneratesGlobalDay
            : caps.askGlobalDay;
  if (limit <= 0) return;
  const path = `usage/${usageDay()}`;
  await docs.transact(async (tx) => {
    const row = await tx.get(path);
    const data = row?.data ?? {};
    const uploads = (data.uploads as Record<string, number> | undefined) ?? {};
    const current =
      kind === 'upload'
        ? num(uploads[visitorUid])
        : num(data[kind === 'course' ? 'courses' : kind === 'render' ? 'renders' : kind === 'regenerate' ? 'regenerates' : 'asks']);
    if (current >= limit) throw new DemoLimitError();
    if (kind === 'upload') {
      tx.set(path, { uploads: { ...uploads, [visitorUid]: current + 1 } }, { merge: true });
      return;
    }
    const field = kind === 'course' ? 'courses' : kind === 'render' ? 'renders' : kind === 'regenerate' ? 'regenerates' : 'asks';
    tx.set(path, { [field]: current + 1 }, { merge: true });
  });
};
