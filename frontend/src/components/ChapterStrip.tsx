import type { Chapter } from '../study/chapters.ts';
import { chapterProgress } from '../study/chapters.ts';
import { formatClock } from '../study/time.ts';
import { cardClass } from './ui/Card.tsx';
import { CrayonProgress } from './ui/CrayonProgress.tsx';
import { IconCheck } from './ui/icons.tsx';
import { cx } from './ui/cx.ts';

type ChapterStripProps = {
  chapters: Chapter[];
  activeIndex: number;
  watchedIds: string[];
  frame: number;
  onSeek: (frame: number) => void;
};

export function ChapterStrip({ chapters, activeIndex, watchedIds, frame, onSeek }: ChapterStripProps) {
  return (
    <ol className="mt-4 flex gap-3 overflow-x-auto pb-1">
      {chapters.map((chapter, index) => {
        const watched = watchedIds.includes(chapter.id);
        const active = index === activeIndex;
        const label = `${String(index + 1).padStart(2, '0')} · ${formatClock(chapter.duration)}`;
        return (
          <li key={chapter.id} className="min-w-[180px] flex-1">
            <button
              type="button"
              onClick={() => onSeek(chapter.start)}
              className={cardClass(active, false, cx('h-full w-full p-3 text-left', active && 'bg-[#fff6d4]'))}
            >
              <span className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">{label}</span>
              {watched && (
                <span className="mt-1 flex items-center gap-1 text-[13px] font-medium text-done">
                  <IconCheck className="h-4 w-4" />
                  watched
                </span>
              )}
              {active && !watched && <span className="mt-1 block text-[13px] font-medium text-ink">playing</span>}
              <span className="mt-1 block text-[15px] leading-snug text-ink">{chapter.title}</span>
              <div className="mt-3">
                <CrayonProgress
                  value={chapterProgress(frame, chapter, watched)}
                  label={`${chapter.title} progress`}
                  tone={watched ? 'done' : active ? 'yellow' : 'crayon'}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
