import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SourceFile } from '../data/topics.ts';
import type { TrailStatus } from './roadmapTypes.ts';
import { buttonClass } from './ui/Button.tsx';
import { cardClass } from './ui/Card.tsx';
import { Chip } from './ui/Chip.tsx';
import { IconBack, IconCheck, IconFile, IconImage, IconLock, IconPlay, IconPlus, IconClose } from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';
import { cx } from './ui/cx.ts';

export type { TrailStatus };

export type TrailChapter = {
  id: string;
  title: string;
  duration: string;
  state: 'watched' | 'resume' | 'later';
};

export type TrailStep = {
  id: string;
  title: string;
  detail: string;
  status: TrailStatus;
  artId: string;
  duration: string;
  progress: number;
  timeLeft: string;
  hint?: string;
  statusText?: string;
  href?: string;
  onOpen?: () => void;
  chapters: TrailChapter[];
};

const statusLabel: Record<TrailStatus, string> = {
  done: 'Done',
  next: 'Up next',
  locked: 'Locked',
  open: 'Ready',
  rendering: 'Rendering',
  failed: 'Failed',
};

const mutedStatus = (status: TrailStatus) => status === 'locked' || status === 'rendering' || status === 'failed';

function Node({ status, index }: { status: TrailStatus; index: number }) {
  if (status === 'done') {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white shadow-[2px_2px_0_var(--color-ink)]">
        <IconCheck className="h-5 w-5" />
      </span>
    );
  }
  if (status === 'next') {
    return (
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-[2.5px] border-ink bg-yellow font-serif text-2xl text-ink shadow-[0_0_0_4px_var(--color-stone),0_0_0_7px_var(--color-focus)]">
        {index + 1}
      </span>
    );
  }
  if (mutedStatus(status)) {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-ink/40 bg-paper text-muted">
        {status === 'locked' ? <IconLock className="h-5 w-5" /> : index + 1}
      </span>
    );
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper text-[15px] font-semibold text-ink">
      {index + 1}
    </span>
  );
}

function metaLine(step: TrailStep) {
  const parts = step.chapters.length > 0 ? `${step.chapters.length}-part lesson` : '';
  const bits = [parts, step.duration].filter(Boolean);
  if (step.status === 'rendering' && step.statusText) bits.push(step.statusText);
  if (step.status === 'failed') bits.push('Failed');
  return bits.join(' · ');
}

function eyebrowClass(status: TrailStatus) {
  if (status === 'next') return 'text-crayon-text';
  if (status === 'done') return 'text-done';
  if (status === 'failed') return 'text-crayon-text';
  return 'text-muted';
}

function LessonCard({
  step,
  selected,
  onSelect,
}: {
  step: TrailStep;
  selected: boolean;
  onSelect: () => void;
}) {
  const muted = mutedStatus(step.status);
  const label = step.status === 'rendering' ? (step.statusText ?? statusLabel.rendering) : statusLabel[step.status];
  const resume =
    step.status === 'done' ? 'Watch again' : step.status === 'open' ? 'Open' : `Resume${step.timeLeft ? ` · ${step.timeLeft} left` : ''}`;

  return (
    <div
      onClick={onSelect}
      className={cardClass(
        false,
        muted,
        cx('flex min-w-0 items-center gap-4 p-3', muted && 'bg-stone/60 opacity-80', selected && 'ring-2 ring-focus ring-offset-2 ring-offset-paper'),
      )}
    >
      <button type="button" className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <span className="relative shrink-0">
          <TopicArt topicId={step.artId} className={cx('h-[92px] w-[148px]', muted && 'opacity-50')} />
          {step.duration && (
            <span className="absolute right-1.5 bottom-1.5 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
              {step.duration}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className={cx('block text-[12px] font-semibold tracking-[0.14em] uppercase', eyebrowClass(step.status))}>{label}</span>
          <span className="mt-1 block truncate font-serif text-[22px] leading-tight text-ink">{step.title}</span>
          {metaLine(step) && <span className="mt-1 block truncate text-[14px] text-muted">{metaLine(step)}</span>}
          {step.status === 'failed' && step.hint && (
            <span className="mt-1 block truncate text-[13px] text-crayon-text">{step.hint}</span>
          )}
        </span>
      </button>
      <span className="shrink-0 pr-1">
        {step.status === 'rendering' && (
          <span
            className="block h-8 w-8 animate-spin rounded-full border-[3px] border-ink/15 border-t-crayon motion-reduce:animate-none"
            role="status"
            aria-label={step.statusText ?? 'Rendering'}
          />
        )}
        {step.status === 'locked' && (
          <button type="button" disabled className={buttonClass('secondary', '!px-4 !py-1.5 !text-[14px]')}>
            Locked
          </button>
        )}
        {(step.status === 'next' || step.status === 'open' || step.status === 'done') && step.href && (
          <Link
            to={step.href}
            onClick={(event) => event.stopPropagation()}
            className={buttonClass(step.status === 'next' ? 'primary' : 'secondary', '!px-4 !py-1.5 !text-[14px]')}
          >
            {step.status === 'next' && <IconPlay className="h-4 w-4" />}
            {step.status === 'next' ? 'Resume' : step.status === 'done' ? 'Watch again' : 'Open'}
          </Link>
        )}
        {(step.status === 'next' || step.status === 'open' || step.status === 'done') && !step.href && step.onOpen && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              step.onOpen?.();
            }}
            className={buttonClass(step.status === 'next' ? 'primary' : 'secondary', '!px-4 !py-1.5 !text-[14px]')}
          >
            {step.status === 'next' && <IconPlay className="h-4 w-4" />}
            {resume}
          </button>
        )}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-[13px] text-muted">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-full bg-crayon" />
        Done
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-ink bg-yellow" />
        Up next
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-ink bg-paper" />
        Ready
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-4 rounded-full border border-dashed border-ink/40" />
        Locked
      </li>
    </ul>
  );
}

export function RoadmapTrail({
  steps,
  selectedId,
  onSelect,
}: {
  steps: TrailStep[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const overall =
    steps.length === 0
      ? 0
      : Math.round(
          steps.reduce((sum, step) => sum + (mutedStatus(step.status) ? 0 : step.progress), 0) / steps.length,
        );

  useEffect(() => {
    const measure = () => {
      const board = boardRef.current;
      if (!board) return;
      const items = [...board.querySelectorAll<HTMLElement>('[data-step]')].filter((item) => item.offsetParent !== null);
      const limit = window.innerHeight - 28;
      setHidden(items.filter((item) => item.getBoundingClientRect().top > limit).length);
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [steps.length]);

  const scrollMore = () => {
    const board = boardRef.current;
    if (!board) return;
    const items = [...board.querySelectorAll<HTMLElement>('[data-step]')].filter((item) => item.offsetParent !== null);
    const next = items.find((item) => item.getBoundingClientRect().top > window.innerHeight - 28);
    next?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div ref={boardRef} className="rounded-[28px] border-2 border-ink/15 bg-paper px-4 py-4 min-[1200px]:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-3 text-[14px] font-medium text-ink">
          Overall {overall}%
          <span className="h-2 w-16 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full rounded-full bg-crayon" style={{ width: `${overall}%` }} />
          </span>
        </p>
        <Legend />
      </div>
      <ol className="mt-4">
        {steps.map((step, index) => {
          const line =
            step.status === 'done' || (index > 0 && steps[index - 1]?.status === 'done') ? 'bg-crayon' : 'bg-[var(--color-trail)]';
          return (
            <li key={step.id} data-step className="grid grid-cols-[4.5rem_minmax(0,1fr)]">
              <div className="relative flex items-center justify-center">
                {index > 0 && <span className={cx('absolute top-0 left-1/2 h-1/2 w-[7px] -translate-x-1/2', line)} />}
                {index < steps.length - 1 && (
                  <span
                    className={cx(
                      'absolute bottom-0 left-1/2 h-1/2 w-[7px] -translate-x-1/2',
                      step.status === 'done' ? 'bg-crayon' : 'bg-[var(--color-trail)]',
                    )}
                  />
                )}
                {index === 0 && (step.status === 'next' || step.status === 'done') && (
                  <span className="absolute top-0 left-1/2 h-[calc(50%-2rem)] w-[7px] -translate-x-1/2 rounded-full bg-crayon" />
                )}
                <span className="relative z-10">
                  <Node status={step.status} index={index} />
                </span>
              </div>
              <div className="min-w-0 py-2">
                <LessonCard step={step} selected={step.id === selectedId} onSelect={() => onSelect(step.id)} />
              </div>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <div className="pointer-events-none sticky bottom-3 z-20 mt-3 flex justify-end">
          <button
            type="button"
            onClick={scrollMore}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-ink px-4 py-2 text-[14px] font-medium text-paper"
          >
            Scroll for {hidden} more {hidden === 1 ? 'step' : 'steps'}
            <IconBack className="h-4 w-4 -rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}

export function StepPanel({
  step,
  index,
  sources,
  onClose,
  onAdd,
}: {
  step: TrailStep;
  index: number;
  sources?: SourceFile[];
  onClose: () => void;
  onAdd?: () => void;
}) {
  const resume =
    step.status === 'done' ? 'Watch again' : step.status === 'open' ? 'Open' : `Resume${step.timeLeft ? ` · ${step.timeLeft} left` : ''}`;
  const quiet = step.status === 'rendering' || step.status === 'failed';
  const watched =
    step.progress <= 0 ? 'Not started' : step.progress >= 100 ? 'Finished' : `${step.progress}% watched · ${step.timeLeft} left`;

  return (
    <aside className={cardClass(false, false, 'min-w-0 p-4 min-[1200px]:sticky min-[1200px]:top-4')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
          Step {index + 1} · {step.statusText ?? statusLabel[step.status]}
        </p>
        <button
          type="button"
          aria-label="Close step details"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink"
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>
      <div className="relative mt-3">
        <TopicArt topicId={step.artId} className={cx('aspect-[16/9]', quiet && 'opacity-60')} />
        {step.duration && (
          <span className="absolute right-2 bottom-2 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
            {step.duration}
          </span>
        )}
      </div>
      <h2 className="mt-3 font-serif text-[1.7rem] leading-tight text-ink">{step.title}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">{step.detail}</p>
      {step.status === 'rendering' && (
        <p className="mt-4 inline-flex items-center gap-3 text-[15px] font-medium text-ink">
          <span className="block h-8 w-8 animate-spin rounded-full border-[3px] border-ink/15 border-t-crayon motion-reduce:animate-none" />
          Being rendered
        </p>
      )}
      {step.status === 'failed' && <p className="mt-4 text-[15px] text-crayon-text">{step.hint ?? 'This lesson could not be rendered.'}</p>}
      {!quiet && (
        <>
          <p className="mt-3 text-[15px] text-muted">{watched}</p>
          {step.status === 'locked' || (!step.href && !step.onOpen) ? (
            <button type="button" disabled className={buttonClass('secondary', 'mt-4 w-full')}>
              {step.hint ?? 'Locked'}
            </button>
          ) : step.href ? (
            <Link to={step.href} className={buttonClass(step.status === 'done' || step.status === 'open' ? 'secondary' : 'primary', 'mt-4 w-full')}>
              {step.status === 'next' && <IconPlay className="h-4 w-4" />}
              {resume}
            </Link>
          ) : (
            <button type="button" onClick={step.onOpen} className={buttonClass('primary', 'mt-4 w-full')}>
              <IconPlay className="h-4 w-4" />
              {resume}
            </button>
          )}
          <div className="mt-5">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">In this lesson</p>
            {step.chapters.length === 0 ? (
              <p className="mt-2 text-[15px] text-muted">The lesson is written when you open it.</p>
            ) : (
              <ul className="mt-2 grid w-full min-w-0 gap-1">
                {step.chapters.map((chapter) => (
                  <li
                    key={chapter.id}
                    className={cx('flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5', chapter.state === 'resume' && 'bg-[#fff6d4]')}
                  >
                    {chapter.state === 'watched' ? (
                      <IconCheck className="h-4 w-4 shrink-0 text-done" />
                    ) : chapter.state === 'resume' ? (
                      <IconPlay className="h-4 w-4 shrink-0 text-ink" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-ink/30" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[15px] text-ink" title={chapter.title}>
                      {chapter.title}
                    </span>
                    <span className="shrink-0 text-[13px] text-muted tabular-nums">{chapter.duration}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {sources && (
        <div className="mt-5">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">Sources</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sources.map((source) => (
              <Chip key={source.name}>
                {source.kind === 'pdf' ? <IconFile className="h-4 w-4" /> : <IconImage className="h-4 w-4" />}
                <span className="max-w-[12rem] truncate">{source.name}</span>
              </Chip>
            ))}
            {onAdd && (
              <Chip onClick={onAdd}>
                <IconPlus className="h-4 w-4" />
                Add
              </Chip>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
