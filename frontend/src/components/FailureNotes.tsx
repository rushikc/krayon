import type { Failure } from '../study/failures.ts';
import { buttonClass } from './ui/Button.tsx';
import { cx } from './ui/cx.ts';

const short = (text: string) => (text.length > 220 ? `${text.slice(0, 217)}…` : text);

/** Small inline notes for failed topics/segments, each with its own Retry button. */
export function FailureNotes({ items, className }: { items: Failure[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={cx('space-y-2', className)} aria-label="Generation problems">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 rounded-xl border-2 border-ink/15 bg-paper px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium text-ink">{item.title}</p>
            <p className="mt-0.5 text-[13px] break-words text-crayon-text" title={item.code ?? undefined}>
              {short(item.message)}
            </p>
          </div>
          {item.onRetry && (
            <button
              type="button"
              disabled={item.busy}
              onClick={item.onRetry}
              className={buttonClass('secondary', 'shrink-0 !px-3 !py-1 !text-[13px]')}
            >
              {item.retrying ? 'Retrying…' : 'Retry'}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
