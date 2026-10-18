import { useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { FPS } from '../remotion/catalog.ts';
import { strokesOnSegment, type Stamp, type Stroke } from '../study/localStudy.tsx';
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
  IconVolume,
} from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';

export type LessonTool = 'ask' | 'highlight' | 'note' | 'quiz';

type LessonFrameProps = {
  children: ReactNode;
  frame: number;
  duration: number;
  playing: boolean;
  activeTool: LessonTool | null;
  drawing: boolean;
  strokes: Stroke[];
  /** Segment under the playhead. New strokes are stamped with this id. */
  segmentId: string;
  onToggle: () => void;
  onSeek: (frame: number) => void;
  onTool: (tool: LessonTool) => void;
  onExplain: () => void;
  /** Top-bar label for onExplain. The curated player keeps "Explain longer". */
  explainLabel?: string;
  onPin: () => void;
  explaining: boolean;
  onStrokes: (strokes: Stroke[]) => void;
  muted: boolean;
  onMute: () => void;
  /** 0 to 1. Omit on lessons that have no narration track. */
  volume?: number;
  onVolume?: (volume: number) => void;
  pins?: Stamp[];
  heading?: ReactNode;
  onChat?: () => void;
  artId?: string;
  fill?: boolean;
};

const tools: { id: LessonTool; label: string; icon: typeof IconAsk }[] = [
  { id: 'ask', label: 'Ask a doubt', icon: IconAsk },
  { id: 'note', label: 'Note', icon: IconNote },
];

const clockToFrame = (clock: string) => {
  const [minutes, seconds] = clock.split(':').map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return (minutes * 60 + seconds) * FPS;
};

export function LessonFrame({
  children,
  frame,
  duration,
  playing,
  activeTool,
  drawing,
  strokes,
  segmentId,
  onToggle,
  onSeek,
  onTool,
  onExplain,
  explainLabel,
  onPin,
  explaining,
  onStrokes,
  muted,
  onMute,
  volume,
  onVolume,
  pins = [],
  artId,
  fill = false,
  heading,
  onChat,
}: LessonFrameProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tipBase = useId();
  const gestureTimer = useRef<number | null>(null);
  const strokeAt = useRef<number | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<'play' | 'pause' | null>(null);
  const openId = focusId ?? hoverId;
  const played = duration > 1 ? Math.min(1, frame / (duration - 1)) : 0;

  const showGesture = (next: 'play' | 'pause') => {
    setGesture(next);
    if (gestureTimer.current !== null) window.clearTimeout(gestureTimer.current);
    gestureTimer.current = window.setTimeout(() => setGesture(null), 600);
  };

  useEffect(
    () => () => {
      if (gestureTimer.current !== null) window.clearTimeout(gestureTimer.current);
    },
    [],
  );

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

  useEffect(() => {
    const typing = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const tag = target.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.getAttribute('contenteditable') === 'true';
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (typing(event.target) || document.querySelector('[role="dialog"]')) return;
      const step = FPS * 5;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onSeek(Math.min(Math.max(0, duration - 1), frame + step));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onSeek(Math.max(0, frame - step));
      } else if ((event.key === ' ' || event.key === 'Spacebar') && !(event.target instanceof Element && (event.target.tagName === 'BUTTON' || event.target.tagName === 'A'))) {
        if (event.repeat) return;
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration, frame, onSeek, onToggle]);

  const pointOf = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  };

  const draw = (event: PointerEvent<SVGSVGElement>) => {
    const index = strokeAt.current;
    if (index === null) return;
    const current = strokes[index];
    if (!current) return;
    const point = pointOf(event);
    onStrokes(strokes.map((stroke, i) => (i === index ? { ...stroke, points: [...stroke.points, point] } : stroke)));
  };

  const tipProps = (id: string) => ({
    onMouseEnter: () => setHoverId(id),
    onMouseLeave: () => setHoverId((current) => (current === id ? null : current)),
    onFocus: () => setFocusId(id),
    onBlur: () => setFocusId((current) => (current === id ? null : current)),
    'aria-describedby': openId === id ? `${tipBase}-${id}` : undefined,
  });

  const toggleFullscreen = () => {
    const node = frameRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      void document.exitFullscreen();
      return;
    }
    void node.requestFullscreen();
  };

  return (
    <div
      ref={frameRef}
      className={cx(
        'relative overflow-hidden bg-chalk',
        fill ? 'h-full w-full' : 'w-full rounded-[18px] border-[2.5px] border-ink shadow-[5px_5px_0_var(--color-ink)]',
      )}
    >
      {fill ? (
        <div className="absolute inset-x-0 top-14 bottom-0 min-[1200px]:inset-0">{children}</div>
      ) : (
        children
      )}
      {!drawing && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={playing ? 'Pause lesson' : 'Play lesson'}
          className="absolute inset-x-0 top-14 bottom-0 z-[5] cursor-pointer min-[1200px]:inset-0"
          onClick={() => {
            showGesture(playing ? 'pause' : 'play');
            onToggle();
          }}
        />
      )}
      {gesture && (
        <div
          className="pointer-events-none absolute inset-x-0 top-14 bottom-0 z-[15] flex items-center justify-center min-[1200px]:inset-0"
          aria-hidden="true"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-paper/80 bg-ink/75 text-paper">
            {gesture === 'pause' ? <IconPause className="h-7 w-7" /> : <IconPlay className="h-7 w-7" />}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 items-center gap-2 bg-paper px-2 min-[1200px]:inset-x-3 min-[1200px]:top-3 min-[1200px]:h-auto min-[1200px]:bg-transparent min-[1200px]:px-0">
        {heading ? (
          <div className="pointer-events-auto max-w-[min(200px,42%)] shrink-0 min-[1200px]:max-w-[min(340px,34%)]">
            {heading}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 justify-center">
        <div className="pointer-events-auto flex h-8 min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-full border-2 border-ink bg-paper px-1 shadow-[2px_2px_0_var(--color-ink)]">
          <ToolButton label="Ask a doubt" pressed={activeTool === 'ask'} onClick={() => onTool('ask')}>
            <IconAsk className="h-3.5 w-3.5" />
            Ask
          </ToolButton>
          <ToolButton label={explainLabel ?? 'Explain longer'} onClick={onExplain} disabled={explaining}>
            <IconArrow className="h-3.5 w-3.5" />
            {explaining ? (explainLabel ? 'Regenerating…' : 'Redrawing…') : (explainLabel ?? 'Explain longer')}
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
      </div>
      <svg
        className={cx(
          'absolute inset-x-0 top-14 bottom-0 z-10 h-auto w-full min-[1200px]:inset-0 min-[1200px]:h-full',
          drawing ? 'cursor-crosshair' : 'pointer-events-none',
        )}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden={drawing ? undefined : true}
        role={drawing ? 'img' : undefined}
        aria-label={drawing ? 'Draw a highlight on the lesson' : undefined}
        onPointerDown={(event) => {
          if (!drawing) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          strokeAt.current = strokes.length;
          onStrokes([...strokes, { segmentId, points: [pointOf(event)] }]);
        }}
        onPointerMove={(event) => {
          if (!drawing || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          draw(event);
        }}
      >
        {strokesOnSegment(strokes, segmentId).map((stroke, index) => (
          <polyline
            key={`${segmentId}-${index}`}
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
          className="relative flex h-6 min-w-0 flex-1 items-center"
          role="slider"
          tabIndex={0}
          aria-label="Lesson position"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, duration - 1)}
          aria-valuenow={frame}
          aria-valuetext={`${formatClock(frame)} of ${formatClock(duration)}`}
        >
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/25"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
              onSeek(Math.round(ratio * Math.max(0, duration - 1)));
            }}
          >
            <span className="absolute inset-y-0 left-0 rounded-full bg-crayon" style={{ width: `${played * 100}%` }} />
          </button>
          {pins.map((pin) => {
            const at = clockToFrame(pin.timestamp);
            if (at === null || duration <= 0) return null;
            const id = `pin-${pin.id}`;
            const summary = `${pin.timestamp} · ${pin.text}`;
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
        {onVolume && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume ?? 1}
            aria-label="Volume"
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={volume ?? 1}
            aria-valuetext={muted ? 'Muted' : `${Math.round((volume ?? 1) * 100)} percent`}
            onChange={(event) => onVolume(Number(event.target.value))}
            className="h-1 w-20 shrink-0 accent-crayon max-[1199px]:hidden"
          />
        )}
        <button
          type="button"
          aria-label="Full screen"
          onClick={toggleFullscreen}
          className="flex h-8 w-8 shrink-0 items-center justify-center text-paper"
        >
          <IconFullscreen className="h-5 w-5" />
        </button>
      </div>
      {onChat && (
        <OpenChatButton onClick={onChat} className="absolute right-4 bottom-16 z-30" />
      )}
    </div>
  );
}

export function OpenChatButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open chat"
      onClick={onClick}
      className={cx(
        'flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-crayon text-white shadow-[3px_3px_0_var(--color-ink)]',
        className,
      )}
    >
      <IconAsk className="h-7 w-7" />
    </button>
  );
}

export function OpenChatBar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 border-y-2 border-ink bg-crayon py-3 text-[15px] font-medium text-white"
    >
      <IconAsk className="h-5 w-5" />
      Open chat
    </button>
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
