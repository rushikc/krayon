import { mediaId, mediaKey } from '@krayon/shared';

const extOf = (name: string, contentType: string) => {
  const fromName = /\.([A-Za-z0-9]+)$/.exec(name)?.[1]?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (contentType === 'application/pdf') return 'pdf';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg') return 'jpg';
  return 'bin';
};

/** One segment, so a source id can sit inside another key. */
export const sourceSegment = (key: string) => mediaId(key);

export const sourceKey = (uid: string, courseId: string, index: number, name: string, contentType: string) =>
  `users/${uid}/sources/${courseId}/${index}.${extOf(name, contentType)}`;

export const looseUploadKey = (uid: string, id: string, name: string, contentType: string) =>
  `users/${uid}/uploads/${id}.${extOf(name, contentType)}`;

export const sliceKey = (uid: string, sourceId: string, start: number, end: number) =>
  `users/${uid}/slices/${sourceSegment(sourceId)}/${start}-${end}.pdf`;

export const pageTextKey = (uid: string, sourceId: string) => `users/${uid}/pagetext/${sourceSegment(sourceId)}.json`;

export const keyframeKey = (uid: string, lessonId: string, segmentId: string, attempt: number, round: number, frame: number) =>
  `users/${uid}/keyframes/${lessonId}/${segmentId}/a${attempt}-r${round}-${frame}.png`;

export const audioKey = (uid: string, hash: string) => `users/${uid}/audio/${hash}.wav`;

export const textKey = (uid: string, kind: 'chapterText' | 'studyDoc' | 'script', id: string) =>
  `users/${uid}/text/${id}/${kind}.md`;

/** A stored source id may be the key itself or its media id. */
export const resolveKey = (idOrKey: string): string | null => (idOrKey.includes('/') ? idOrKey : mediaKey(idOrKey));
