import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChapterStrip } from '../components/ChapterStrip.tsx';
import { DoubtPanel } from '../components/DoubtPanel.tsx';
import { LessonFrame } from '../components/LessonFrame.tsx';
import type { LessonTool } from '../components/LessonFrame.tsx';
import { Card } from '../components/ui/Card.tsx';
import { buttonClass } from '../components/ui/Button.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconArrow, IconBack } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import {
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  FPS,
  sampleSegments,
} from '../remotion/catalog.ts';
import { GeneratedLesson } from '../remotion/GeneratedLesson.tsx';
import { SampleLesson } from '../remotion/sampleLesson.tsx';
import { generatedDuration, orderTopics } from '../remotion/scene.ts';
import { totalFrames } from '../remotion/timeline.ts';
import { chapterIndexAtFrame, generatedChapters } from '../study/chapters.ts';
import type { Chapter } from '../study/chapters.ts';
import { useLocalStudy } from '../study/localStudy.tsx';
import { formatClock } from '../study/time.ts';
import { useStudySession } from '../study/studyState.ts';

const sampleChapters = (): Chapter[] => {
  let start = 0;
  return sampleSegments.map((segment) => {
    const chapter = {
      id: segment.id,
      title: segment.title,
      start,
      duration: segment.durationInFrames,
    };
    start += segment.durationInFrames;
    return chapter;
  });
};

export function GeneratedLessonView({ topicId }: { topicId: string }) {
  const navigate = useNavigate();
  const session = useStudySession();
  const { lessonMarks, patchMarks } = useLocalStudy();
  const topic = session.roadmap?.topics.find((item) => item.id === topicId) ?? null;
  const lesson = session.lessons[topicId] ?? null;
  const failed = session.fallbackTopicId === topicId && !lesson;
  const loading = !lesson && !failed;
  const playerRef = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<LessonTool | null>(null);
  const marksKey = `study:${topicId}`;
  const marks = lessonMarks(marksKey);

  const chapters = useMemo(
    () => (lesson ? generatedChapters(lesson.segments) : sampleChapters()),
    [lesson],
  );
  const duration = lesson ? generatedDuration(lesson.segments) : totalFrames(sampleSegments);
  const inputProps = useMemo(() => (lesson ? { segments: lesson.segments } : null), [lesson]);
  const activeIndex = chapterIndexAtFrame(frame, chapters);
  const active = chapters[activeIndex];
  const segment = lesson?.segments[activeIndex];

  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (!topic || requested.current === topicId) return;
    requested.current = topicId;
    void session.openTopic(topicId);
  }, [session, topic, topicId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (event: { detail: { frame: number } }) => {
      const target = pending.current;
      if (target !== null && Math.abs(event.detail.frame - target) > 2) return;
      pending.current = null;
      setFrame(event.detail.frame);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [lesson, failed, topicId]);

  useEffect(() => {
    const watchedNow = chapters
      .filter((chapter) => frame >= chapter.start + chapter.duration - 1)
      .map((chapter) => chapter.id);
    if (watchedNow.length === 0) return;
    patchMarks(marksKey, (current) => {
      if (watchedNow.every((id) => current.watchedIds.includes(id))) return current;
      return { ...current, watchedIds: [...new Set([...current.watchedIds, ...watchedNow])] };
    });
  }, [chapters, frame, marksKey, patchMarks]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        navigate('/study');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!session.roadmap || !topic) {
    return (
      <Shell>
        <div className="mt-8">
          <Link to="/study" className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
            <IconBack className="h-4 w-4" />
            Roadmap
          </Link>
          <p className="mt-4 max-w-xl text-[16px] text-muted">
            This lesson needs the document it was made from. Add it again from the library.
          </p>
        </div>
      </Shell>
    );
  }

  const ordered = orderTopics(session.roadmap.topics);
  const stepIndex = ordered.findIndex((item) => item.id === topicId);
  const nextTopic = stepIndex >= 0 ? ordered[stepIndex + 1] : undefined;
  const answer = segment?.narration ?? active?.title ?? topic.summary;
  const prompts = (lesson?.segments ?? []).map((item) => ({ id: item.id, text: item.narration }));
  const seekTo = (nextFrame: number) => {
    const clamped = Math.max(0, Math.min(duration - 1, nextFrame));
    pending.current = clamped;
    playerRef.current?.seekTo(clamped);
    setFrame(clamped);
  };
  const explain = () => {
    if (!segment) return;
    playerRef.current?.pause();
    void session.regenerate(topic, segment);
  };

  return (
    <Shell>
      <div className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/study" className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
              <IconBack className="h-4 w-4" />
              Roadmap
            </Link>
            <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">
              <HandUnderline>{topic.title}</HandUnderline>
            </h1>
            <p className="mt-2 max-w-xl text-[16px] text-muted">
              {topic.summary}
              {ordered.length > 0 ? ` · Step ${stepIndex + 1} of ${ordered.length}` : ''}
            </p>
          </div>
          {nextTopic && (
            <Link to={`/study/${nextTopic.id}`} className={buttonClass('secondary')}>
              Next step
              <IconArrow className="h-4 w-4" />
            </Link>
          )}
        </div>
        {session.error && <p className="mt-3 text-[15px] text-crayon-text">{session.error}</p>}

        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            {loading && (
              <Card className="p-6">
                <p className="text-[16px] text-ink">Writing the lesson…</p>
                <div
                  role="progressbar"
                  aria-label="Writing the lesson"
                  aria-valuetext="Writing the lesson"
                  className="mt-3 h-3 overflow-hidden rounded-full bg-line"
                >
                  <div className="crayon-indeterminate h-full w-1/3 rounded-full bg-crayon" />
                </div>
              </Card>
            )}
            {!loading && active && (
              <LessonFrame
                chapters={chapters}
                frame={frame}
                duration={duration}
                playing={playing}
                activeTool={tool}
                drawing={tool === 'highlight'}
                strokes={marks.strokes}
                explaining={session.regeneratingId === segment?.id}
                onToggle={() => {
                  const player = playerRef.current;
                  if (!player) return;
                  if (player.isPlaying()) player.pause();
                  else player.play();
                }}
                onSeek={seekTo}
                onTool={(next) => {
                  playerRef.current?.pause();
                  setTool((current) => (current === next ? null : next));
                }}
                onExplain={explain}
                onPin={() => {
                  patchMarks(marksKey, (current) => ({
                    ...current,
                    pins: [
                      ...current.pins,
                      { id: `${Date.now()}`, timestamp: formatClock(frame, FPS), text: answer },
                    ],
                  }));
                }}
                onStrokes={(strokes) => patchMarks(marksKey, (current) => ({ ...current, strokes }))}
              >
                {lesson && inputProps ? (
                  <Player
                    ref={playerRef}
                    key={lesson.segments.map((item) => `${item.id}:${item.durationInFrames}`).join('|')}
                    component={GeneratedLesson}
                    inputProps={inputProps}
                    durationInFrames={duration}
                    compositionWidth={COMPOSITION_WIDTH}
                    compositionHeight={COMPOSITION_HEIGHT}
                    fps={FPS}
                    controls={false}
                    acknowledgeRemotionLicense
                    style={{ width: '100%' }}
                  />
                ) : (
                  <Player
                    ref={playerRef}
                    component={SampleLesson}
                    durationInFrames={duration}
                    compositionWidth={COMPOSITION_WIDTH}
                    compositionHeight={COMPOSITION_HEIGHT}
                    fps={FPS}
                    controls={false}
                    acknowledgeRemotionLicense
                    style={{ width: '100%' }}
                  />
                )}
              </LessonFrame>
            )}
            {!loading && (
              <ChapterStrip
                chapters={chapters}
                activeIndex={activeIndex}
                watchedIds={marks.watchedIds}
                frame={frame}
                onSeek={seekTo}
              />
            )}
            {lesson && (
              <Card className="mt-4 p-4">
                <h2 className="font-serif text-2xl text-ink">Study doc</h2>
                <pre className="mt-2 font-sans text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
                  {lesson.studyDoc}
                </pre>
              </Card>
            )}
          </div>
          {!loading && (
            <DoubtPanel
              topicId={topicId}
              paused={!playing}
              timeLabel={formatClock(frame, FPS)}
              answer={answer}
              marks={marks}
              tool={tool}
              prompts={prompts}
              onAsk={(question) => {
                patchMarks(marksKey, (current) => ({
                  ...current,
                  doubts: [
                    ...current.doubts,
                    { role: 'user', text: question },
                    { role: 'krayon', text: answer },
                  ],
                }));
              }}
              onExplain={explain}
              onPin={(text) => {
                patchMarks(marksKey, (current) => ({
                  ...current,
                  pins: [...current.pins, { id: `${Date.now()}`, timestamp: formatClock(frame, FPS), text }],
                }));
              }}
              onNote={(text) => {
                patchMarks(marksKey, (current) => ({
                  ...current,
                  notes: [...current.notes, { id: `${Date.now()}`, timestamp: formatClock(frame, FPS), text }],
                }));
              }}
              onQuizToggle={(id) => {
                patchMarks(marksKey, (current) => {
                  const quizIds = current.quizIds.includes(id)
                    ? current.quizIds.filter((item) => item !== id)
                    : [...current.quizIds, id];
                  return {
                    ...current,
                    quizIds,
                    quizReady: prompts.length > 0 && prompts.every((prompt) => quizIds.includes(prompt.id)),
                  };
                });
              }}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
