import { Link, useSearchParams } from 'react-router-dom';
import { Button, buttonClass } from '../components/ui/Button.tsx';
import { cardClass } from '../components/ui/Card.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { CrayonProgress } from '../components/ui/CrayonProgress.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconHighlight, IconPlay } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { TopicArt } from '../components/ui/TopicArt.tsx';
import { topics } from '../data/topics.ts';
import { MAX_INLINE_BYTES } from '../lib/ai.ts';
import { usePalette } from '../paletteState.ts';
import { latestOpenTopic, nextSubtopic, topicKey, useLocalStudy } from '../study/localStudy.tsx';
import { formatClock, formatLength, subtopicFrames, topicFrames } from '../study/time.ts';
import { useUpload } from '../study/uploadState.tsx';

const filters = ['All', 'Economy', 'Business', 'Software', 'In progress'] as const;

const filterValue = (label: (typeof filters)[number]) => {
  if (label === 'All') return 'all';
  if (label === 'In progress') return 'progress';
  return label;
};

export function HomePage() {
  const { prefix } = usePalette();
  const { openUpload } = useUpload();
  const { progress } = useLocalStudy();
  const [params, setParams] = useSearchParams();
  const filter = params.get('filter') ?? 'all';
  const home = prefix || '/';

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

  const setFilter = (value: string) => {
    if (value === 'all') setParams({});
    else setParams({ filter: value });
  };

  return (
    <Shell>
      <section className="mt-8 grid items-start gap-8 lg:mt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,420px)] lg:gap-12">
        <div>
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

        <article className={cardClass(true, false, 'p-3 sm:p-4')}>
          <p className="px-1 text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">
            Continue learning
          </p>
          <div className="relative mt-3">
            <TopicArt topicId={resumeTopic.id} className="aspect-[16/10]" />
            <span className="absolute top-1/2 left-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white shadow-[2px_2px_0_var(--color-ink)]">
              <IconPlay className="h-5 w-5" />
            </span>
            <span className="absolute right-2 bottom-2 rounded-md bg-ink/90 px-2 py-0.5 text-[12px] font-medium text-paper">
              {formatClock(remaining)} left
            </span>
          </div>
          <h2 className="mt-3 font-serif text-[1.7rem] leading-tight text-ink">{resumeTopic.title}</h2>
          <p className="mt-1 text-[15px] text-muted">
            {resumeTopic.field} · Step {stepIndex + 1} of {resumeTopic.subtopics.length}
          </p>
          <div className="mt-3">
            <CrayonProgress
              value={percent}
              label={`${resumeTopic.title} progress`}
              showValue
            />
          </div>
          <Link
            to={`${home === '/' ? '' : home}/topics/${resumeTopic.id}/${current.id}`}
            className={buttonClass('primary', 'mt-4')}
          >
            {inProgress ? 'Resume' : 'Start'}
          </Link>
        </article>
      </section>

      <section id="topics" className="mt-14 scroll-mt-6">
        <h2 className="font-serif text-4xl text-ink">
          <HandUnderline color="text-yellow">Your topics</HandUnderline>
        </h2>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1" role="toolbar" aria-label="Filter topics">
          {filters.map((label) => {
            const value = filterValue(label);
            return (
              <Chip key={value} active={filter === value} onClick={() => setFilter(value)}>
                {label}
              </Chip>
            );
          })}
        </div>
        {visible.length === 0 ? (
          <p className="mt-6 text-[16px] text-muted">Nothing in progress yet. Open a topic to start.</p>
        ) : (
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
