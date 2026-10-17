import { useEffect, useId, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { FPS } from '../remotion/catalog.ts';
import type { Chapter } from '../study/chapters.ts';
import { chapterIndexAtFrame } from '../study/chapters.ts';
import type { Stamp, Stroke } from '../study/localStudy.tsx';
import { formatClock } from '../study/time.ts';
import { cx } from './ui/cx.ts';
import {
  IconArrow,
  IconAsk,
  IconFullscreen,
  IconHighlight,
  IconMuted,
  IconNote,
  IconPause,
  IconPin,
  IconPlay,
  IconQuiz,
  IconVolume,
} from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';

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
  muted: boolean;
  onMute: () => void;
  onFullscreen: () => void;
  pins?: Stamp[];
  watchedIds?: string[];
  artId?: string;
  fill?: boolean;
};

const tools: { id: LessonTool; label: string; icon: typeof IconAsk }[] = [
  { id: 'ask', label: 'Ask a doubt', icon: IconAsk },
  { id: 'note', label: 'Note', icon: IconNote },
  { id: 'quiz', label: 'Quiz', icon: IconQuiz },
];

const clockToFrame = (clock: string) => {
  const [minutes, seconds] = clock.split(':').map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return (minutes * 60 + seconds) * FPS;
};

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
  muted,
  onMute,
  onFullscreen,
  pins = [],
  watchedIds = [],
  artId,
  fill = false,
}: LessonFrameProps) {
  const tipBase = useId();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const openId = focusId ?? hoverId;
  const activeIndex = chapterIndexAtFrame(frame, chapters);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setHoverId(null);
      setFocusId(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [openId]);

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

  const tipProps = (id: string) => ({
    onMouseEnter: () => setHoverId(id),
    onMouseLeave: () => setHoverId((current) => (current === id ? null : current)),
    onFocus: () => setFocusId(id),
    onBlur: () => setFocusId((current) => (current === id ? null : current)),
    'aria-describedby': openId === id ? `${tipBase}-${id}` : undefined,
  });

  return (
    <div
      className={cx(
        'relative overflow-hidden rounded-[18px] border-[2.5px] border-ink bg-chalk shadow-[5px_5px_0_var(--color-ink)]',
        fill ? 'aspect-video w-[min(100cqw,calc(100cqh*1.778))]' : 'w-full',
      )}
    >
      {fill ? <div className="absolute inset-0">{children}</div> : children}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex justify-center">
        <div className="pointer-events-auto flex h-8 max-w-full items-center gap-0.5 overflow-x-auto rounded-full border-2 border-ink bg-paper px-1 shadow-[2px_2px_0_var(--color-ink)]">
          <ToolButton label="Ask a doubt" pressed={activeTool === 'ask'} onClick={() => onTool('ask')}>
            <IconAsk className="h-3.5 w-3.5" />
            Ask
          </ToolButton>
          <ToolButton label="Explain longer" onClick={onExplain} disabled={explaining}>
            <IconArrow className="h-3.5 w-3.5" />
            {explaining ? 'Redrawing…' : 'Explain longer'}
          </ToolButton>
          <ToolButton label="Highlight" pressed={drawing} accent={drawing} onClick={() => onTool('highlight')}>
            <IconHighlight className="h-3.5 w-3.5" />
            Highlight
          </ToolButton>
          <ToolButton label="Pin" onClick={onPin}>
            <IconPin className="h-3.5 w-3.5" />
            Pin
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
                <tool.icon className="h-3.5 w-3.5" />
                {tool.label}
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
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pt-10 pb-3">
        <button
          type="button"
          aria-label={playing ? 'Pause lesson' : 'Play lesson'}
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink bg-crayon text-white"
        >
          {playing ? <IconPause className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
        </button>
        <span className="shrink-0 text-[13px] font-medium text-paper tabular-nums">
          {formatClock(frame)} / {formatClock(duration)}
        </span>
        <div
          className="relative flex h-6 min-w-0 flex-1 items-center gap-1"
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
          {chapters.map((chapter, index) => {
            const played = Math.max(0, Math.min(chapter.duration, frame - chapter.start));
            const ratio = chapter.duration === 0 ? 0 : played / chapter.duration;
            const watched = watchedIds.includes(chapter.id);
            const current = index === activeIndex;
            const number = String(index + 1).padStart(2, '0');
            const summary = `${number} · ${formatClock(chapter.start)} · ${chapter.title}`;
            return (
              <div key={chapter.id} className="relative h-2.5 min-w-2" style={{ flexGrow: chapter.duration }}>
                <button
                  type="button"
                  aria-label={`Seek to ${chapter.title}`}
                  className={cx(
                    'relative h-full w-full overflow-hidden rounded-full',
                    watched ? 'bg-[#4a3428]' : current ? 'bg-crayon/45' : 'bg-white/25',
                  )}
                  {...tipProps(chapter.id)}
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratioClick = (event.clientX - rect.left) / rect.width;
                    onSeek(chapter.start + Math.round(ratioClick * Math.max(0, chapter.duration - 1)));
                  }}
                >
                  <span
                    className={cx('absolute inset-y-0 left-0 rounded-full', watched ? 'bg-[#2a1c14]' : 'bg-crayon')}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </button>
                {openId === chapter.id && (
                  <MomentTip id={`${tipBase}-${chapter.id}`} artId={artId} text={summary} align={index === 0 ? 'start' : 'center'} />
                )}
                {index > 0 && (
                  <button
                    type="button"
                    aria-label={`Key moment ${summary}`}
                    className="absolute top-1/2 left-0 z-10 h-6 w-3 -translate-x-1/2 -translate-y-1/2"
                    {...tipProps(`tick-${chapter.id}`)}
                    onClick={() => onSeek(chapter.start)}
                  >
                    <span className="mx-auto block h-3.5 w-[2px] rounded-full bg-paper" />
                    {openId === `tick-${chapter.id}` && (
                      <MomentTip id={`${tipBase}-tick-${chapter.id}`} artId={artId} text={summary} align="center" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
          {pins.map((pin) => {
            const at = clockToFrame(pin.timestamp);
            if (at === null || duration <= 0) return null;
            const id = `pin-${pin.id}`;
            const chapterAt = chapters[chapterIndexAtFrame(at, chapters)];
            const number = String(Math.max(1, chapters.indexOf(chapterAt) + 1)).padStart(2, '0');
            const summary = `${number} · ${pin.timestamp} · ${pin.text}`;
            return (
              <button
                key={id}
                type="button"
                aria-label={`Pin ${summary}`}
                className="absolute top-1/2 z-10 h-6 w-3 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(Math.min(at, duration - 1) / duration) * 100}%` }}
                {...tipProps(id)}
                onClick={() => onSeek(Math.min(duration - 1, at))}
              >
                <span className="mx-auto block h-3.5 w-[3px] rounded-full bg-yellow" />
                {openId === id && (
                  <MomentTip id={`${tipBase}-${id}`} artId={artId} text={summary} align="center" />
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label={muted ? 'Unmute lesson' : 'Mute lesson'}
          aria-pressed={muted}
          onClick={onMute}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-paper"
        >
          {muted ? <IconMuted className="h-5 w-5" /> : <IconVolume className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Full screen"
          onClick={onFullscreen}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-paper"
        >
          <IconFullscreen className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function MomentTip({
  id,
  text,
  artId,
  align,
}: {
  id: string;
  text: string;
  artId?: string;
  align: 'start' | 'center';
}) {
  return (
    <div
      id={id}
      role="tooltip"
      className={cx(
        'pointer-events-none absolute bottom-[calc(100%+10px)] z-30 flex max-w-[280px] items-center gap-1.5 rounded-md border-[1.5px] border-ink bg-paper px-1.5 py-1 shadow-[2px_2px_0_var(--color-ink)]',
        align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2',
      )}
    >
      {artId && <TopicArt topicId={artId} className="h-6 w-9 shrink-0 overflow-hidden rounded-sm bg-chalk" />}
      <p className="min-w-0 truncate text-[12px] leading-tight text-ink">{text}</p>
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
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-ink disabled:opacity-40',
        accent ? 'bg-yellow' : 'hover:bg-stone',
      )}
    >
      {children}
    </button>
  );
}
