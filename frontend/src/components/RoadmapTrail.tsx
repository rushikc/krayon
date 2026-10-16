import { Link } from 'react-router-dom';
import type { TrailStatus } from './roadmapTypes.ts';
import { buttonClass } from './ui/Button.tsx';
import { cardClass } from './ui/Card.tsx';
import { CrayonProgress } from './ui/CrayonProgress.tsx';
import { IconCheck } from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';
import { cx } from './ui/cx.ts';

export type { TrailStatus };

export type TrailStep = {
  id: string;
  title: string;
  detail: string;
  status: TrailStatus;
  artId: string;
  duration: string;
  progress: number;
  action: string;
  hint?: string;
  href?: string;
  onOpen?: () => void;
  disabled?: boolean;
};

const statusLabel: Record<TrailStatus, string> = {
  done: 'Done',
  next: 'Up next',
  locked: 'Locked',
  open: 'Ready',
};

function Node({ status, index }: { status: TrailStatus; index: number }) {
  if (status === 'done') {
    return (
      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white shadow-[2px_2px_0_var(--color-ink)]">
        <IconCheck className="h-5 w-5" />
      </span>
    );
  }
  if (status === 'next') {
    return (
      <span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] border-ink bg-yellow text-[15px] font-semibold text-ink shadow-[0_0_0_6px_rgba(242,193,78,0.45)]">
        {index + 1}
      </span>
    );
  }
  if (status === 'locked') {
    return (
      <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-ink/40 bg-paper text-[15px] text-muted">
        {index + 1}
      </span>
    );
  }
  return (
    <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-ink bg-paper text-[15px] font-semibold">
      {index + 1}
    </span>
  );
}

function Action({ step }: { step: TrailStep }) {
  if (step.status === 'locked' || step.disabled) {
    return (
      <button type="button" disabled className={buttonClass('secondary', 'w-full sm:w-auto')}>
        {step.hint ?? 'Locked'}
      </button>
    );
  }
  const look = buttonClass(step.status === 'next' ? 'primary' : 'secondary', 'w-full sm:w-auto');
  if (step.href) {
    return (
      <Link to={step.href} className={look}>
        {step.action}
      </Link>
    );
  }
  return (
    <button type="button" onClick={step.onOpen} className={look}>
      {step.action}
    </button>
  );
}

export function RoadmapTrail({ steps }: { steps: TrailStep[] }) {
  return (
    <ol className="grid gap-5">
      {steps.map((step, index) => {
        const next = steps[index + 1];
        const filled = !!next && step.status !== 'locked' && next.status !== 'locked';
        const featured = step.status === 'next';
        return (
          <li key={step.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 sm:grid-cols-[52px_minmax(0,1fr)] sm:gap-4">
            <div className="relative flex justify-center">
              {next && (
                <svg
                  aria-hidden="true"
                  className="absolute top-12 bottom-[-1.25rem] left-1/2 w-8 -translate-x-1/2"
                  viewBox="0 0 32 100"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M16 0C28 22 4 38 16 58C26 74 8 88 16 100"
                    fill="none"
                    stroke={filled ? 'var(--color-crayon)' : 'var(--color-ink)'}
                    strokeWidth={filled ? 7 : 4}
                    strokeDasharray={filled ? undefined : '1.5 8'}
                    strokeLinecap="round"
                    opacity={filled ? 1 : 0.45}
                  />
                </svg>
              )}
              <Node status={step.status} index={index} />
            </div>
            <article
              className={cardClass(
                featured,
                step.status === 'locked',
                cx('p-3', step.status === 'locked' && 'opacity-70'),
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative sm:w-40 sm:shrink-0">
                  <TopicArt topicId={step.artId} className="aspect-[16/10]" />
                  {step.duration && (
                    <span className="absolute right-2 bottom-2 rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-medium text-paper">
                      {step.duration}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cx(
                      'text-[12px] font-semibold tracking-[0.14em] uppercase',
                      step.status === 'done' && 'text-done',
                      step.status === 'next' && 'text-crayon-text',
                      (step.status === 'locked' || step.status === 'open') && 'text-muted',
                    )}
                  >
                    {statusLabel[step.status]}
                  </p>
                  <h2 className="mt-1 font-serif text-[1.45rem] leading-tight text-ink">{step.title}</h2>
                  <p className="mt-1 text-[15px] text-muted">{step.detail}</p>
                  <div className="mt-3 max-w-xs">
                    <CrayonProgress
                      value={step.progress}
                      label={`${step.title} progress`}
                      tone={step.status === 'done' ? 'done' : 'crayon'}
                      showValue
                    />
                  </div>
                </div>
                <div className="sm:shrink-0">
                  <Action step={step} />
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
