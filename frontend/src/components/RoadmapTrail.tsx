import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SourceFile } from '../data/topics.ts';
import type { TrailStatus } from './roadmapTypes.ts';
import { buttonClass } from './ui/Button.tsx';
import { cardClass } from './ui/Card.tsx';
import { Chip } from './ui/Chip.tsx';
import { CrayonProgress } from './ui/CrayonProgress.tsx';
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
  href?: string;
  onOpen?: () => void;
  chapters: TrailChapter[];
};

const ROW = 176;
const NODE_HALF = 36;
const CARD_GAP = 16;

const snakeLayout = (width: number) => {
  const cardW = Math.min(220, Math.floor((width - 192) / 2));
  const snake = cardW >= 132;
  const left = NODE_HALF + 8;
  const right = Math.max(left, width - NODE_HALF - 8);
  return { snake, cardW, left, right };
};

const statusLabel: Record<TrailStatus, string> = {
  done: 'Done',
  next: 'Up next',
  locked: 'Locked',
  open: 'Ready',
};

const pointFor = (index: number, layout: { left: number; right: number }) => ({
  x: index % 2 === 0 ? layout.left : layout.right,
  y: index * ROW + ROW / 2,
});

const curve = (points: { x: number; y: number }[]) => {
  if (points.length === 0) return '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const curr = points[index];
    const mid = (prev.y + curr.y) / 2;
    path += ` C ${prev.x} ${mid}, ${curr.x} ${mid}, ${curr.x} ${curr.y}`;
  }
  return path;
};

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
  if (status === 'locked') {
    return (
      <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-ink/40 bg-paper text-muted">
        <IconLock className="h-5 w-5" />
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
  const percent = step.status === 'next' && step.progress > 0 && step.progress < 100 ? `${step.progress}%` : '';
  return [step.duration, statusLabel[step.status], percent].filter(Boolean).join(' · ');
}

function StepCard({ step, selected }: { step: TrailStep; selected: boolean }) {
  return (
    <span
      className={cardClass(
        false,
        step.status === 'locked',
        cx('block px-3 py-2 text-left', step.status === 'locked' && 'opacity-70', selected && 'ring-2 ring-focus ring-offset-2'),
      )}
    >
      <span className="block text-[15px] leading-snug font-medium text-ink">{step.title}</span>
      <span
        className={cx(
          'mt-0.5 block text-[13px]',
          step.status === 'done' && 'text-done',
          step.status === 'next' && 'text-crayon-text',
          step.status !== 'done' && step.status !== 'next' && 'text-muted',
        )}
      >
        {metaLine(step)}
      </span>
    </span>
  );
}

function Legend({ lockedLabel }: { lockedLabel: string }) {
  return (
    <ul className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-[13px] text-muted">
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-crayon" />
        Done
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-ink bg-yellow" />
        Up next
      </li>
      <li className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-ink/50" />
        {lockedLabel}
      </li>
    </ul>
  );
}

export function RoadmapTrail({
  steps,
  selectedId,
  legend,
  onSelect,
}: {
  steps: TrailStep[];
  selectedId?: string;
  legend: 'locked' | 'ready';
  onSelect: (id: string) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hidden, setHidden] = useState(0);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      const style = getComputedStyle(board);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setWidth(Math.max(0, board.clientWidth - pad));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

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
  }, [steps.length, width]);

  const height = steps.length * ROW;
  const layout = snakeLayout(Math.max(width, 1));
  const points = steps.map((_, index) => pointFor(index, layout));
  const cut = steps.findIndex((step) => step.status === 'next');
  const solidEnd = cut === -1 ? points.length - 1 : cut;
  const solid = curve(points.slice(0, solidEnd + 1));
  const dotted = curve(points.slice(solidEnd));
  const lockedLabel = legend === 'locked' ? 'Locked' : 'Ready';

  const scrollMore = () => {
    const board = boardRef.current;
    if (!board) return;
    const items = [...board.querySelectorAll<HTMLElement>('[data-step]')].filter((item) => item.offsetParent !== null);
    const next = items.find((item) => item.getBoundingClientRect().top > window.innerHeight - 28);
    next?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div ref={boardRef} className="rounded-[28px] border-2 border-dashed border-ink/25 px-3 py-4 sm:px-5">
      <Legend lockedLabel={lockedLabel} />
      {!layout.snake && (
      <ol className="mt-4 grid gap-5">
        {steps.map((step, index) => {
          const joined = step.status === 'done' || step.status === 'next';
          return (
            <li
              key={step.id}
              data-step
              className={cx('grid justify-items-start gap-2 border-l-[6px] pl-4', joined ? 'border-crayon' : 'border-dashed border-ink/40')}
            >
              <Node status={step.status} index={index} />
              {step.status === 'next' && (
                <span className="text-[13px] font-medium text-crayon-text">↑ you are here</span>
              )}
              <button
                type="button"
                className="w-full"
                aria-pressed={step.id === selectedId}
                aria-label={`${step.title}. ${metaLine(step)}`}
                onClick={() => onSelect(step.id)}
              >
                <StepCard step={step} selected={step.id === selectedId} />
              </button>
            </li>
          );
        })}
      </ol>
      )}
      {layout.snake && (
      <div className="relative mt-2" style={{ height }}>
        {width > 0 && (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0"
            width="100%"
            height={height}
            viewBox={`0 0 ${width} ${height}`}
          >
            {dotted && (
              <path
                d={dotted}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="5"
                strokeDasharray="1.5 14"
                strokeLinecap="round"
                opacity="0.4"
              />
            )}
            {solid && (
              <path d={solid} fill="none" stroke="var(--color-crayon)" strokeWidth="12" strokeLinecap="round" />
            )}
          </svg>
        )}
        {steps.map((step, index) => {
          const side = index % 2 === 0 ? 'left' : 'right';
          const nodeX = side === 'left' ? layout.left : layout.right;
          const cardLeft = side === 'left' ? nodeX + NODE_HALF + CARD_GAP : nodeX - NODE_HALF - CARD_GAP - layout.cardW;
          return (
            <div key={step.id} className="absolute inset-x-0" style={{ top: index * ROW, height: ROW }} data-step>
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={() => onSelect(step.id)}
                className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: nodeX }}
              >
                <Node status={step.status} index={index} />
              </button>
              {step.status === 'next' && (
                <span
                  className="pointer-events-none absolute z-10 text-[13px] font-medium whitespace-nowrap text-crayon-text"
                  style={
                    side === 'left'
                      ? { left: 0, top: 'calc(50% + 2.6rem)' }
                      : { right: 4, top: 'calc(50% + 2.6rem)' }
                  }
                >
                  ↑ you are here
                </span>
              )}
              <button
                type="button"
                aria-pressed={step.id === selectedId}
                aria-label={`${step.title}. ${metaLine(step)}`}
                onClick={() => onSelect(step.id)}
                className="absolute top-1/2 z-10 -translate-y-1/2"
                style={{ left: cardLeft, width: layout.cardW }}
              >
                <StepCard step={step} selected={step.id === selectedId} />
              </button>
            </div>
          );
        })}
      </div>
      )}
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
    step.status === 'done' ? 'Watch again' : `Resume${step.timeLeft ? ` · ${step.timeLeft} left` : ''}`;

  return (
    <aside className={cardClass(false, false, 'min-w-0 overflow-hidden p-4 xl:sticky xl:top-4')}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
          Step {index + 1} · {statusLabel[step.status]}
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
        <TopicArt topicId={step.artId} className="aspect-[16/9]" />
        {step.duration && (
          <span className="absolute right-2 bottom-2 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
            {step.duration}
          </span>
        )}
      </div>
      <h2 className="mt-3 font-serif text-[1.7rem] leading-tight text-ink">{step.title}</h2>
      <p className="mt-1 text-[15px] leading-relaxed text-muted">{step.detail}</p>
      <div className="mt-3">
        <CrayonProgress
          value={step.progress}
          label={`${step.title} progress`}
          tone={step.status === 'done' ? 'done' : 'crayon'}
          showValue
        />
      </div>
      {step.status === 'locked' || (!step.href && !step.onOpen) ? (
        <button type="button" disabled className={buttonClass('secondary', 'mt-4 w-full')}>
          {step.hint ?? 'Locked'}
        </button>
      ) : step.href ? (
        <Link to={step.href} className={buttonClass(step.status === 'done' ? 'secondary' : 'primary', 'mt-4 w-full')}>
          {step.status !== 'done' && <IconPlay className="h-4 w-4" />}
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
                className={cx(
                  'flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5',
                  chapter.state === 'resume' && 'bg-[#fff6d4]',
                )}
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
