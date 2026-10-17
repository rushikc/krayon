import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { GeneratedLesson, Roadmap } from '@krayon/shared';
import { Button, buttonClass } from '../components/ui/Button.tsx';
import { cardClass } from '../components/ui/Card.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { CrayonProgress } from '../components/ui/CrayonProgress.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconHighlight, IconPlay } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { TopicArt } from '../components/ui/TopicArt.tsx';
import { topics } from '../data/topics.ts';
import { listCourses, useBackendPipeline } from '../lib/api.ts';
import { MAX_INLINE_BYTES } from '../lib/ai.ts';
import { usePalette } from '../paletteState.ts';
import { orderTopics } from '../remotion/scene.ts';
import { latestOpenTopic, nextSubtopic, topicKey, useLocalStudy } from '../study/localStudy.tsx';
import type { LessonMarks } from '../study/localStudy.tsx';
import { formatClock, formatLength, subtopicFrames, topicFrames } from '../study/time.ts';
import { useStudySession } from '../study/studyState.ts';
import { useUpload } from '../study/uploadState.tsx';

const baseFilters = ['All', 'Economy', 'Business', 'Software', 'In progress'] as const;

const artFor = (index: number) =>
  ['inflation-and-interest-rates', 'how-a-company-makes-money', 'how-the-internet-works', 'unit-economics'][index % 4];

const fileTitle = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

const phaseShare = (status: string | undefined) => {
  if (status === 'reviewing') return 0.78;
  if (status === 'checking') return 0.55;
  if (status === 'generating') return 0.32;
  if (status === 'failed' || status === 'idle' || status === 'queued') return 0;
  return 0.08;
};

const listingsForCourse = (
  course: CourseListingSource,
  lessonMarks: (key: string) => LessonMarks,
  startIndex: number,
): CreatedListing[] => {
  const named = course.roadmap?.title?.trim();
  const title = named || fileTitle(course.fileNames[0] ?? '') || 'Your notes';
  if (!course.roadmap) {
    return [
      {
        key: course.id,
        courseId: course.id,
        title,
        summary: 'Drawing the lessons from your notes.',
        field: '',
        meta: 'Being rendered',
        percent: 8,
        href: '/study',
        artId: artFor(startIndex),
        timeLeft: '',
      },
    ];
  }
  const ordered = orderTopics(course.roadmap.topics);
  let score = 0;
  let remaining = 0;
  for (const topic of ordered) {
    const state = course.topics.find((item) => item.id === topic.id);
    const segments = state?.lesson?.segments ?? [];
    if (segments.length === 0) {
      score += phaseShare(state?.status);
      continue;
    }
    const seen = new Set(lessonMarks(`study:${topic.id}`).watchedIds);
    score += segments.filter((segment) => seen.has(segment.id)).length / segments.length;
    remaining += segments
      .filter((segment) => !seen.has(segment.id))
      .reduce((total, segment) => total + segment.durationInFrames, 0);
  }
  const count = ordered.length;
  return [
    {
      key: course.id,
      courseId: course.id,
      title,
      summary: '',
      field: course.roadmap.category?.trim() ?? '',
      meta: count === 1 ? '1 lesson' : `${count} lessons`,
      percent: count === 0 ? 0 : Math.round((score / count) * 100),
      href: '/study',
      artId: artFor(startIndex),
      timeLeft: remaining > 0 ? formatClock(remaining) : '',
    },
  ];
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

type CourseListingSource = {
  id: string;
  fileNames: string[];
  roadmap: Roadmap | null;
  topics: { id: string; status: string; lesson: GeneratedLesson | null }[];
};

export function HomePage() {
  const { prefix } = usePalette();
  const { openUpload } = useUpload();
  const { progress, lessonMarks } = useLocalStudy();
  const session = useStudySession();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [apiCourses, setApiCourses] = useState<CourseListingSource[]>([]);
  const filter = params.get('filter') ?? 'all';
  const home = prefix || '/';
  const topicSig = Object.entries(session.topics)
    .map(([id, topic]) => `${id}:${topic.status}`)
    .join('|');

  useEffect(() => {
    if (!useBackendPipeline) return;
    let cancel = false;
    listCourses()
      .then((result) => {
        if (cancel) return;
        setApiCourses(
          result.courses.map((course) => ({
            id: course.id,
            fileNames: course.fileNames,
            roadmap: course.roadmap,
            topics: course.topics.map((topic) => ({ id: topic.id, status: topic.status, lesson: topic.lesson })),
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [session.buildingRoadmap, session.courseId, session.roadmap, topicSig]);

  const sources = new Map(apiCourses.map((course) => [course.id, course]));
  if (session.courseId && session.roadmap && !sources.has(session.courseId)) {
    sources.set(session.courseId, {
      id: session.courseId,
      fileNames: session.fileName ? session.fileName.split(', ') : [],
      roadmap: session.roadmap,
      topics: session.roadmap.topics.map((topic) => ({
        id: topic.id,
        status: session.topics[topic.id]?.status ?? 'queued',
        lesson: session.lessons[topic.id] ?? null,
      })),
    });
  } else if (session.courseId && session.buildingRoadmap && !sources.has(session.courseId)) {
    sources.set(session.courseId, {
      id: session.courseId,
      fileNames: session.fileName ? session.fileName.split(', ') : ['Your notes'],
      roadmap: null,
      topics: [],
    });
  }
  if (session.courseId && sources.has(session.courseId)) {
    const current = sources.get(session.courseId)!;
    sources.set(session.courseId, {
      ...current,
      roadmap: session.roadmap ?? current.roadmap,
      fileNames: session.fileName ? session.fileName.split(', ') : current.fileNames,
      topics: (session.roadmap ?? current.roadmap)?.topics.map((topic) => ({
        id: topic.id,
        status: session.topics[topic.id]?.status ?? current.topics.find((item) => item.id === topic.id)?.status ?? 'queued',
        lesson: session.lessons[topic.id] ?? current.topics.find((item) => item.id === topic.id)?.lesson ?? null,
      })) ?? current.topics,
    });
  }
  const created: CreatedListing[] = [];
  let artIndex = 0;
  for (const course of sources.values()) {
    const cards = listingsForCourse(course, lessonMarks, artIndex);
    created.push(...cards);
    artIndex += cards.length;
  }
  const known = new Set(baseFilters.map((label) => label.toLowerCase()));
  const chips = [
    ...baseFilters.slice(0, 4),
    ...[...new Set(created.map((card) => card.field).filter(Boolean))]
      .filter((name) => !known.has(name.toLowerCase()))
      .sort((a, b) => a.localeCompare(b)),
    'In progress',
  ];
  const createdVisible = created.filter((card) => {
    if (filter === 'all') return true;
    if (filter === 'progress') return card.percent < 100;
    return card.field.toLowerCase() === filter.toLowerCase();
  });
  const focus = created.find((card) => card.percent < 100) ?? null;

  const openCreated = (event: { preventDefault: () => void }, courseId: string, href: string) => {
    if (session.courseId === courseId) return;
    event.preventDefault();
    void session.openCourse(courseId).then(() => navigate(href));
  };

  const visible = topics.filter((topic) => {
    if (filter === 'progress') {
      const done = progress[topicKey(topic.id)]?.doneIds.length ?? 0;
      return done > 0 && done < topic.subtopics.length;
    }
    if (filter === 'all') return true;
    return topic.field === filter;
  });

  const resumeTopic = latestOpenTopic(topics, progress) ?? topics[0];
  const doneIds = progress[topicKey(resumeTopic.id)]?.doneIds ?? [];
  const current = nextSubtopic(resumeTopic, doneIds);
  const stepIndex = Math.max(
    0,
    resumeTopic.subtopics.findIndex((subtopic) => subtopic.id === current.id),
  );
  const percent = Math.round((doneIds.length / resumeTopic.subtopics.length) * 100);
  const remaining = resumeTopic.subtopics
    .slice(stepIndex)
    .reduce((total, subtopic) => total + subtopicFrames(subtopic.beats.length), 0);
  const inProgress = doneIds.length > 0;
  const sizeMb = Math.round(MAX_INLINE_BYTES / (1024 * 1024));
  const hero = focus
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
    : {
        artId: resumeTopic.id,
        timeLeft: formatClock(remaining),
        title: resumeTopic.title,
        detail: `${resumeTopic.field} · Step ${stepIndex + 1} of ${resumeTopic.subtopics.length}`,
        percent,
        href: `${home === '/' ? '' : home}/topics/${resumeTopic.id}/${current.id}`,
        courseId: null,
        action: inProgress ? 'Resume' : 'Start',
      };

  const setFilter = (value: string) => {
    if (value === 'all') setParams({});
    else setParams({ filter: value });
  };

  return (
    <Shell>
      <section className="mt-8 flex flex-col items-start gap-8 lg:mt-12 lg:flex-row lg:gap-50">
        <div className="min-w-0 max-w-xl">
          <p className="text-[12px] font-semibold tracking-[0.18em] text-crayon-text uppercase">
            Video-first study
          </p>
          <h1 className="mt-3 max-w-xl font-serif text-[2.7rem] leading-[1.05] font-[640] text-ink sm:text-6xl">
            Turn your notes
            <br />
            <HandUnderline>into a lesson you</HandUnderline>
            <br />
            <HandUnderline>can pause</HandUnderline>
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">
            Drop in PDFs, notes or photos. Krayon draws a short lesson for every topic, and redraws
            any part you didn’t follow.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={() => openUpload()}>
              <IconHighlight className="h-4 w-4" />
              Create a lesson from your notes
            </Button>
            <Button
              variant="secondary"
              onClick={() => document.getElementById('topics')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Browse topics
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-muted">PDF, JPG, PNG · up to {sizeMb} MB</p>
        </div>

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
            onClick={(event) => {
              if (hero.courseId) openCreated(event, hero.courseId, hero.href);
            }}
            className={buttonClass('primary', 'mt-4')}
          >
            {hero.action}
          </Link>
        </article>
      </section>

      <section id="topics" className="mt-14 scroll-mt-6">
        <h2 className="font-serif text-4xl text-ink">
          <HandUnderline color="text-yellow">Your topics</HandUnderline>
        </h2>
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
        {createdVisible.length + visible.length === 0 ? (
          <p className="mt-6 text-[16px] text-muted">Nothing in progress yet. Open a topic to start.</p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {createdVisible.map((card) => (
              <li key={card.key}>
                <Link
                  to={card.href}
                  onClick={(event) => openCreated(event, card.courseId, card.href)}
                  className={cardClass(false, false, 'flex h-full flex-col p-3 transition-transform hover:-translate-y-0.5')}
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
                  <h3 className={`${card.field ? 'mt-1' : 'mt-3'} font-serif text-[1.35rem] leading-tight text-ink`}>{card.title}</h3>
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
              </li>
            ))}
            {visible.map((topic) => {
              const done = progress[topicKey(topic.id)]?.doneIds.length ?? 0;
              const percentDone = Math.round((done / topic.subtopics.length) * 100);
              return (
                <li key={topic.id}>
                  <Link
                    to={`${home === '/' ? '' : home}/topics/${topic.id}`}
                    className={cardClass(
                      false,
                      false,
                      'flex h-full flex-col p-3 transition-transform hover:-translate-y-0.5',
                    )}
                  >
                    <div className="relative">
                      <TopicArt topicId={topic.id} className="aspect-[16/10]" />
                      <span className="absolute right-2 bottom-2 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
                        {formatLength(topicFrames(topic))}
                      </span>
                    </div>
                    <p className="mt-3 text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">
                      {topic.field}
                    </p>
                    <h3 className="mt-1 font-serif text-[1.35rem] leading-tight text-ink">{topic.title}</h3>
                    <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-muted">{topic.summary}</p>
                    <p className="mt-3 text-[13px] text-muted">{topic.subtopics.length} steps</p>
                    <div className="mt-2">
                      <CrayonProgress
                        value={percentDone}
                        label={`${topic.title} progress`}
                        tone={percentDone === 100 ? 'done' : 'crayon'}
                        showValue
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Shell>
  );
}
