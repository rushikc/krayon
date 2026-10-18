import { describe, expect, it } from 'vitest';
import { chapterPath, courseIndexPath, coursePath, deleteCourse, lessonPath, noteChapter, noteCourse, noteLesson, progressPath } from '../src/store.js';
import { memoryBlobs, memoryDocs } from './helpers.js';

describe('deleteCourse', () => {
  it('removes the course tree, indexes, progress, and source files', async () => {
    const { docs } = memoryDocs();
    const blobs = memoryBlobs();
    await noteCourse(docs, 'u', 'c1', {
      status: 'ready',
      stage: 'done',
      title: 'Number Theory',
      sources: [{ id: 'src', name: 'notes.pdf', content_type: 'application/pdf', size: 10, path: 'users/u/sources/c1/0.pdf' }],
    });
    await docs.set(chapterPath('u', 'c1', 'c1-c1'), { index: 0, title: 'Ch', skip: false, status: 'ready' });
    await noteChapter(docs, 'u', 'c1', 'c1-c1');
    await docs.set(lessonPath('u', 'c1', 'c1-c1-l1'), { index: 0, chapterId: 'c1-c1', title: 'L1', status: 'ready' });
    await noteLesson(docs, 'u', 'c1', 'c1-c1', 'c1-c1-l1');
    await docs.set(progressPath('u', 'c1-c1-l1'), { watched: true, completed: false, positionFrame: 12, updatedAt: 1 });
    await blobs.put('users/u/sources/c1/0.pdf', new Uint8Array([1]), { contentType: 'application/pdf' });
    await blobs.put('users/u/keyframes/c1-c1-l1/s01/a1-r1-0.png', new Uint8Array([2]), { contentType: 'image/png' });

    expect(await deleteCourse(docs, blobs, 'u', 'c1')).toBe(true);
    expect(await docs.get(coursePath('u', 'c1'))).toBeNull();
    expect(await docs.get(courseIndexPath('c1'))).toBeNull();
    expect(await docs.get('chapterIndex/c1-c1')).toBeNull();
    expect(await docs.get('lessonIndex/c1-c1-l1')).toBeNull();
    expect(await docs.get(progressPath('u', 'c1-c1-l1'))).toBeNull();
    expect(await blobs.stat('users/u/sources/c1/0.pdf')).toBeNull();
    expect(await blobs.stat('users/u/keyframes/c1-c1-l1/s01/a1-r1-0.png')).toBeNull();
  });
});
