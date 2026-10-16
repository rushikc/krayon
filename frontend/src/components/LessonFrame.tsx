import type { PointerEvent, ReactNode } from 'react';
import { FPS } from '../remotion/catalog.ts';
import type { Chapter } from '../study/chapters.ts';
import type { Stroke } from '../study/localStudy.tsx';
import { formatClock } from '../study/time.ts';
import { cx } from './ui/cx.ts';
import {
  IconArrow,
  IconAsk,
  IconHighlight,
  IconNote,
  IconPause,
  IconPin,
  IconPlay,
  IconQuiz,
} from './ui/icons.tsx';

export type LessonTool = 'ask' | 'highlight' | 'note' | 'quiz';

type LessonFrameProps = {
  children: ReactNode;
  chapters: Chapter[];
  frame: number;
  duration: number;
  playing: boolean;
  activeTool: LessonTool | null;
  drawing: boolean;
  strokes: Stroke[];
  onToggle: () => void;
  onSeek: (frame: number) => void;
  onTool: (tool: LessonTool) => void;
  onExplain: () => void;
  onPin: () => void;
  explaining: boolean;
  onStrokes: (strokes: Stroke[]) => void;
};

const tools: { id: LessonTool; label: string; icon: typeof IconAsk }[] = [
  { id: 'ask', label: 'Ask a doubt', icon: IconAsk },
  { id: 'note', label: 'Note', icon: IconNote },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz },
];

export function LessonFrame({
  children,
  chapters,
  frame,
  duration,
  playing,
  activeTool,
  drawing,
  strokes,
  onToggle,
  onSeek,
  onTool,
  onExplain,
  onPin,
  explaining,
  onStrokes,
}: LessonFrameProps) {
  const draw = (event: PointerEvent<SVGSVGElement>, next: Stroke) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const points = [...next.points, point];
    const updated = [...strokes.slice(0, -1), { points }];
    onStrokes(updated);
  };

  return (
    <div className="relative overflow-hidden rounded-[18px] border-[2.5px] border-ink bg-chalk shadow-[5px_5px_0_var(--color-ink)]">
      {children}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
        <div className="pointer-events-auto flex max-w-full -rotate-1 flex-wrap items-center gap-1 rounded-full border-[2.5px] border-ink bg-paper px-2 py-1.5 shadow-[3px_3px_0_var(--color-ink)]">
          <ToolButton
            label="Ask a doubt"
            pressed={activeTool === 'ask'}
            onClick={() => onTool('ask')}
          >
            <IconAsk className="h-4 w-4" />
            <span className="hidden sm:inline">Ask a doubt</span>
          </ToolButton>
          <ToolButton label="Explain longer" onClick={onExplain} disabled={explaining}>
            <IconArrow className="h-4 w-4" />
            <span className="hidden sm:inline">{explaining ? 'Redrawing…' : 'Explain longer'}</span>
          </ToolButton>
          <ToolButton
            label="Highlight"
            pressed={drawing}
            accent={drawing}
            onClick={() => onTool('highlight')}
          >
            <IconHighlight className="h-4 w-4" />
            <span className="hidden sm:inline">Highlight</span>
          </ToolButton>
          <ToolButton label="Pin" onClick={onPin}>
            <IconPin className="h-4 w-4" />
            <span className="hidden md:inline">Pin</span>
          </ToolButton>
          {tools
            .filter((tool) => tool.id !== 'ask')
            .map((tool) => (
              <ToolButton
                key={tool.id}
                label={tool.label}
                pressed={activeTool === tool.id}
                onClick={() => onTool(tool.id)}
              >
                <tool.icon className="h-4 w-4" />
                <span className="hidden md:inline">{tool.label}</span>
              </ToolButton>
            ))}
        </div>
      </div>
      <svg
        className={cx('absolute inset-0 z-10 h-full w-full', drawing ? 'cursor-crosshair' : 'pointer-events-none')}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden={drawing ? undefined : true}
        role={drawing ? 'img' : undefined}
        aria-label={drawing ? 'Draw a highlight on the lesson' : undefined}
        onPointerDown={(event) => {
          if (!drawing) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          onStrokes([
            ...strokes,
            {
              points: [
                {
                  x: (event.clientX - rect.left) / rect.width,
                  y: (event.clientY - rect.top) / rect.height,
                },
              ],
            },
          ]);
        }}
        onPointerMove={(event) => {
          if (!drawing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const current = strokes[strokes.length - 1];
          if (!current) return;
          draw(event, current);
        }}
      >
        {strokes.map((stroke, index) => (
          <polyline
            key={index}
            fill="none"
            stroke="#e4572e"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={stroke.points.map((point) => `${point.x * 100},${point.y * 100}`).join(' ')}
          />
        ))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/75 to-transparent px-3 pt-8 pb-3">
        <button
          type="button"
          aria-label={playing ? 'Pause lesson' : 'Play lesson'}
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white"
        >
          {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
        </button>
        <span className="shrink-0 text-[13px] font-medium text-paper tabular-nums">
          {formatClock(frame)} / {formatClock(duration)}
        </span>
        <div
          className="flex h-3 min-w-0 flex-1 gap-1"
          role="slider"
          tabIndex={0}
          aria-label="Lesson position"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration - 1)}
          aria-valuenow={frame}
          aria-valuetext={`${formatClock(frame)} of ${formatClock(duration)}`}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') onSeek(Math.min(duration - 1, frame + FPS * 2));
            if (event.key === 'ArrowLeft') onSeek(Math.max(0, frame - FPS * 2));
          }}
        >
          {chapters.map((chapter) => {
            const played = Math.max(0, Math.min(chapter.duration, frame - chapter.start));
            const ratio = chapter.duration === 0 ? 0 : played / chapter.duration;
            return (
              <button
                key={chapter.id}
                type="button"
                aria-label={`Seek to ${chapter.title}`}
                className="relative h-full min-w-2 flex-1 overflow-hidden rounded-full bg-white/25"
                style={{ flexGrow: chapter.duration }}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const ratioClick = (event.clientX - rect.left) / rect.width;
                  onSeek(chapter.start + Math.round(ratioClick * Math.max(0, chapter.duration - 1)));
                }}
              >
                <span className="absolute inset-y-0 left-0 rounded-full bg-crayon" style={{ width: `${ratio * 100}%` }}>
                  {ratio > 0.2 && <span className="absolute top-[2px] right-1 h-[3px] w-3 rounded-full bg-white/70" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  children,
  pressed,
  accent,
  disabled,
  onClick,
}: {
  label: string;
  children: ReactNode;
  pressed?: boolean;
  accent?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[14px] font-medium text-ink disabled:opacity-40',
        accent ? 'bg-yellow' : 'hover:bg-stone',
      )}
    >
      {children}
    </button>
  );
}
