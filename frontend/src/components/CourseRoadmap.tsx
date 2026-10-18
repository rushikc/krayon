import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChapterState, CourseState, LessonSummary } from '@krayon/shared';
import { courseLessons } from '@krayon/shared';
import { chapterFailure } from '../study/failures.ts';
import { lessonLength, nextLesson, progressLabel, renderPercent } from '../study/lessons.ts';
import { useStudySession } from '../study/studyState.ts';
import { useUpload } from '../study/uploadState.tsx';
import { CrayonSketch } from './CrayonSketch.tsx';
import { FailureNotes } from './FailureNotes.tsx';
import { Button, buttonClass } from './ui/Button.tsx';
import { CrayonProgress } from './ui/CrayonProgress.tsx';
import { HandUnderline } from './ui/HandUnderline.tsx';
import { IconBack, IconCheck, IconFile, IconPlay } from './ui/icons.tsx';
import { Shell } from './ui/Shell.tsx';
import { cx } from './ui/cx.ts';

const pill = 'inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[13px] font-medium';
const small = '!px-3 !py-1 !text-[13px] shrink-0';

const pageSpan = (chapter: ChapterState) =>
  chapter.pdfPageEnd > chapter.pdfPageStart
    ? `PDF pages ${chapter.pdfPageStart + 1}–${chapter.pdfPageEnd + 1}`
    : `PDF page ${chapter.pdfPageStart + 1}`;

const lessonPages = (lesson: LessonSummary) => {
  const pages = lesson.sourcePages;
  if (pages.length === 0) return '';
  const first = pages[0] ?? 0;
  const last = pages[pages.length - 1] ?? first;
  return first === last ? `PDF page ${first}` : `PDF pages ${first}–${last}`;
};

function LessonAction({ lesson }: { lesson: LessonSummary }) {
  const session = useStudySession();
  if (lesson.status === 'writing') {
    if (!lesson.statusDetail) return null;
    return (
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[13px] text-muted">{lesson.statusDetail}</span>
        {lesson.statusDetail.startsWith('Writing') && (
          <span
            className="block h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-crayon motion-reduce:animate-none"
            role="status"
            aria-label={lesson.statusDetail}
          />
        )}
      </div>
    );
  }
  if (lesson.status === 'ready') {
    const label = progressLabel(lesson);
    return (
      <Link to={`/study/${lesson.id}`} className={buttonClass('primary', small)}>
        <IconPlay className="h-3.5 w-3.5" />
        {label?.startsWith('Resume') ? 'Resume' : label ? 'Watch again' : 'Play'}
      </Link>
    );
  }
  if (lesson.status === 'queued' || lesson.status === 'rendering') {
    const counted = lesson.status === 'rendering' && lesson.segmentCount > 0;
    return (
      <div className="flex items-center gap-3">
        <div className="w-[180px] shrink-0">
          <p className="mb-1 text-right text-[13px] font-medium text-ink tabular-nums">
            {counted ? `Rendering ${lesson.segmentsReady}/${lesson.segmentCount}` : lesson.status === 'queued' ? 'Queued' : 'Planning the video'}
          </p>
          <CrayonProgress value={counted ? renderPercent(lesson) : 4} label={`${lesson.title} video progress`} />
        </div>
        <Link to={`/study/${lesson.id}`} className={buttonClass('secondary', small)}>
          View steps
        </Link>
      </div>
    );
  }
  if (lesson.status === 'failed') {
    return (
      <Button variant="secondary" className={small} onClick={() => void session.retryLesson(lesson.id)}>
        Retry
      </Button>
    );
  }
  return (
    <Button variant="secondary" className={small} onClick={() => void session.renderLesson(lesson.id)}>
      Generate video
    </Button>
  );
}

function LessonRow({ lesson, number, next }: { lesson: LessonSummary; number: number; next: boolean }) {
  const label = progressLabel(lesson);
  const length = lessonLength(lesson);
  const done = lesson.progress?.completed || lesson.progress?.watched;
  const writing = lesson.status === 'writing';
  const pages = lessonPages(lesson);
  const state =
    lesson.status === 'ready'
      ? (label ?? 'Ready')
      : lesson.status === 'failed'
        ? 'Failed'
        : lesson.status === 'outlined'
          ? 'Not generated'
          : null;
  return (
    <li
      className={cx(
        'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border-2 px-3 py-2.5',
        writing || !next ? 'border-ink/15 bg-paper' : 'border-ink bg-yellow/40 shadow-[3px_3px_0_var(--color-ink)]',
      )}
    >
      <span
        className={cx(
          'flex h-8 w-8 items-center justify-center rounded-full border-2 text-[13px] font-medium tabular-nums',
          done ? 'border-ink bg-done-fill text-ink' : writing ? 'border-ink/25 bg-paper text-muted' : 'border-ink bg-paper text-ink',
        )}
        aria-hidden="true"
      >
        {done ? <IconCheck className="h-3.5 w-3.5" /> : number}
      </span>
      <div className="min-w-0">
        {writing ? (
          <span className="block truncate text-[15px] font-medium text-muted">{lesson.title}</span>
        ) : (
          <Link to={`/study/${lesson.id}`} className="block truncate text-[15px] font-medium text-ink hover:underline">
            {lesson.title}
          </Link>
        )}
        {writing ? (
          pages ? (
            <p className="mt-0.5 text-[13px] text-muted">{pages}</p>
          ) : null
        ) : (
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted">
            {next && <span className="shrink-0 font-medium text-ink">Up next</span>}
            {state && (
              <span className={cx('shrink-0', lesson.status === 'failed' && 'text-crayon-text')}>{state}</span>
            )}
            {length && <span className="shrink-0 tabular-nums">{length}</span>}
            {lesson.status === 'failed' && lesson.error && (
              <span className="min-w-0 truncate text-crayon-text" title={lesson.error}>
                {lesson.error}
              </span>
            )}
            {lesson.shortSource && <span className="shrink-0">Short source</span>}
          </p>
        )}
      </div>
      <LessonAction lesson={lesson} />
    </li>
  );
}

function ChapterSection({
  chapter,
  number,
  open,
  onToggle,
  firstLesson,
  nextId,
}: {
  chapter: ChapterState;
  number: number;
  open: boolean;
  onToggle: () => void;
  firstLesson: number;
  nextId: string | null;
}) {
  const session = useStudySession();
  const failure = chapterFailure(chapter, () => void session.retryChapter(chapter.id));
  const count = chapter.lessons.length;
  const ready = chapter.lessons.filter((lesson) => lesson.status === 'ready').length;
  const rendering = chapter.lessons.some((lesson) => lesson.status === 'queued' || lesson.status === 'rendering');
  const status =
    chapter.status === 'ready'
      ? `${count} ${count === 1 ? 'lesson' : 'lessons'}${ready > 0 ? ` · ${ready} ready` : ''}`
      : chapter.status === 'failed'
        ? 'Failed'
        : chapter.status === 'writing'
          ? (chapter.statusDetail ?? 'Writing lessons…')
          : 'Waiting to be written';
  return (
    <section className="rounded-[20px] border-[2.5px] border-ink bg-paper shadow-[4px_4px_0_var(--color-ink)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span className="w-20 shrink-0 text-[13px] font-medium tracking-wide text-muted uppercase">Chapter {number}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-serif text-[20px] leading-tight text-ink">{chapter.title}</span>
          <span className="mt-0.5 block text-[13px] text-muted">
            {status} · {pageSpan(chapter)}
          </span>
        </span>
        {rendering && (
          <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-muted">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-crayon" aria-hidden="true" />
            Rendering…
          </span>
        )}
        <span className={cx('shrink-0 text-[18px] text-ink transition-transform', open && 'rotate-90')} aria-hidden="true">
          ›
        </span>
      </button>
      {open && (
        <div className="border-t-2 border-ink/10 px-5 pt-3 pb-5">
          {failure && <FailureNotes items={[failure]} className="mb-3" />}
          {count > 0 ? (
            <ol className="space-y-2">
              {chapter.lessons.map((lesson, index) => (
                <LessonRow key={lesson.id} lesson={lesson} number={firstLesson + index} next={lesson.id === nextId} />
              ))}
            </ol>
          ) : (
            !failure && (
              <div>
                <p className="text-[14px] text-muted">Lessons appear here once this chapter is split.</p>
                {chapter.status === 'writing' && (
                  <div role="progressbar" aria-label="Chapter progress" className="mt-3 h-3 overflow-hidden rounded-full bg-line">
                    <div className="crayon-indeterminate h-full w-1/3 rounded-full bg-crayon" />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}

function NextCard({ course }: { course: CourseState }) {
  const lessons = courseLessons(course);
  const next = nextLesson(course);
  const watched = lessons.filter((lesson) => lesson.progress?.completed || lesson.progress?.watched).length;
  const chapter = next ? course.chapters.find((item) => item.id === next.chapterId) : undefined;
  return (
    <div className="rounded-[20px] border-[2.5px] border-ink bg-paper p-5 shadow-[4px_4px_0_var(--color-ink)]">
      <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Up next</p>
      {next ? (
        <>
          <p className="mt-2 font-serif text-[20px] leading-tight text-ink">{next.title}</p>
          {next.status === 'writing' && next.statusDetail && <p className="mt-1 text-[13px] text-muted">{next.statusDetail}</p>}
          {chapter && <p className="mt-1 text-[13px] text-muted">{chapter.title}</p>}
          {next.status === 'ready' ? (
            <div className="mt-4">
              <Link to={`/study/${next.id}`} className={buttonClass('primary', 'w-full')}>
                <IconPlay className="h-4 w-4" />
                {progressLabel(next) ?? 'Play lesson'}
              </Link>
            </div>
          ) : next.status === 'outlined' ? (
            <div className="mt-4">
              <Link to={`/study/${next.id}`} className={buttonClass('secondary', 'w-full')}>
                Open lesson
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[15px] text-ink">{lessons.length > 0 ? 'Every lesson is watched.' : 'Lessons are on the way.'}</p>
      )}
      {lessons.length > 0 && (
        <div className="mt-5">
          <CrayonProgress value={(watched / lessons.length) * 100} label="Lessons watched" tone="done" />
          <p className="mt-1.5 text-[13px] text-muted">
            {watched} of {lessons.length} lessons watched
          </p>
        </div>
      )}
    </div>
  );
}

function SourcesCard({ course, onAdd }: { course: CourseState; onAdd: () => void }) {
  return (
    <div className="rounded-[20px] border-[2.5px] border-dashed border-ink/40 p-5">
      <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Sources</p>
      <ul className="mt-2 space-y-1.5">
        {course.fileNames.map((name) => (
          <li key={name} className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
            <IconFile className="h-4 w-4 shrink-0" />
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ul>
      {course.pageCount ? <p className="mt-2 text-[13px] text-muted">{course.pageCount} pages</p> : null}
      <button type="button" onClick={onAdd} className="mt-3 text-[14px] font-medium text-ink underline">
        Start another course
      </button>
    </div>
  );
}

/** The roadmap of a generated course: lessons grouped under collapsible chapters. */
export function CourseRoadmap() {
  const session = useStudySession();
  const { openUpload } = useUpload();
  const course = session.course;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  if (!course) {
    return (
      <Shell>
        <div className="mt-6 flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center gap-4">
          {session.starting ? (
            <CrayonSketch />
          ) : (
            <Button onClick={() => openUpload()}>Create a course from your notes</Button>
          )}
          {session.error && <p className="text-[16px] text-crayon-text">{session.error}</p>}
        </div>
      </Shell>
    );
  }

  const chapters = course.chapters.filter((chapter) => !chapter.skip);
  const lessons = courseLessons(course);
  const next = nextLesson(course);
  const reading = course.stage === 'structure' && course.status !== 'failed';
  const structureFailed = course.stage === 'structure' && course.status === 'failed';
  const title = course.title?.trim() || course.fileNames[0] || 'Your course';
  const isOpen = (chapter: ChapterState) =>
    toggled[chapter.id] ??
    (chapter.id === next?.chapterId || chapter.status === 'failed' || (!next && chapter === chapters[0]));
  const firstNumbers = chapters.map((_, index) => 1 + chapters.slice(0, index).reduce((total, item) => total + item.lessons.length, 0));

  return (
    <Shell>
      <div className="mt-2 flex h-14 items-center gap-3">
        <Link
          to="/"
          aria-label="Library"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper"
        >
          <IconBack className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 truncate font-serif text-[24px] leading-none text-ink">
          <HandUnderline>{title}</HandUnderline>
        </h1>
        {course.category && <p className="min-w-0 truncate text-[14px] text-muted">{course.category}</p>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {chapters.length > 0 && (
            <span className={`${pill} bg-paper`}>
              {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
            </span>
          )}
          {lessons.length > 0 && (
            <span className={`${pill} bg-yellow`}>
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          )}
          {course.status === 'writing' && <span className={`${pill} bg-paper`}>Writing lessons…</span>}
        </div>
      </div>

      {session.error && <p className="mt-2 text-[15px] text-crayon-text">{session.error}</p>}

      {structureFailed && (
        <FailureNotes
          className="mt-4"
          items={[
            {
              id: `course:${course.id}`,
              title: 'The chapters of this document could not be found',
              message: course.error ?? 'Reading the document failed.',
              code: course.errorInfo?.code,
              onRetry: () => void session.retryCourse(),
            },
          ]}
        />
      )}

      {reading ? (
        <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center">
          <CrayonSketch detail="Reading the document and finding its chapters…" />
        </div>
      ) : (
        chapters.length > 0 && (
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_320px] items-start gap-6 pb-10">
            <div className="space-y-4">
              {chapters.map((chapter, index) => (
                <ChapterSection
                  key={chapter.id}
                  chapter={chapter}
                  number={index + 1}
                  open={isOpen(chapter)}
                  onToggle={() => setToggled((current) => ({ ...current, [chapter.id]: !isOpen(chapter) }))}
                  firstLesson={firstNumbers[index] ?? 1}
                  nextId={next?.id ?? null}
                />
              ))}
            </div>
            <aside className="sticky top-4 space-y-4">
              <NextCard course={course} />
              <SourcesCard course={course} onAdd={() => openUpload()} />
            </aside>
          </div>
        )
      )}
    </Shell>
  );
}
