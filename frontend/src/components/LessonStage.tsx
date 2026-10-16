import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useRef, useState } from 'react';
import {
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  FPS,
  sampleSegments,
} from '../remotion/catalog.ts';
import { SampleLesson } from '../remotion/sampleLesson.tsx';
import {
  formatFrames,
  segmentIndexAtFrame,
  segmentStartFrames,
  totalFrames,
} from '../remotion/timeline.ts';

const starts = segmentStartFrames(sampleSegments);
const durationInFrames = totalFrames(sampleSegments);

export function LessonStage() {
  const playerRef = useRef<PlayerRef>(null);
  const pendingSeek = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const onFrame = ({ detail }: { detail: { frame: number } }) => {
      const target = pendingSeek.current;
      if (target !== null && Math.abs(detail.frame - target) > 1) return;
      pendingSeek.current = null;

      const next = segmentIndexAtFrame(detail.frame, sampleSegments);
      setActiveIndex((current) => (current === next ? current : next));
    };

    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
    };
  }, []);

  const seekToSegment = (index: number) => {
    const frame = starts[index];
    pendingSeek.current = frame;
    playerRef.current?.seekTo(frame);
    setActiveIndex(index);
  };

  return (
    <div className="min-h-full px-5 py-6 md:px-10 md:py-8">
      <header className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold tracking-[0.22em] text-crayon uppercase">
          Krayon
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-none text-ink md:text-5xl">
          Slope of a line
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Sample lesson. Each part is a Remotion component, so a later pass can
          rewrite one part without touching the others.
        </p>
      </header>

      <main className="mx-auto mt-8 grid max-w-6xl items-start gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <ol className="grid gap-2">
          {sampleSegments.map((segment, index) => {
            const active = index === activeIndex;
            return (
              <li key={segment.id}>
                <button
                  type="button"
                  onClick={() => seekToSegment(index)}
                  className={`flex w-full items-baseline justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    active
                      ? 'border-crayon bg-paper'
                      : 'border-line bg-paper/50 hover:bg-paper'
                  }`}
                >
                  <span>
                    <span className="block text-[11px] tracking-[0.16em] text-muted uppercase">
                      0{index + 1}
                    </span>
                    <span className="mt-1 block text-sm font-medium text-ink">
                      {segment.title}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {formatFrames(segment.durationInFrames, FPS)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="overflow-hidden rounded-2xl bg-ink shadow-[0_20px_50px_rgba(28,22,18,0.18)]">
          <Player
            ref={playerRef}
            component={SampleLesson}
            durationInFrames={durationInFrames}
            compositionWidth={COMPOSITION_WIDTH}
            compositionHeight={COMPOSITION_HEIGHT}
            fps={FPS}
            controls
            acknowledgeRemotionLicense
            style={{ width: '100%' }}
          />
        </div>
      </main>
    </div>
  );
}
