import { describe, expect, it } from 'vitest';
import { chatPrompt } from '../src/prompts.js';
import { chapterPath, chatContext, lessonIndexPath, lessonPath, segmentPath } from '../src/store.js';
import { memoryDocs } from './helpers.js';

const setup = async () => {
  const { docs } = memoryDocs();
  await docs.set(lessonIndexPath('c-c1-l1'), { ownerUid: 'u', courseId: 'c', chapterId: 'c1' });
  await docs.set(chapterPath('u', 'c', 'c-c1'), { title: 'Getting Started', chapterText: 'Chapter text about the 3n+1 problem.' });
  await docs.set(lessonPath('u', 'c', 'c-c1-l1'), {
    courseId: 'c',
    chapterId: 'c-c1',
    title: 'The 3n+1 problem',
    explanationSummary: 'Lesson script.',
    studyDoc: '## Study notes',
  });
  for (const [index, narration] of ['First segment narration.', 'Second segment narration.'].entries()) {
    await docs.set(segmentPath('u', 'c', 'c-c1-l1', `s0${index + 1}`), { index, narration, startFrame: index * 300, durationInFrames: 300, status: 'ready' });
  }
  return docs;
};

describe('chat context', () => {
  it('uses the segment on screen, the script, the study notes, and the chapter text', async () => {
    const context = await chatContext(await setup(), 'u', 'c-c1-l1', 450);
    expect(context).toEqual({
      courseId: 'c',
      segmentId: 's02',
      lessonTitle: 'The 3n+1 problem',
      chapterTitle: 'Getting Started',
      segmentNarration: 'Second segment narration.',
      explanationSummary: 'Lesson script.',
      studyDoc: '## Study notes',
      chapterText: 'Chapter text about the 3n+1 problem.',
    });
    const { courseId: _course, segmentId: _segment, ...material } = context!;
    const prompt = chatPrompt({ question: 'Why does it stop?', ...material });
    for (const text of ['Why does it stop?', 'Second segment narration.', 'Lesson script.', '## Study notes', 'Chapter text about the 3n+1 problem.']) {
      expect(prompt).toContain(text);
    }
    expect(prompt).not.toContain('First segment narration.');
  });

  it('has no segment past the end, and no context for an unknown lesson', async () => {
    const docs = await setup();
    expect(await chatContext(docs, 'u', 'c-c1-l1', 900)).toMatchObject({ segmentId: null, segmentNarration: '' });
    expect(await chatContext(docs, 'u', 'missing', 0)).toBeNull();
  });
});
