import type { Chapter } from '../study/chapters.ts';
import { formatClock } from '../study/time.ts';
import { IconCheck, IconPlay } from './ui/icons.tsx';
import { cx } from './ui/cx.ts';

type ChapterStripProps = {
  chapters: Chapter[];
  activeIndex: number;
  watchedIds: string[];
  statuses?: Record<string, string | null>;
  onSeek: (frame: number) => void;
};

export function ChapterStrip({ chapters, activeIndex, watchedIds, statuses, onSeek }: ChapterStripProps) {
  return (
    <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {chapters.map((chapter, index) => {
        const watched = watchedIds.includes(chapter.id);
        const active = index === activeIndex;
        const number = String(index + 1).padStart(2, '0');
        return (
          <li key={chapter.id} className="shrink-0">
            <button
              type="button"
              onClick={() => onSeek(chapter.start)}
              aria-current={active ? 'true' : undefined}
              className={cx(
                'inline-flex max-w-[16rem] items-center gap-2 rounded-xl border-2 border-ink px-2.5 py-1.5 text-left text-[13px]',
                active ? 'bg-[#fff6d4] shadow-[2px_2px_0_var(--color-ink)]' : 'bg-paper',
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {number} · {chapter.title}
                </span>
                {statuses?.[chapter.id] && statuses[chapter.id] !== 'ready' && (
                  <span className="block truncate text-[12px] text-muted">{statuses[chapter.id]}</span>
                )}
              </span>
              {watched && <IconCheck className="h-3.5 w-3.5 shrink-0 text-done" />}
              {active && !watched && <IconPlay className="h-3.5 w-3.5 shrink-0 text-ink" />}
              <span className="shrink-0 text-muted tabular-nums">{formatClock(chapter.duration)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
