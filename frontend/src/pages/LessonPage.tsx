import { Player, type PlayerRef } from '@remotion/player';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useMatch, useNavigate, useParams } from 'react-router-dom';
import { GeneratedLessonView } from './GeneratedLessonView.tsx';
import { DoubtPanel } from '../components/DoubtPanel.tsx';
import { LessonFrame, OpenChatButton } from '../components/LessonFrame.tsx';
import type { LessonTool } from '../components/LessonFrame.tsx';
import { IconArrow, IconBack } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { isWideLayout, useWideLayout } from '../components/ui/wideLayout.ts';
import { getTopic } from '../data/topics.ts';
import { usePalette } from '../paletteState.ts';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH, FPS } from '../remotion/catalog.ts';
import { TopicLesson } from '../remotion/TopicLesson.tsx';
import { topicLessonDuration } from '../remotion/topicLessonTiming.ts';
import { chapterIndexAtFrame, curatedChapters } from '../study/chapters.ts';
import { lessonKey, strokesOnSegment, topicKey, useLocalStudy } from '../study/localStudy.tsx';
import { formatClock } from '../study/time.ts';

export function LessonPage() {
  const generated = useMatch('/study/:lessonId');
  if (generated?.params.lessonId) {
    return <GeneratedLessonView key={generated.params.lessonId} lessonId={generated.params.lessonId} />;
  }
  return <CuratedLesson />;
}

function CuratedLesson() {
  const { topicId, subtopicId } = useParams();
  const navigate = useNavigate();
  const { prefix, colors } = usePalette();
  const { lessonMarks, patchMarks, markSubtopicDone, touchTopic } = useLocalStudy();
  const topic = topicId ? getTopic(topicId) : undefined;
  const subtopic = topic?.subtopics.find((item) => item.id === subtopicId);
  const playerRef = useRef<PlayerRef>(null);
  const pending = useRef<number | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const wide = useWideLayout();
  const [panelOpen, setPanelOpen] = useState(isWideLayout);
  const [tool, setTool] = useState<LessonTool | null>(null);
  const home = prefix || '/';
  const base = home === '/' ? '' : home;

  const chapters = useMemo(() => (subtopic ? curatedChapters(subtopic) : []), [subtopic]);
  const inputProps = useMemo(
    () => (subtopic ? { title: subtopic.title, beats: subtopic.beats, colors } : null),
    [colors, subtopic],
  );
  const duration = subtopic ? topicLessonDuration(subtopic.beats.length) : 1;
  const marks = subtopic && topic ? lessonMarks(lessonKey(topic.id, subtopic.id)) : null;
  const activeIndex = chapterIndexAtFrame(frame, chapters);
  const active = chapters[activeIndex];
  const finished = useRef(false);
  const seenTopic = useRef<string | null>(null);

  useEffect(() => {
    finished.current = false;
  }, [subtopic?.id]);

  useEffect(() => {
    if (!topic || seenTopic.current === topic.id) return;
    seenTopic.current = topic.id;
    touchTopic(topicKey(topic.id));
  }, [topic, touchTopic]);

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
  }, [subtopic?.id]);

  useEffect(() => {
    if (!topic || !subtopic) return;
    const watchedNow = chapters
      .filter((chapter) => frame >= chapter.start + chapter.duration - 1)
      .map((chapter) => chapter.id);
    if (watchedNow.length === 0) return;
    patchMarks(lessonKey(topic.id, subtopic.id), (current) => {
      if (watchedNow.every((id) => current.watchedIds.includes(id))) return current;
      return { ...current, watchedIds: [...new Set([...current.watchedIds, ...watchedNow])] };
    });
  }, [chapters, frame, patchMarks, subtopic, topic]);

  useEffect(() => {
    if (!topic || !subtopic || !marks || finished.current) return;
    const allWatched = chapters.length > 0 && chapters.every((chapter) => marks.watchedIds.includes(chapter.id));
    if (!allWatched) return;
    finished.current = true;
    markSubtopicDone(topicKey(topic.id), subtopic.id);
  }, [chapters, markSubtopicDone, marks, subtopic, topic]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.fullscreenElement || document.querySelector('[role="dialog"]')) return;
      if (panelOpen) {
        setPanelOpen(false);
        setTool((current) => (current === 'highlight' ? current : null));
        return;
      }
      if (topic) navigate(`${base}/topics/${topic.id}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [base, navigate, panelOpen, topic]);

  if (!topic || !subtopic || !marks || !active) {
    return <Navigate to={home} replace />;
  }

  const index = topic.subtopics.findIndex((item) => item.id === subtopic.id);
  const next = topic.subtopics[index + 1];
  const answer = marks.expanded ? subtopic.beats.join(' ') : (active.title === subtopic.title ? subtopic.beats[0] : active.title);

  const prompts = subtopic.beats.map((text, beatIndex) => ({ id: `beat-${beatIndex}`, text }));
  const savePin = (text: string) => {
    patchMarks(lessonKey(topic.id, subtopic.id), (current) => ({
      ...current,
      pins: [...current.pins, { id: `${Date.now()}`, timestamp: formatClock(frame, FPS), text }],
    }));
  };

  const seekTo = (nextFrame: number) => {
    const clamped = Math.max(0, Math.min(duration - 1, nextFrame));
    pending.current = clamped;
    playerRef.current?.seekTo(clamped);
    setFrame(clamped);
  };

  const chooseTool = (nextTool: LessonTool) => {
    playerRef.current?.pause();
    setPlaying(false);
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

  return (
    <Shell fill bare>
      <div className="flex h-full min-h-0 flex-col">
        <div
          className={`grid min-h-0 flex-1 ${
            panelOpen && wide ? 'grid-cols-[minmax(0,1fr)_528px] gap-3' : 'grid-cols-1'
          }`}
        >
          <div className="h-full min-h-0 min-w-0 overflow-y-auto">
            <div className="aspect-video min-[1200px]:aspect-auto min-[1200px]:h-full">
            <LessonFrame
              fill
              heading={
                <div className="flex min-w-0 items-center gap-1.5 rounded-full border-2 border-ink bg-paper py-0.5 pr-1.5 pl-0.5 shadow-[2px_2px_0_var(--color-ink)]">
                  <Link
                    to={`${base}/topics/${topic.id}`}
                    aria-label={`Back to ${topic.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink"
                  >
                    <IconBack className="h-4 w-4" />
                  </Link>
                  <span className="min-w-0 truncate font-serif text-[15px] leading-none text-ink">{subtopic.title}</span>
                  <span className="shrink-0 text-[12px] text-muted">
                    {index + 1}/{topic.subtopics.length}
                  </span>
                  {next && (
                    <Link
                      to={`${base}/topics/${topic.id}/${next.id}`}
                      aria-label={`Next step: ${next.title}`}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink"
                    >
                      <IconArrow className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              }
              onChat={!panelOpen && wide ? openChat : undefined}
              frame={frame}
              duration={duration}
              playing={playing}
              activeTool={tool}
              drawing={tool === 'highlight'}
              strokes={marks.strokes}
              segmentId={active.id}
              pins={marks.pins}
              artId={topic.id}
              explaining={false}
              onToggle={() => {
                const player = playerRef.current;
                if (!player) return;
                if (player.isPlaying()) player.pause();
                else player.play();
              }}
              onSeek={seekTo}
              onTool={chooseTool}
              onExplain={() => {
                playerRef.current?.pause();
                const longer = subtopic.beats.join(' ');
                patchMarks(lessonKey(topic.id, subtopic.id), (current) => {
                  const last = current.doubts.findLastIndex((item) => item.role === 'krayon');
                  return {
                    ...current,
                    expanded: true,
                    doubts: current.doubts.map((turn, turnIndex) =>
                      turnIndex === last ? { ...turn, text: longer } : turn,
                    ),
                  };
                });
              }}
              onPin={() => savePin(answer)}
              muted={muted}
              onMute={toggleMute}
              onStrokes={(strokes) => {
                patchMarks(lessonKey(topic.id, subtopic.id), (current) => ({ ...current, strokes }));
              }}
            >
              <Player
                ref={playerRef}
                key={subtopic.id}
                component={TopicLesson}
                inputProps={inputProps ?? { title: subtopic.title, beats: subtopic.beats, colors }}
                durationInFrames={duration}
                compositionWidth={COMPOSITION_WIDTH}
                compositionHeight={COMPOSITION_HEIGHT}
                fps={FPS}
                controls={false}
                acknowledgeRemotionLicense
                style={{ width: '100%', height: '100%' }}
              />
            </LessonFrame>
            </div>
            {!wide && !panelOpen && (
              <div className="flex justify-center py-3">
                <OpenChatButton onClick={openChat} />
              </div>
            )}
          </div>
          {panelOpen && (
          <div className={wide ? 'flex h-full min-h-0 flex-col py-3 pr-3' : 'fixed inset-0 z-50 flex min-h-0 flex-col bg-paper p-3'}>
          <DoubtPanel
            topicId={topic.id}
            paused={!playing}
            timeLabel={formatClock(frame, FPS)}
            chapterLabel={`Ch ${String(activeIndex + 1).padStart(2, '0')}`}
            highlightAttached={strokesOnSegment(marks.strokes, active.id).length > 0}
            onClose={closePanel}
            answer={answer}
            marks={marks}
            tool={tool}
            prompts={prompts}
            onAsk={(question) => {
              patchMarks(lessonKey(topic.id, subtopic.id), (current) => ({
                ...current,
                doubts: [
                  ...current.doubts,
                  { role: 'user', text: question },
                  { role: 'krayon', text: answer },
                ],
              }));
            }}
            onNote={(text) => {
              patchMarks(lessonKey(topic.id, subtopic.id), (current) => ({
                ...current,
                notes: [...current.notes, { id: `${Date.now()}`, timestamp: formatClock(frame, FPS), text }],
              }));
            }}
            onQuizToggle={(id) => {
              patchMarks(lessonKey(topic.id, subtopic.id), (current) => {
                const quizIds = current.quizIds.includes(id)
                  ? current.quizIds.filter((item) => item !== id)
                  : [...current.quizIds, id];
                return {
                  ...current,
                  quizIds,
                  quizReady: prompts.every((prompt) => quizIds.includes(prompt.id)),
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
