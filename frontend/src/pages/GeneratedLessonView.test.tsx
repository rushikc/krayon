import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import type { LessonDetail } from '@krayon/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { GeneratedLessonView } from './GeneratedLessonView.tsx';
import { StudySessionContext, type StudySessionValue } from '../study/studyState.ts';
import { LocalStudyProvider } from '../study/localStudy.tsx';
import { UploadProvider } from '../study/uploadState.tsx';

const gate = vi.hoisted(() => {
  let resolveReady: (value: LessonDetail) => void = () => undefined;
  const lesson = new Promise<LessonDetail>((resolve) => {
    resolveReady = resolve;
  });
  return { lesson, finish: (value: LessonDetail) => resolveReady(value) };
});

vi.mock('../lib/api.ts', () => ({
  ApiError: class ApiError extends Error {},
  getLesson: () => gate.lesson,
  askLesson: vi.fn(),
  mediaUrl: (path: string) => path,
  regenerateSegment: vi.fn(),
  rerenderLesson: vi.fn(),
  renderUrl: (id: string) => id,
  saveLessonProgress: vi.fn(async () => ({ watched: false, completed: false, positionFrame: 0, updatedAt: 0 })),
  apiFetch: vi.fn(async () => ({ data: {} })),
  apiJson: vi.fn(async () => ({})),
}));

const session: StudySessionValue = {
  course: null,
  courseId: null,
  starting: false,
  error: null,
  startFromFiles: async () => undefined,
  openCourse: async () => undefined,
  renderLesson: async () => undefined,
  retryCourse: async () => undefined,
  retryChapter: async () => undefined,
  retryLesson: async () => undefined,
  noteProgress: () => undefined,
  listen: () => () => undefined,
};

const ready: LessonDetail = {
  id: 'c-c1-l1',
  courseId: 'c',
  chapterId: 'c-c1',
  index: 0,
  title: 'Sorting',
  sourcePages: [1],
  status: 'ready',
  statusDetail: null,
  durationFrames: 0,
  segmentCount: 0,
  segmentsReady: 0,
  wordCount: 10,
  shortSource: false,
  error: null,
  errorInfo: null,
  progress: null,
  chapterTitle: 'Arrays',
  explanationSummary: 'A list stays ordered.',
  studyDoc: '',
  segments: [],
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

it('renders the loading state and then a ready lesson without a hook-order crash', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <BrowserRouter>
        <UploadProvider>
          <LocalStudyProvider>
            <StudySessionContext.Provider value={session}>
              <GeneratedLessonView lessonId="c-c1-l1" />
            </StudySessionContext.Provider>
          </LocalStudyProvider>
        </UploadProvider>
      </BrowserRouter>,
    );
  });
  expect(container.textContent).toContain('Opening the lesson…');

  await act(async () => {
    gate.finish(ready);
    await gate.lesson;
  });
  expect(container.textContent).toContain('Sorting');
});
