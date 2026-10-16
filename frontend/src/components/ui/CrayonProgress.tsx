import { cx } from './cx.ts';

type CrayonProgressProps = {
  value: number;
  label: string;
  tone?: 'crayon' | 'done' | 'yellow';
  showValue?: boolean;
};

const fills = {
  crayon: 'bg-crayon',
  done: 'bg-done-fill',
  yellow: 'bg-yellow',
};

export function CrayonProgress({
  value,
  label,
  tone = 'crayon',
  showValue = false,
}: CrayonProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const caption = pct === 0 ? 'Not started' : `${pct}%`;

  return (
    <div className="grid gap-1.5">
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={caption}
        aria-label={label}
        className="relative h-3 overflow-hidden rounded-full bg-line"
      >
        <div className={cx('relative h-full rounded-full', fills[tone])} style={{ width: `${pct}%` }}>
          {pct > 12 && (
            <span className="absolute top-[3px] right-1.5 h-[5px] w-5 rounded-full bg-white/60" />
          )}
        </div>
      </div>
      {showValue && <span className="text-[13px] font-medium text-muted">{caption}</span>}
    </div>
  );
}
