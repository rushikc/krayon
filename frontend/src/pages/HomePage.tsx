import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { CourseState } from '@krayon/shared';
import { courseLessons } from '@krayon/shared';
import { Button, buttonClass } from '../components/ui/Button.tsx';
import { cardClass } from '../components/ui/Card.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { CrayonProgress } from '../components/ui/CrayonProgress.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconHighlight, IconPlay, IconTrash } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { TopicArt } from '../components/ui/TopicArt.tsx';
import { MAX_UPLOAD_BYTES, deleteCourse, listCourses } from '../lib/api.ts';
import { formatClock } from '../study/time.ts';
import { useStudySession } from '../study/studyState.ts';
import { useUpload } from '../study/uploadState.tsx';

const artFor = (index: number) =>
  ['inflation-and-interest-rates', 'how-a-company-makes-money', 'how-the-internet-works', 'unit-economics'][index % 4];

const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

/** One library card per course: lessons watched, and time left in the ready ones. */
const listingForCourse = (course: CourseState, startIndex: number): CreatedListing => {
  const title = course.title?.trim() || fileTitle(course.fileNames[0] ?? '') || 'Your notes';
  const lessons = courseLessons(course);
  if (course.stage === 'structure') {
    return {
      key: course.id,
      courseId: course.id,
      title,
      summary: course.status === 'failed' ? (course.error ?? 'Reading the document failed.') : 'Reading the chapters of your notes.',
      field: '',
      meta: course.status === 'failed' ? 'Failed' : 'Being made',
      percent: course.status === 'failed' ? 0 : 8,
      href: '/study',
      artId: artFor(startIndex),
      timeLeft: '',
    };
  }
  let score = 0;
  let remaining = 0;
  for (const lesson of lessons) {
    const progress = lesson.progress;
    const done = progress?.completed || progress?.watched;
    if (done) score += 1;
    else if (progress && lesson.durationFrames > 0) score += Math.min(1, progress.positionFrame / lesson.durationFrames);
    if (lesson.status === 'ready' && !done) remaining += Math.max(0, lesson.durationFrames - (progress?.positionFrame ?? 0));
  }
  const chapters = course.chapters.filter((chapter) => !chapter.skip).length;
  return {
    key: course.id,
    courseId: course.id,
    title,
    summary: '',
    field: course.category?.trim() ?? '',
    meta: `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'} · ${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'}`,
    percent: lessons.length === 0 ? 0 : Math.round((score / lessons.length) * 100),
    href: '/study',
    artId: artFor(startIndex),
    timeLeft: remaining > 0 ? formatClock(remaining) : '',
  };
};

const filterValue = (label: string) => {
  if (label === 'All') return 'all';
  if (label === 'In progress') return 'progress';
  return label;
};

type CreatedListing = {
  key: string;
  courseId: string;
  title: string;
  summary: string;
  field: string;
  meta: string;
  percent: number;
  href: string;
  artId: string;
  timeLeft: string;
};

export function HomePage() {
  const { openUpload } = useUpload();
  const session = useStudySession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [apiCourses, setApiCourses] = useState<CourseState[]>([]);
  const [listingReady, setListingReady] = useState(false);
  const [pending, setPending] = useState<CreatedListing | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const filter = params.get('filter') ?? 'all';
  const openCourse = session.course;

  useEffect(() => {
    let cancel = false;
    listCourses()
      .then((result) => {
        if (cancel) return;
        setApiCourses(result.courses);
        setListingReady(true);
      })
      .catch(() => {
        if (!cancel) setListingReady(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const sources = new Map(apiCourses.map((course) => [course.id, course]));
  if (listingReady && openCourse) sources.set(openCourse.id, openCourse);
  const created = listingReady
    ? [...sources.values()].map((course, index) => listingForCourse(course, index))
    : [];
  const chips = [
    'All',
    ...[...new Set(created.map((card) => card.field).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    'In progress',
  ];
  const createdVisible = created.filter((card) => {
    if (filter === 'all') return true;
    if (filter === 'progress') return card.percent < 100;
    return card.field.toLowerCase() === filter.toLowerCase();
  });
  const focus = created.find((card) => card.percent < 100) ?? created[0] ?? null;

  const openCreated = (event: { preventDefault: () => void }, courseId: string, href: string) => {
    if (session.courseId === courseId) return;
    event.preventDefault();
    void session.openCourse(courseId).then(() => navigate(href));
  };

  const confirmRemove = async () => {
    if (!pending || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await deleteCourse(pending.courseId);
      session.clearCourse(pending.courseId);
      setApiCourses((current) => current.filter((course) => course.id !== pending.courseId));
      setPending(null);
    } catch (caught) {
      setRemoveError(caught instanceof Error ? caught.message : 'The topic could not be removed.');
    } finally {
      setRemoving(false);
    }
  };

  const sizeMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
  const hero = listingReady && focus
    ? {
        artId: focus.artId,
        timeLeft: focus.timeLeft,
        title: focus.title,
        detail: [focus.field, focus.meta].filter(Boolean).join(' · '),
        percent: focus.percent,
        href: focus.href,
        courseId: focus.courseId,
        action: focus.percent > 0 && focus.percent < 100 ? 'Resume' : 'Open',
      }
    : null;

  const setFilter = (value: string) => {
    if (value === 'all') setParams({});
    else setParams({ filter: value });
  };

  return (
    <Shell>
      <section className="mt-8 flex flex-col items-start gap-8 min-[1200px]:flex-row min-[1200px]:gap-8">
        <div className="min-w-0 max-w-xl shrink-0">
          <p className="font-serif text-[22px] font-[520] italic tracking-[0.08em] text-crayon-text">
            Video-first study
          </p>
          <h1 className="mt-3 max-w-xl font-serif text-[2.7rem] leading-[1.05] font-[640] text-ink sm:text-6xl">
            Turn your notes
            <br />
            <HandUnderline>into a lesson you</HandUnderline>
            <br />
            <HandUnderline>can watch</HandUnderline>
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">
            Drop in PDFs, notes or photos. Krayon turns them into narrated video lessons, chapter by
            chapter. Pause to ask a question, or redraw any part you didn't follow.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => openUpload()}>
              <IconHighlight className="h-4 w-4" />
              Create a lesson from your notes
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-muted">PDF, JPG, PNG · up to {sizeMb} MB</p>
        </div>

        {hero && (
          <div className="flex min-w-0 w-full flex-1 justify-center">
            <article className={cardClass(true, false, 'w-full max-w-[420px] shrink-0 p-3 sm:p-4')}>
              <p className="px-1 text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">
                Continue learning
              </p>
              <div className="relative mt-3">
                <TopicArt topicId={hero.artId} className="aspect-[16/10]" />
                <span className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white shadow-[2px_2px_0_var(--color-ink)]">
                  <IconPlay className="h-5 w-5" />
                </span>
                {hero.timeLeft && (
                  <span className="absolute right-2 bottom-2 rounded-md bg-ink/90 px-2 py-0.5 text-[12px] font-medium text-paper">
                    {hero.timeLeft} left
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-serif text-[1.7rem] leading-tight text-ink">{hero.title}</h2>
              <p className="mt-1 text-[15px] text-muted">{hero.detail}</p>
              <div className="mt-3">
                <CrayonProgress value={hero.percent} label={`${hero.title} progress`} showValue />
              </div>
              <Link
                to={hero.href}
                onClick={(event) => openCreated(event, hero.courseId, hero.href)}
                className={buttonClass('primary', 'mt-4')}
              >
                {hero.action}
              </Link>
            </article>
          </div>
        )}
      </section>

      <section id="topics" className="mt-1.5 scroll-mt-6 pb-[200px]">
        <h2 className="font-serif text-4xl text-ink">
          <HandUnderline color="text-yellow">Your topics</HandUnderline>
        </h2>
        {!listingReady ? (
          <div className="mt-6 flex items-center gap-3" aria-busy="true" aria-live="polite">
            <span
              className="block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-crayon motion-reduce:animate-none"
              aria-hidden="true"
            />
            <p className="text-[16px] text-muted">Loading your topics…</p>
          </div>
        ) : (
          <>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Filter topics">
              {chips.map((label) => {
                const value = filterValue(label);
                return (
                  <Chip key={value} active={filter === value} onClick={() => setFilter(value)}>
                    {label}
                  </Chip>
                );
              })}
            </div>
            {createdVisible.length === 0 ? (
              <p className="mt-6 text-[16px] text-muted">No topics yet. Create a lesson from your notes.</p>
            ) : (
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {createdVisible.map((card) => (
                  <li key={card.key}>
                    <div className={cardClass(false, false, 'flex h-full flex-col p-3')}>
                      <Link
                        to={card.href}
                        onClick={(event) => openCreated(event, card.courseId, card.href)}
                        className="block transition-transform hover:-translate-y-0.5"
                      >
                        <div className="relative">
                          <TopicArt topicId={card.artId} className="aspect-[16/10]" />
                          {card.timeLeft && (
                            <span className="absolute right-2 bottom-2 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
                              {card.timeLeft}
                            </span>
                          )}
                        </div>
                        {card.field && (
                          <p className="mt-3 text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">{card.field}</p>
                        )}
                        <h3 className={`${card.field ? 'mt-1' : 'mt-3'} line-clamp-2 min-h-[calc(1.35rem*1.25*2)] font-serif text-[1.35rem] leading-tight text-ink`}>
                          {card.title}
                        </h3>
                        {card.summary && <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-muted">{card.summary}</p>}
                        <p className="mt-3 text-[13px] text-muted">{card.meta}</p>
                        <div className="mt-2">
                          <CrayonProgress
                            value={card.percent}
                            label={`${card.title} progress`}
                            tone={card.percent === 100 ? 'done' : 'crayon'}
                            showValue
                          />
                        </div>
                      </Link>
                      <div className="mt-auto flex justify-end pt-1">
                        <button
                          type="button"
                          className={buttonClass('primary', '!px-2.5 !py-1.5')}
                          aria-label={`Remove ${card.title}`}
                          onClick={() => {
                            setRemoveError(null);
                            setPending(card);
                          }}
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
      {pending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-6" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-topic-title"
            className="w-full max-w-md rounded-[20px] border-[2.5px] border-ink bg-paper p-5 shadow-[4px_4px_0_var(--color-ink)]"
          >
            <h2 id="remove-topic-title" className="font-serif text-[24px] leading-tight text-ink">
              Remove this topic?
            </h2>
            <p className="mt-2 text-[15px] text-muted">
              Do you really want to remove <span className="font-medium text-ink">{pending.title}</span>? This cannot be
              undone.
            </p>
            {removeError && <p className="mt-3 text-[15px] text-crayon-text">{removeError}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={removing}
                onClick={() => {
                  if (removing) return;
                  setPending(null);
                  setRemoveError(null);
                }}
              >
                Cancel
              </Button>
              <Button disabled={removing} onClick={() => void confirmRemove()}>
                {removing ? 'Removing…' : 'Yes, remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
