import type { CancelScope, Coordination } from '@krayon/shared';
import type { LocalEventBus } from './bus.js';

type Lease = { owner: string; until: number };

/** In-memory leases, cancel flags, and the viewed course. One process. */
export class LocalCoordination implements Coordination {
  private readonly leases = new Map<string, Lease>();
  private epoch = 0;

  constructor(private readonly events: LocalEventBus) {}

  bumpEpoch() {
    this.epoch += 1;
  }

  async isCancelled(scope: CancelScope) {
    if (scope.epoch != null && scope.epoch < this.epoch) return true;
    return this.events.isCancelled(scope.courseId, scope.lessonId, scope.segmentId);
  }

  async requestCancel(scope: CancelScope) {
    this.events.requestCancel(scope.courseId, scope.lessonId, scope.segmentId);
  }

  async getViewedCourse(_uid: string) {
    return this.events.viewedCourse();
  }

  async setViewedCourse(_uid: string, courseId: string | null) {
    this.events.setViewedCourse(courseId);
  }

  private live(path: string, now: number) {
    const row = this.leases.get(path);
    if (!row || row.until <= now) {
      if (row) this.leases.delete(path);
      return false;
    }
    return true;
  }

  async acquireLease(path: string, owner: string, ttlMs: number) {
    const now = Date.now();
    if (path.startsWith('regen/')) {
      const lesson = path.split('/')[1] ?? '';
      const segment = path.split('/')[2] ?? '';
      if (this.live(`regen/${lesson}/*`, now)) return false;
      if (segment === '*') {
        for (const key of this.leases.keys()) {
          if (key.startsWith(`regen/${lesson}/`) && this.live(key, now)) return false;
        }
      }
    }
    if (this.live(path, now)) return false;
    this.leases.set(path, { owner, until: now + ttlMs });
    return true;
  }

  async releaseLease(path: string, owner: string) {
    const held = this.leases.get(path);
    if (!held || held.owner === owner) this.leases.delete(path);
  }
}
