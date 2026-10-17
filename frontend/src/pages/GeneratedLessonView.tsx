import { Player, type PlayerRef } from '@remotion/player';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { GeneratedSegment, LessonDetail, LessonProgress } from '@krayon/shared';
import { courseLessons, reduceLesson } from '@krayon/shared';
import { DoubtPanel } from '../components/DoubtPanel.tsx';
import { FailureNotes } from '../components/FailureNotes.tsx';
import { LessonFrame } from '../components/LessonFrame.tsx';
import type { LessonTool } from '../components/LessonFrame.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { CrayonProgress } from '../components/ui/CrayonProgress.tsx';
import { IconArrow, IconBack } from '../components/ui/icons.tsx';
import { Markdown } from '../components/ui/Markdown.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { ApiError, askLesson, getLesson, regenerateSegment, renderUrl, saveLessonProgress } from '../lib/api.ts';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '../remotion/catalog.ts';
import { GeneratedLesson } from '../remotion/GeneratedLesson.tsx';
import { generatedDuration } from '../remotion/scene.ts';
import { lessonFailures } from '../study/failures.ts';
import { useLocalStudy } from '../study/localStudy.tsx';
import { useStudySession } from '../study/studyState.ts';
import { formatClock } from '../study/time.ts';

const SAVE_EVERY_MS = 10_000;
const WATCHED_AT = 0.9;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'The request failed.');

/** Every segment in play order, or null until all of them are rendered. */
const playableSegments = (lesson: LessonDetail): GeneratedSegment[] | null => {
  if (lesson.status !== 'ready' || lesson.segments.length === 0) return null;
  const segments = lesson.segments.map((item) => item.segment);
  return segments.every((item): item is GeneratedSegment => item !== null) ? segments : null;
};

const segmentIndexAt = (segments: GeneratedSegment[], frame: number) => {
  let start = 0;
  for (let index = 0; index < segments.length; index += 1) {
    start += segments[index].durationInFrames;
    if (frame < start) return index;
  }
  return Math.max(0, segments.length - 1);
};

const segmentLabel = (status: string) =>
  status === 'ready'
    ? 'Ready'
    : status === 'failed'
      ? 'Failed'
      : status === 'pending'
        ? 'Waiting'
        : status === 'drafting'
          ? 'Writing'
          : status === 'checking'
            ? 'Checking'
            : status === 'rendering'
              ? 'Rendering keyframes'
              : 'Reviewing';

export function GeneratedLessonView({ lessonId }: { lessonId: string }) {
  const navigate = useNavigate();
  const session = useStudySession();
  const { lessonMarks, patchMarks } = useLocalStudy();
  const [detail, setDetail] = useState<LessonDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [tool, setTool] = useState<LessonTool | null>(null);
  const [thinking, setThinking] = useState(false);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const playerRef = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(null);
  const frameRef = useRef(0);
  const progressRef = useRef<LessonProgress | null>(null);
  const sessionRef = useRef(session);
  const openedCourse = useRef<string | null>(null);
  const marksKey = `study:${lessonId}`;
  const marks = lessonMarks(marksKey);

  const load = useCallback(() => {
    getLesson(lessonId)
      .then((next) => {
        setDetail(next);
        setLoadError(null);
        if (progressRef.current === null) progressRef.current = next.progress;
      })
      .catch((error) => setLoadError(error instanceof ApiError && error.status === 404 ? 'This lesson no longer exists.' : messageOf(error)));
  }, [lessonId]);

  useEffect(load, [load]);

  useEffect(() => {
    sessionRef.current = session;
  });

  const courseId = detail?.courseId ?? null;
  useEffect(() => {
    if (!courseId || session.courseId === courseId || openedCourse.current === courseId) return;
    openedCourse.current = courseId;
    void session.openCourse(courseId).catch(() => undefined);
  }, [courseId, session]);

  useEffect(
    () =>
      session.listen((event) => {
        if (event.lessonId !== lessonId) return;
        setDetail((current) => (current ? reduceLesson(current, event) : current));
        if (event.type === 'lesson.ready' || event.type === 'lesson.failed') load();
        if (event.segmentId && (event.type === 'segment.ready' || event.type === 'segment.failed')) {
          setExplainingId((current) => {
            if (current !== event.segmentId) return current;
            if (event.type === 'segment.failed') setNotice(event.error ?? 'That part could not be rewritten.');
            return null;
          });
        }
      }),
    [lessonId, load, session],
  );

  const summary = session.course ? courseLessons(session.course).find((item) => item.id === lessonId) : undefined;
  const summaryStatus = summary?.status;
  const detailStatus = detail?.status;
  useEffect(() => {
    if (summaryStatus && detailStatus && summaryStatus !== detailStatus) load();
  }, [summaryStatus, detailStatus, load]);

  const segments = useMemo(() => (detail ? playableSegments(detail) : null), [detail]);
  const duration = segments ? generatedDuration(segments) : 0;
  const inputProps = useMemo(() => (segments ? { segments } : null), [segments]);
  const saved = detail?.progress;
  const resumeAt = saved && !saved.completed && saved.positionFrame < duration - FPS ? saved.positionFrame : 0;
  const playerKey = segments?.map((item) => `${item.id}:${item.durationInFrames}:${item.scene.layout.type}`).join('|') ?? '';
  const hasPlayer = segments !== null;
  const activeIndex = segments ? segmentIndexAt(segments, frame) : 0;
  const activeState = detail?.segments[activeIndex];

  const save = useCallback(
    (patch: Partial<Omit<LessonProgress, 'updatedAt'>>, keepalive = false) => {
      const current = progressRef.current;
      progressRef.current = {
        watched: current?.watched || patch.watched === true || patch.completed === true,
        completed: current?.completed || patch.completed === true,
        positionFrame: patch.positionFrame ?? current?.positionFrame ?? 0,
        updatedAt: Date.now(),
      };
      saveLessonProgress(lessonId, patch, keepalive)
        .then((stored) => sessionRef.current.noteProgress(lessonId, stored))
        .catch(() => undefined);
    },
    [lessonId],
  );

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !segments) return;
    const onFrame = (event: { detail: { frame: number } }) => {
      const target = pending.current;
      if (target !== null && Math.abs(event.detail.frame - target) > 2) return;
      pending.current = null;
      frameRef.current = event.detail.frame;
      setFrame(event.detail.frame);
      if (!progressRef.current?.watched && event.detail.frame >= duration * WATCHED_AT) {
        save({ watched: true, positionFrame: event.detail.frame });
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => {
      setPlaying(false);
      save({ positionFrame: frameRef.current });
    };
    const onEnded = () => {
      setPlaying(false);
      save({ completed: true, positionFrame: 0 });
    };
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    player.addEventListener('ended', onEnded);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
      player.removeEventListener('ended', onEnded);
    };
  }, [segments, duration, save]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => save({ positionFrame: frameRef.current }), SAVE_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [playing, save]);

  useEffect(() => {
    if (!hasPlayer || frameRef.current !== 0 || resumeAt === 0) return;
    frameRef.current = resumeAt;
    setFrame(resumeAt);
  }, [hasPlayer, resumeAt]);

  useEffect(() => {
    if (!hasPlayer) return;
    const leave = () => save({ positionFrame: frameRef.current }, true);
    window.addEventListener('beforeunload', leave);
    return () => {
      window.removeEventListener('beforeunload', leave);
      leave();
    };
  }, [hasPlayer, save]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement && !document.querySelector('[role="dialog"]')) {
        navigate('/study');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!detail) {
    return (
      <Shell>
        <div className="mt-8">
          <Link to="/study" className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
            <IconBack className="h-4 w-4" />
            Roadmap
          </Link>
          <p className="mt-4 max-w-xl text-[16px] text-muted">{loadError ?? 'Opening the lesson…'}</p>
          {loadError && (
            <Button variant="secondary" className="mt-4" onClick={load}>
              Try again
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  const ordered = session.course ? courseLessons(session.course) : [];
  const position = ordered.findIndex((item) => item.id === lessonId);
  const previous = position > 0 ? ordered[position - 1] : undefined;
  const next = position >= 0 ? ordered[position + 1] : undefined;
  const inChapter = ordered.filter((item) => item.chapterId === detail.chapterId);
  const chapterPosition = inChapter.findIndex((item) => item.id === lessonId);

  const narration = activeState?.narration ?? detail.explanationSummary.split(/(?<=[.!?])\s+/)[0] ?? detail.title;
  const prompts = detail.segments.map((item) => ({ id: item.id, text: item.narration }));
  const failures = lessonFailures(detail, () => {
    setDetail((current) => (current ? { ...current, status: 'queued', statusDetail: 'Queued', error: null, errorInfo: null } : current));
    void session.retryLesson(lessonId);
  });

  const generate = () => {
    setDetail((current) => (current ? { ...current, status: 'queued', statusDetail: 'Queued' } : current));
    void session.renderLesson(lessonId);
  };
  const seekTo = (nextFrame: number) => {
    const clamped = Math.max(0, Math.min(duration - 1, nextFrame));
    pending.current = clamped;
    frameRef.current = clamped;
    playerRef.current?.seekTo(clamped);
    setFrame(clamped);
  };
  const explain = () => {
    if (!activeState || explainingId) return;
    playerRef.current?.pause();
    setNotice(null);
    setExplainingId(activeState.id);
    regenerateSegment(lessonId, activeState.id).catch((error) => {
      setExplainingId(null);
      setNotice(messageOf(error));
    });
  };
  const ask = (question: string) => {
    patchMarks(marksKey, (current) => ({ ...current, doubts: [...current.doubts, { role: 'user', text: question }] }));
    setThinking(true);
    askLesson(lessonId, question, frameRef.current)
      .then((result) => result.answer)
      .catch((error) => `I could not answer that just now. ${messageOf(error)}`)
      .then((answer) => {
        patchMarks(marksKey, (current) => ({ ...current, doubts: [...current.doubts, { role: 'krayon', text: answer }] }));
        setThinking(false);
      });
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
  const openChat = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    chooseTool('ask');
  };
  const stamp = (text: string) => ({ id: `${Date.now()}`, timestamp: formatClock(frameRef.current, FPS), text });

  const heading = (
    <div className="flex min-w-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper py-0.5 pr-1.5 pl-0.5 shadow-[2px_2px_0_var(--color-ink)]">
      <Link to="/study" aria-label="Back to roadmap" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink">
        <IconBack className="h-4 w-4" />
      </Link>
      {previous && (
        <Link
          to={`/study/${previous.id}`}
          aria-label={`Previous lesson: ${previous.title}`}
          className="flex h-7 w-7 shrink-0 rotate-180 items-center justify-center rounded-full text-ink"
        >
          <IconArrow className="h-3.5 w-3.5" />
        </Link>
      )}
      <span className="min-w-0 truncate text-[12px] text-muted">{detail.chapterTitle}</span>
      <span className="shrink-0 text-[12px] text-muted">·</span>
      <span className="min-w-0 truncate font-serif text-[15px] leading-none text-ink">{detail.title}</span>
      {chapterPosition >= 0 && (
        <span className="shrink-0 text-[12px] text-muted">
          {chapterPosition + 1}/{inChapter.length}
        </span>
      )}
      {next && (
        <Link
          to={`/study/${next.id}`}
          aria-label={`Next lesson: ${next.title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink"
        >
          <IconArrow className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );

  const readyCount = detail.segments.filter((item) => item.status === 'ready').length;
  const total = detail.segmentCount || detail.segments.length;
  const waiting = (
    <div className="mx-auto w-full max-w-[1100px] px-6 pt-4">
      <div className="flex">{heading}</div>
      <Card className="mt-4 p-6">
        {detail.status === 'outlined' && (
          <>
            <p className="font-serif text-[22px] text-ink">This video is not made yet</p>
            <p className="mt-1 text-[15px] text-muted">
              The lesson is written. Making the video takes a few minutes; it plays once every part is ready.
            </p>
            <Button className="mt-4" onClick={generate}>
              Generate video
            </Button>
          </>
        )}
        {(detail.status === 'queued' || detail.status === 'rendering') && (
          <>
            <p className="font-serif text-[22px] text-ink">
              {detail.status === 'queued'
                ? 'Waiting for a free slot'
                : total > 0
                  ? `Making the video · ${readyCount} of ${total} parts ready`
                  : 'Planning the video'}
            </p>
            <p className="mt-1 text-[15px] text-muted">The video plays once every part is ready. You can leave this page; it keeps going.</p>
            <div className="mt-4">
              {detail.status === 'rendering' && total > 0 ? (
                <CrayonProgress value={(readyCount / total) * 100} label="Video progress" />
              ) : (
                <div role="progressbar" aria-label="Video progress" className="h-3 overflow-hidden rounded-full bg-line">
                  <div className="crayon-indeterminate h-full w-1/3 rounded-full bg-crayon" />
                </div>
              )}
            </div>
            {detail.segments.length > 0 && (
              <ol className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
                {detail.segments.map((item) => (
                  <li key={item.id} className="flex min-w-0 items-center gap-2 text-[14px]">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.status === 'ready' ? 'bg-done-fill' : item.status === 'failed' ? 'bg-crayon' : item.status === 'pending' ? 'bg-line' : 'animate-pulse bg-yellow'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-ink">{item.title}</span>
                    <span className="ml-auto shrink-0 text-[13px] text-muted">{segmentLabel(item.status)}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
        {detail.status === 'failed' && (
          <>
            <p className="font-serif text-[22px] text-ink">The video could not be finished</p>
            <p className="mt-1 text-[15px] text-muted">
              {readyCount} of {total} parts are ready. Retry makes only the parts that failed.
            </p>
          </>
        )}
      </Card>
    </div>
  );

  return (
    <Shell fill bare>
      <div className="flex h-full min-h-0 flex-col">
        {(failures.length > 0 || notice || session.error) && (
          <div className="shrink-0 bg-paper px-4 py-2">
            <FailureNotes items={failures} />
            {(notice || session.error) && <p className="text-[15px] text-crayon-text">{notice ?? session.error}</p>}
          </div>
        )}

        <div className={`grid min-h-0 flex-1 ${panelOpen && segments ? 'grid-cols-[minmax(0,1fr)_400px] gap-3' : 'grid-cols-1'}`}>
          <div className="h-full min-h-0 overflow-y-auto bg-paper">
            {segments && inputProps ? (
              <div className="h-full min-h-0">
                <LessonFrame
                  fill
                  heading={heading}
                  onChat={panelOpen ? undefined : openChat}
                  frame={frame}
                  duration={duration}
                  playing={playing}
                  activeTool={tool}
                  drawing={tool === 'highlight'}
                  strokes={marks.strokes}
                  explaining={explainingId !== null}
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
                  pins={marks.pins}
                  onPin={() => patchMarks(marksKey, (current) => ({ ...current, pins: [...current.pins, stamp(narration)] }))}
                  onStrokes={(strokes) => patchMarks(marksKey, (current) => ({ ...current, strokes }))}
                >
                  <Player
                    ref={playerRef}
                    key={playerKey}
                    component={GeneratedLesson}
                    inputProps={inputProps}
                    durationInFrames={duration}
                    initialFrame={Math.min(frame || resumeAt, Math.max(0, duration - 1))}
                    compositionWidth={COMPOSITION_WIDTH}
                    compositionHeight={COMPOSITION_HEIGHT}
                    fps={FPS}
                    controls={false}
                    acknowledgeRemotionLicense
                    style={{ width: '100%', height: '100%' }}
                  />
                </LessonFrame>
              </div>
            ) : (
              waiting
            )}

            <div className="mx-auto w-full max-w-[1100px] px-6 py-4">
              {detail.shortSource && (
                <p className="mb-3 text-[14px] text-muted">This chapter is short, so this lesson is shorter than usual.</p>
              )}
              {detail.studyDoc && (
                <Card id="study-doc" className="p-5">
                  <h2 className="font-serif text-2xl text-ink">Study notes</h2>
                  <Markdown className="mt-3 text-[15px] leading-relaxed">{detail.studyDoc}</Markdown>
                </Card>
              )}
              {next && (
                <Link to={`/study/${next.id}`} className="mt-4 flex items-center gap-2 text-[15px] font-medium text-ink">
                  Next lesson: {next.title}
                  <IconArrow className="h-4 w-4" />
                </Link>
              )}
              {import.meta.env.DEV && detail.segments.length > 0 && (
                <details className="mt-4 rounded-2xl border border-line bg-paper px-4 py-3">
                  <summary className="cursor-pointer text-[15px] font-medium text-ink">Scene debug</summary>
                  <div className="mt-3 grid gap-4">
                    {detail.segments.map((item) => (
                      <div key={item.id}>
                        <p className="text-[14px] text-ink">
                          Segment {item.index + 1}: {item.title} · {item.status}
                          {item.reviewStatus === 'unreviewed' ? (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[12px] text-amber-950">unreviewed</span>
                          ) : null}
                          {item.sourcePages.length > 0 ? ` · pages ${item.sourcePages.join(', ')}` : ''}
                        </p>
                        {item.rounds.map((round) => (
                          <div key={round.n} className="mt-3">
                            <p className="text-[13px] text-ink">
                              Round {round.n}
                              {round.score !== null ? ` · score ${round.score}` : ''}
                              {round.pass === null ? '' : round.pass ? ' · pass' : ' · fail'}
                              {round.fixed === true ? ' · fixed' : round.fixed === false ? ' · kept' : ''}
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
                        {item.segment && (
                          <pre className="mt-2 max-h-80 overflow-auto font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
                            {JSON.stringify(item.segment, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
          {panelOpen && segments && (
            <div className="flex h-full min-h-0 flex-col py-3 pr-3">
              <DoubtPanel
                paused={!playing}
                timeLabel={formatClock(frame, FPS)}
                chapterLabel={`Part ${activeIndex + 1} of ${segments.length}`}
                highlightAttached={marks.strokes.length > 0}
                onClose={closePanel}
                answer={narration}
                marks={marks}
                tool={tool}
                prompts={prompts}
                thinking={thinking}
                onAsk={ask}
                onExplain={explain}
                onPin={(text) => patchMarks(marksKey, (current) => ({ ...current, pins: [...current.pins, stamp(text)] }))}
                onNote={(text) => patchMarks(marksKey, (current) => ({ ...current, notes: [...current.notes, stamp(text)] }))}
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
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
