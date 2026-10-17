import type { Notifier } from '@krayon/shared';
import { logger } from './cloudLogging.js';

/** GCP has no WebSocket. Events are logs; the browser listens to Firestore. */
export const notifier: Notifier = {
  async emit(event) {
    logger.info(event.type, { courseId: event.courseId, lessonId: event.lessonId, segmentId: event.segmentId });
  },
};
