import { courseFrom, progressFrom, segmentFrom } from '@krayon/shared';
import type { CourseState, DocRecord, PipelineEvent, PipelineEventType } from '@krayon/shared';
import { onAuthStateChanged } from 'firebase/auth';
import { connectCourse as connectSocket } from './socket.ts';
import type { CourseSocket } from './socket.ts';
import { auth, currentUid, isGcpBackend } from './firebase.ts';

export type { CourseSocket };

type Handlers = {
  onSnapshot: (course: CourseState) => void;
  onEvent: (event: PipelineEvent) => void;
  onReconnect?: () => void;
};

const eventFor = (status: unknown): PipelineEventType | null => {
  if (status === 'ready') return 'segment.ready';
  if (status === 'failed') return 'segment.failed';
  if (status === 'voicing') return 'segment.voicing';
  if (status === 'rendering' || status === 'reviewing' || status === 'drafting') return 'segment.render';
  return null;
};

/**
 * Follows one course. Locally that is the WebSocket. On GCP it is Firestore,
 * rebuilt with the same assemblers the API uses. The viewed course is written
 * to users/{uid}/state/viewing.
 */
export const connectCourse = (courseId: string, handlers: Handlers): CourseSocket => {
  if (!isGcpBackend) return connectSocket(courseId, handlers);

  let closed = false;
  let started = false;
  const stops: Array<() => void> = [];
  let seq = 0;

  const emit = (type: PipelineEventType, extra: Partial<PipelineEvent>) => {
    seq += 1;
    handlers.onEvent({ type, courseId, seq, ts: new Date().toISOString(), ...extra });
  };

  const start = async () => {
    if (started || closed) return;
    started = true;
    const { collection, doc, getDoc, getFirestore, onSnapshot, setDoc } = await import('firebase/firestore');
    if (closed) return;
    const db = getFirestore();
    const viewer = currentUid();
    const index = await getDoc(doc(db, `courseIndex/${courseId}`));
    const owner = String(index.data()?.ownerUid ?? viewer);
    const coursePath = `users/${owner}/courses/${courseId}`;
    let courseDoc: DocRecord | null = null;
    let chapters: DocRecord[] = [];
    let lessons: DocRecord[] = [];
    const progress = new Map<string, DocRecord>();
    const segmentStops = new Map<string, () => void>();
    const seenStatus = new Map<string, string>();

    const publish = () => {
      if (!courseDoc) return;
      handlers.onSnapshot(
        courseFrom(owner, courseId, courseDoc, chapters, lessons, (lessonId) => progressFrom(progress.get(lessonId)?.data)),
      );
    };

    const asRecord = (id: string, path: string, data: Record<string, unknown>, updatedAt: number): DocRecord => ({
      id,
      path,
      data,
      updatedAt,
    });

    stops.push(
      onSnapshot(doc(db, coursePath), (row) => {
        courseDoc = row.exists() ? asRecord(row.id, row.ref.path, row.data(), Number(row.data().updatedAt ?? 0)) : null;
        publish();
      }),
    );
    stops.push(
      onSnapshot(collection(db, `${coursePath}/chapters`), (snap) => {
        chapters = snap.docs.map((row) => asRecord(row.id, row.ref.path, row.data(), Number(row.data().updatedAt ?? 0)));
        publish();
      }),
    );
    stops.push(
      onSnapshot(collection(db, `${coursePath}/lessons`), (snap) => {
        lessons = snap.docs.map((row) => asRecord(row.id, row.ref.path, row.data(), Number(row.data().updatedAt ?? 0)));
        const ids = new Set(lessons.map((row) => row.id));
        for (const [lessonId, stop] of segmentStops) {
          if (!ids.has(lessonId)) {
            stop();
            segmentStops.delete(lessonId);
          }
        }
        for (const lesson of lessons) {
          if (segmentStops.has(lesson.id)) continue;
          const stop = onSnapshot(collection(db, `${coursePath}/lessons/${lesson.id}/segments`), (segmentSnap) => {
            for (const row of segmentSnap.docs) {
              const status = String(row.data().status ?? '');
              const key = `${lesson.id}/${row.id}`;
              if (seenStatus.get(key) === status) continue;
              seenStatus.set(key, status);
              const type = eventFor(status);
              if (!type) continue;
              emit(type, {
                lessonId: lesson.id,
                segmentId: row.id,
                segment: segmentFrom(lesson.id, asRecord(row.id, row.ref.path, row.data(), 0), []),
              });
            }
          });
          segmentStops.set(lesson.id, stop);
        }
        publish();
      }),
    );
    stops.push(
      onSnapshot(collection(db, `users/${viewer}/progress`), (snap) => {
        progress.clear();
        for (const row of snap.docs) progress.set(row.id, asRecord(row.id, row.ref.path, row.data(), Number(row.data().updatedAt ?? 0)));
        publish();
      }),
    );
    stops.push(() => {
      for (const stop of segmentStops.values()) stop();
    });

    if (viewer) void setDoc(doc(db, `users/${viewer}/state/viewing`), { courseId, updatedAt: Date.now() }, { merge: true });
  };

  const unsubAuth = onAuthStateChanged(auth, (user) => {
    if (!user || closed) return;
    void start();
  });
  stops.push(unsubAuth);

  return {
    close: () => {
      closed = true;
      for (const stop of stops) stop();
    },
  };
};
