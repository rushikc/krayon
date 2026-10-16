import { Player } from '@remotion/player';
import { useEffect, useId } from 'react';
import type { Subtopic } from '../data/topics.ts';
import { usePalette } from '../paletteState.ts';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '../remotion/catalog.ts';
import { TopicLesson } from '../remotion/TopicLesson.tsx';
import { topicLessonDuration } from '../remotion/topicLessonTiming.ts';

type LessonDrawerProps = {
  subtopic: Subtopic;
  onClose: () => void;
};

export function LessonDrawer({ subtopic, onClose }: LessonDrawerProps) {
  const titleId = useId();
  const { colors } = usePalette();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close lesson"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto bg-stone shadow-[-24px_0_60px_rgba(28,22,18,0.18)]"
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-crayon uppercase">
              Lesson
            </p>
            <h2 id={titleId} className="mt-1 font-serif text-3xl leading-tight text-ink">
              {subtopic.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
        <div className="px-5 pt-5">
          <div className="overflow-hidden rounded-2xl bg-ink shadow-[0_16px_40px_rgba(28,22,18,0.16)]">
            <Player
              key={subtopic.id}
              component={TopicLesson}
              inputProps={{ title: subtopic.title, beats: subtopic.beats, colors }}
              durationInFrames={topicLessonDuration(subtopic.beats.length)}
              compositionWidth={COMPOSITION_WIDTH}
              compositionHeight={COMPOSITION_HEIGHT}
              fps={FPS}
              controls
              acknowledgeRemotionLicense
              style={{ width: '100%' }}
            />
          </div>
        </div>
        <ol className="grid gap-3 px-5 py-6">
          {subtopic.beats.map((beat, index) => (
            <li key={beat} className="text-sm leading-relaxed text-muted">
              <span className="mr-2 text-[11px] tracking-[0.14em] text-crayon uppercase">
                0{index + 1}
              </span>
              {beat}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
