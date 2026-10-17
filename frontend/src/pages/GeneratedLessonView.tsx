import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChapterStrip } from '../components/ChapterStrip.tsx';
import { DoubtPanel } from '../components/DoubtPanel.tsx';
import { LessonDesk } from '../components/LessonDesk.tsx';
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
import { formatClock, formatLength } from '../study/time.ts';
import { renderUrl } from '../lib/api.ts';
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
  const failed = !lesson && (session.fallbackTopicId === topicId || session.topics[topicId]?.status === 'failed');
  const loading = !lesson && !failed;
  const playerRef = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
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
  const topicRuntime = session.topics[topicId];
  const loadingDetail = topicRuntime?.statusDetail ?? session.statusDetail ?? 'Writing the lesson…';
  const segmentStatuses = Object.fromEntries(
    Object.values(topicRuntime?.segments ?? {}).map((item) => [item.id, item.statusDetail ?? item.status]),
  );

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
  const chooseTool = (nextTool: LessonTool) => {
    playerRef.current?.pause();
    if (nextTool === 'highlight') {
      setTool((current) => (current === nextTool ? null : nextTool));
      return;
    }
    setPanelOpen(true);
    setTool((current) => (panelOpen && current === nextTool ? null : nextTool));
  };
  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.isMuted()) {
      player.unmute();
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  };
  const closePanel = () => {
    setPanelOpen(false);
    setTool((current) => (current === 'highlight' ? current : null));
  };
  const lessonDone =
    !!lesson && lesson.segments.length > 0 && lesson.segments.every((item) => marks.watchedIds.includes(item.id));

  return (
    <Shell>
      <div className="mt-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              to="/study"
              aria-label="Back to roadmap"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper"
            >
              <IconBack className="h-4 w-4" />
            </Link>
            <h1 className="min-w-0 font-serif text-2xl leading-none text-ink sm:truncate sm:text-3xl">
              <HandUnderline>{topic.title}</HandUnderline>
            </h1>
            <p className="w-full pl-11 text-[13px] text-muted sm:w-auto sm:pl-0 sm:text-[14px]">
              {session.fileName ?? 'Your notes'}
              {ordered.length > 0 ? ` · Step ${stepIndex + 1} of ${ordered.length}` : ''}
            </p>
          </div>
          {nextTopic && lessonDone && (
            <Link to={`/study/${nextTopic.id}`} className={buttonClass('secondary', 'shrink-0 !px-3 !py-1 !text-[13px]')}>
              Next step
              <IconArrow className="h-3.5 w-3.5" />
            </Link>
          )}
          {nextTopic && !lessonDone && (
            <button type="button" disabled className={buttonClass('secondary', 'shrink-0 !px-3 !py-1 !text-[13px]')}>
              Next step
            </button>
          )}
        </div>
        {(session.error || session.regeneratingId || topicRuntime?.statusDetail) && (
          <p className={`mt-3 text-[15px] ${session.error ? 'text-crayon-text' : 'text-muted'}`}>
            {session.error ?? topicRuntime?.segments[session.regeneratingId ?? '']?.statusDetail ?? topicRuntime?.statusDetail ?? session.statusDetail}
          </p>
        )}

        <div className={`mt-5 grid items-start gap-4 ${panelOpen ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="min-w-0">
            {loading && (
              <Card className="p-6">
                <p className="text-[16px] text-ink">{loadingDetail}</p>
                <div
                  role="progressbar"
                  aria-label={loadingDetail}
                  aria-valuetext={loadingDetail}
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
                onTool={chooseTool}
                onExplain={explain}
                muted={muted}
                onMute={toggleMute}
                onFullscreen={() => playerRef.current?.requestFullscreen()}
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
                    key={lesson.segments
                      .map(
                        (item) =>
                          `${item.id}:${item.durationInFrames}:${item.scene.layout.type}:${item.debug?.repairRounds ?? 0}`,
                      )
                      .join('|')}
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
              <>
                <ChapterStrip
                  chapters={chapters}
                  activeIndex={activeIndex}
                  watchedIds={marks.watchedIds}
                  statuses={segmentStatuses}
                  onSeek={seekTo}
                />
                <LessonDesk
                  sentences={(segment?.narration ?? topic.summary)
                    .split(/(?<=[.!?])\s+/)
                    .map((item) => item.trim())
                    .filter(Boolean)}
                  pins={marks.pins}
                  onAddNote={() => chooseTool('note')}
                  onOpenStudyDoc={
                    lesson?.studyDoc
                      ? () => document.getElementById('study-doc')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      : undefined
                  }
                  next={
                    nextTopic
                      ? {
                          title: nextTopic.title,
                          duration: session.lessons[nextTopic.id]
                            ? formatLength(generatedDuration(session.lessons[nextTopic.id].segments))
                            : '',
                          locked: !lessonDone,
                          href: `/study/${nextTopic.id}`,
                          artId: nextTopic.id,
                        }
                      : null
                  }
                />
              </>
            )}
            {lesson?.studyDoc && (
              <Card id="study-doc" className="mt-4 p-4">
                <h2 className="font-serif text-2xl text-ink">Study doc</h2>
                <pre className="mt-2 font-sans text-[15px] leading-relaxed whitespace-pre-wrap text-ink">
                  {lesson.studyDoc}
                </pre>
              </Card>
            )}
            {import.meta.env.DEV && lesson && (
              <details className="mt-4 rounded-2xl border border-line bg-paper px-4 py-3">
                <summary className="cursor-pointer text-[15px] font-medium text-ink">Scene debug</summary>
                <div className="mt-3 grid gap-4">
                  {lesson.segments.map((item, index) => {
                    const rounds = topicRuntime?.segments[item.id]?.rounds ?? [];
                    return (
                      <div key={item.id}>
                        <p className="text-[14px] text-ink">
                          Segment {index + 1}: {item.title}
                        </p>
                        <p className="text-[13px] text-muted">
                          {item.debug?.repairRounds ?? 0} repair rounds · {item.debug?.issues.length ?? 0} issues
                        </p>
                        {(item.debug?.issues.length ?? 0) > 0 && (
                          <ul className="mt-1 grid gap-1">
                            {item.debug?.issues.map((issue) => (
                              <li key={`${issue.path}-${issue.message}`} className="text-[13px] text-muted">
                                {issue.path}: {issue.message}
                              </li>
                            ))}
                          </ul>
                        )}
                        {rounds.map((round) => (
                          <div key={round.n} className="mt-3">
                            <p className="text-[13px] text-ink">
                              Round {round.n}
                              {round.score !== null ? ` · score ${round.score}` : ''}
                              {round.pass === null ? '' : round.pass ? ' · pass' : ' · fail'}
                            </p>
                            {round.issues.length > 0 && (
                              <ul className="mt-1 grid gap-1">
                                {round.issues.map((issue, issueIndex) => (
                                  <li key={`${round.n}-${issueIndex}`} className="text-[13px] text-muted">
                                    {'frame' in issue ? `frame ${issue.frame}: ` : ''}
                                    {'problem' in issue ? issue.problem : issue.message}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="mt-2 flex flex-wrap gap-2">
                              {round.keyframeIds.map((blobId) => (
                                <img
                                  key={blobId}
                                  src={renderUrl(blobId)}
                                  alt={`Round ${round.n} keyframe`}
                                  className="h-24 w-auto rounded-lg border border-line"
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                        <pre className="mt-2 overflow-auto font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
                          {JSON.stringify(item, null, 2)}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
          {!loading && panelOpen && (
            <DoubtPanel
              paused={!playing}
              timeLabel={formatClock(frame, FPS)}
              chapterLabel={`Chapter ${String(activeIndex + 1).padStart(2, '0')}`}
              highlightAttached={marks.strokes.length > 0}
              onClose={closePanel}
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
              onQuiz={() => setTool('quiz')}
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
