import type { SegmentState } from '@krayon/shared';
import { Button } from './ui/Button.tsx';
import { CrayonProgress } from './ui/CrayonProgress.tsx';
import { IconCheck } from './ui/icons.tsx';

/** The steps lessonRender.regenerateSegment really runs, in order. */
const REGEN_STEPS = [
  'Rewriting the narration',
  'Recording narration',
  'Designing the visual',
  'Checking the scene',
  'Rendering keyframes',
  'Reviewing the picture',
] as const;

/**
 * Which step the segment is on, from its stored status (kept fresh by segment.* events).
 * Returns REGEN_STEPS.length once the segment is ready again. `started` is false until the
 * backend has reported work, so a still-"ready" segment right after the click reads as step 0.
 */
const regenStage = (segment: SegmentState | undefined, started: boolean): number => {
  if (!segment) return 0;
  switch (segment.status) {
    case 'ready':
      return started ? REGEN_STEPS.length : 0;
    case 'reviewing':
      return 5;
    case 'rendering':
      return 4;
    case 'checking':
      return 3;
    case 'drafting':
      if (segment.statusDetail === 'Designing the visual') return 2;
      if (segment.statusDetail === 'Recording narration' || segment.voice === 'voicing') return 1;
      if (segment.statusDetail === 'Rewriting the narration') return 0;
      return started && segment.voice === 'voiced' ? 2 : 0;
    default:
      return 0;
  }
};

const reviewRound = (detail: string | null | undefined) => {
  const match = /round (\d+) of (\d+)/i.exec(detail ?? '');
  return match ? { n: Number(match[1]), of: Number(match[2]) } : null;
};

type RegenProgressProps = {
  segment: SegmentState | undefined;
  started: boolean;
  /** Last review round reported by segment.render / segment.review events. */
  round: number | null;
  /** Review fixes accepted so far (segment.fixed). */
  fixes: number;
  lessonDetail: string | null;
  error: string | null;
  /** Shown when the run failed, or the lesson finished without us hearing the segment event. */
  onClose?: () => void;
};

/** Centered card over the player while one segment is regenerated. Covers the player and its controls. */
export function RegenProgress({ segment, started, round, fixes, lessonDetail, error, onClose }: RegenProgressProps) {
  const stage = regenStage(segment, started);
  const total = REGEN_STEPS.length;
  const review = reviewRound(segment?.statusDetail);
  const roundNow = review?.n ?? round;
  const statusText = error ?? segment?.statusDetail ?? lessonDetail ?? 'Starting…';
  const number = segment ? segment.index + 1 : null;

  const labelFor = (index: number) => {
    const base = REGEN_STEPS[index];
    if (index === 4 && roundNow && roundNow > 1) return `${base} · round ${roundNow}${fixes > 0 ? ', with fixes' : ''}`;
    if (index === 5 && review) return `${base} · round ${review.n} of ${review.of}`;
    if (index === 5 && roundNow) return `${base} · round ${roundNow}`;
    return base;
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-ink/45 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regen-progress-title"
      data-regen-card
    >
      <div className="w-full max-w-md rounded-[20px] border-[2.5px] border-ink bg-paper p-5 shadow-[4px_4px_0_var(--color-ink)]">
        <div className="flex items-start gap-3">
          {error ? (
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-crayon text-[15px] font-semibold text-white" aria-hidden="true">
              !
            </span>
          ) : (
            <span
              className="mt-1 block h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-ink/15 border-t-crayon motion-reduce:animate-none"
              aria-hidden="true"
            />
          )}
          <div className="min-w-0">
            <h2 id="regen-progress-title" className="font-serif text-[24px] leading-tight text-ink">
              {error ? 'Could not regenerate' : 'Regenerating'} {number !== null ? `segment ${number}` : 'segment'}
            </h2>
            {segment && <p className="truncate text-[14px] text-muted">{segment.title}</p>}
          </div>
        </div>

        <p className={`mt-3 text-[15px] ${error ? 'text-crayon-text' : 'text-ink'}`} role="status" aria-live="polite">
          {statusText}
        </p>
        {error && <p className="mt-1 text-[14px] text-muted">The previous version of this segment is kept.</p>}

        <div className="mt-4">
          <CrayonProgress value={(Math.min(stage, total) / total) * 100} label="Regeneration progress" tone={error ? 'yellow' : 'crayon'} />
        </div>

        <ol className="mt-4 grid gap-1.5">
          {REGEN_STEPS.map((_, index) => {
            const state = index < stage ? 'done' : index === stage && !error ? 'current' : index === stage ? 'stopped' : 'upcoming';
            return (
              <li key={index} className="flex min-w-0 items-center gap-2.5 text-[14px]">
                {state === 'done' ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-done-fill text-ink" aria-hidden="true">
                    <IconCheck className="h-3 w-3" />
                  </span>
                ) : state === 'current' ? (
                  <span
                    className="block h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ink/20 border-t-crayon motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : state === 'stopped' ? (
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-ink bg-crayon" aria-hidden="true" />
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border-2 border-line bg-paper" aria-hidden="true" />
                )}
                <span className={`min-w-0 truncate ${state === 'upcoming' ? 'text-muted' : 'text-ink'} ${state === 'current' ? 'font-medium' : ''}`}>
                  {labelFor(index)}
                </span>
                <span className="sr-only">
                  {state === 'done' ? 'done' : state === 'current' ? 'in progress' : state === 'stopped' ? 'failed' : 'not started'}
                </span>
              </li>
            );
          })}
        </ol>

        {onClose && (
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
