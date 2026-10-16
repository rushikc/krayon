import { Player } from '@remotion/player';
import { useEffect, useId } from 'react';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS, sampleSegments } from '../remotion/catalog.ts';
import { GeneratedLesson } from '../remotion/GeneratedLesson.tsx';
import { SampleLesson } from '../remotion/sampleLesson.tsx';
import { generatedDuration } from '../remotion/scene.ts';
import type { GeneratedLesson as GeneratedLessonData, RoadmapTopic } from '../remotion/scene.ts';
import { totalFrames } from '../remotion/timeline.ts';
import { useStudySession } from '../study/studyState.ts';

type GeneratedLessonDrawerProps = {
  topic: RoadmapTopic;
  lesson: GeneratedLessonData | null;
  loading: boolean;
  failed: boolean;
  error: string | null;
  onClose: () => void;
};

export function GeneratedLessonDrawer({
  topic,
  lesson,
  loading,
  failed,
  error,
  onClose,
}: GeneratedLessonDrawerProps) {
  const titleId = useId();
  const { regenerate, regeneratingId } = useStudySession();
  const sampleDuration = totalFrames(sampleSegments);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const playerKey = lesson
    ? lesson.segments.map((segment) => `${segment.id}:${segment.durationInFrames}`).join('|')
    : 'slope';

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
              {topic.title}
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
          {loading && (
            <p className="rounded-2xl bg-paper px-4 py-6 text-sm text-muted">Writing the lesson…</p>
          )}
          {!loading && failed && (
            <div>
              <p className="mb-3 text-sm text-crayon">{error ?? 'Showing the sample lesson.'}</p>
              <div className="overflow-hidden rounded-2xl bg-ink shadow-[0_16px_40px_rgba(28,22,18,0.16)]">
                <Player
                  component={SampleLesson}
                  durationInFrames={sampleDuration}
                  compositionWidth={COMPOSITION_WIDTH}
                  compositionHeight={COMPOSITION_HEIGHT}
                  fps={FPS}
                  controls
                  acknowledgeRemotionLicense
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          )}
          {!loading && lesson && (
            <div className="overflow-hidden rounded-2xl bg-ink shadow-[0_16px_40px_rgba(28,22,18,0.16)]">
              <Player
                key={playerKey}
                component={GeneratedLesson}
                inputProps={{ segments: lesson.segments }}
                durationInFrames={generatedDuration(lesson.segments)}
                compositionWidth={COMPOSITION_WIDTH}
                compositionHeight={COMPOSITION_HEIGHT}
                fps={FPS}
                controls
                acknowledgeRemotionLicense
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>

        {lesson && (
          <ol className="grid gap-3 px-5 py-6">
            {lesson.segments.map((segment, index) => (
              <li key={segment.id} className="rounded-xl border border-line bg-paper px-3 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    <span className="mr-2 text-[11px] tracking-[0.14em] text-crayon uppercase">
                      0{index + 1}
                    </span>
                    {segment.title}
                  </span>
                  <button
                    type="button"
                    disabled={regeneratingId !== null}
                    onClick={() => void regenerate(topic, segment)}
                    className="shrink-0 text-xs font-medium text-crayon disabled:opacity-40"
                  >
                    {regeneratingId === segment.id ? 'Regenerating…' : 'Regenerate this segment'}
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {lesson && (
          <div className="px-5 pb-8">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              Study doc
            </p>
            <pre className="mt-2 font-sans text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {lesson.studyDoc}
            </pre>
          </div>
        )}
        {error && lesson && <p className="px-5 pb-6 text-sm text-crayon">{error}</p>}
      </aside>
    </div>
  );
}
