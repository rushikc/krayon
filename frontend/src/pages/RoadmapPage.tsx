import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useMatch, useParams } from 'react-router-dom';
import { RoadmapTrail, StepPanel } from '../components/RoadmapTrail.tsx';
import type { TrailChapter, TrailStep } from '../components/RoadmapTrail.tsx';
import { Button } from '../components/ui/Button.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconBack, IconCheck, IconClock } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import type { SourceFile, Subtopic } from '../data/topics.ts';
import { getTopic } from '../data/topics.ts';
import { usePalette } from '../paletteState.ts';
import { orderTopics } from '../remotion/scene.ts';
import { curatedChapters, generatedChapters } from '../study/chapters.ts';
import type { Chapter } from '../study/chapters.ts';
import { lessonKey, nextSubtopic, stepStatus, topicKey, useLocalStudy } from '../study/localStudy.tsx';
import { formatClock, formatLength, topicFrames } from '../study/time.ts';
import { useUpload } from '../study/uploadState.tsx';
import { useStudySession } from '../study/studyState.ts';

const artCycle = [
  'inflation-and-interest-rates',
  'how-a-company-makes-money',
  'how-the-internet-works',
  'unit-economics',
];

const pill = 'inline-flex items-center gap-2 rounded-full border-2 border-ink px-3.5 py-2 text-[15px] font-medium';

function chaptersFor(chapters: Chapter[], watchedIds: string[]): { items: TrailChapter[]; progress: number; timeLeft: string } {
  const watched = new Set(watchedIds);
  let markedResume = false;
  const items = chapters.map((chapter) => {
    let state: TrailChapter['state'] = 'later';
    if (watched.has(chapter.id)) state = 'watched';
    else if (!markedResume) {
      state = 'resume';
      markedResume = true;
    }
    return {
      id: chapter.id,
      title: chapter.title,
      duration: formatClock(chapter.duration),
      state,
    };
  });
  const total = chapters.reduce((sum, chapter) => sum + chapter.duration, 0);
  const seen = chapters.filter((chapter) => watched.has(chapter.id)).reduce((sum, chapter) => sum + chapter.duration, 0);
  return {
    items,
    progress: total === 0 ? 0 : Math.round((seen / total) * 100),
    timeLeft: formatClock(Math.max(0, total - seen)),
  };
}

function RoadmapLayout({
  backTo,
  backLabel,
  eyebrow,
  title,
  summary,
  pills,
  notice,
  steps,
  sources,
  onAdd,
  legend,
  empty,
}: {
  backTo: string;
  backLabel: string;
  eyebrow?: string;
  title: string;
  summary: string;
  pills?: ReactNode;
  notice?: ReactNode;
  steps: TrailStep[];
  sources?: SourceFile[];
  onAdd?: () => void;
  legend: 'locked' | 'ready';
  empty?: ReactNode;
}) {
  const fallback = steps.find((step) => step.status === 'next')?.id ?? steps[0]?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const selectedId = picked ?? fallback;
  const selectedIndex = steps.findIndex((step) => step.id === selectedId);
  const selected = selectedIndex >= 0 ? steps[selectedIndex] : undefined;

  return (
    <Shell>
      <div className="mt-6 lg:mt-8">
        <Link to={backTo} className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
          <IconBack className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            {eyebrow && (
              <p className="text-[12px] font-semibold tracking-[0.16em] text-muted uppercase">{eyebrow}</p>
            )}
            <h1 className="mt-2 font-serif text-5xl leading-[1.05] text-ink">
              <HandUnderline>{title}</HandUnderline>
            </h1>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">{summary}</p>
          </div>
          {pills}
        </div>
        {notice}
        {steps.length === 0 ? (
          <div className="mt-6">{empty}</div>
        ) : (
          <div
            className={
              panelOpen && selected
                ? 'mt-8 grid items-start gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(420px,36%)]'
                : 'mt-8'
            }
          >
            <RoadmapTrail
              steps={steps}
              selectedId={panelOpen ? selectedId ?? undefined : undefined}
              legend={legend}
              onSelect={(id) => {
                setPicked(id);
                setPanelOpen(true);
              }}
            />
            {panelOpen && selected && (
              <StepPanel
                step={selected}
                index={selectedIndex}
                sources={sources}
                onAdd={onAdd}
                onClose={() => setPanelOpen(false)}
              />
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function StatPills({ done, total, length, quizReady }: { done: number; total: number; length?: string; quizReady: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className={`${pill} bg-yellow`}>
        <IconCheck className="h-4 w-4" />
        {done}/{total} steps done
      </span>
      {length && (
        <span className={`${pill} bg-paper`}>
          <IconClock className="h-4 w-4" />
          {length} total
        </span>
      )}
      <span className={`${pill} bg-paper`}>{quizReady} quiz ready</span>
    </div>
  );
}

export function RoadmapPage() {
  const { topicId } = useParams();
  const isStudy = useMatch('/study');
  const session = useStudySession();
  const { prefix } = usePalette();
  const { openUpload } = useUpload();
  const { doneIds, lessonMarks, sourceList } = useLocalStudy();
  const topic = topicId ? getTopic(topicId) : undefined;
  const home = prefix || '/';

  if (isStudy) {
    const ordered = session.roadmap ? orderTopics(session.roadmap.topics) : [];
    let markedNext = false;
    const steps: TrailStep[] = ordered.map((item, index) => {
      const lesson = session.lessons[item.id];
      const marks = lessonMarks(`study:${item.id}`);
      const chapters = lesson ? generatedChapters(lesson.segments) : [];
      const built = chaptersFor(chapters, marks.watchedIds);
      const complete = chapters.length > 0 && chapters.every((chapter) => marks.watchedIds.includes(chapter.id));
      let status: TrailStep['status'] = 'open';
      if (complete) status = 'done';
      else if (!markedNext) {
        status = 'next';
        markedNext = true;
      }
      const frames = chapters.reduce((total, chapter) => total + chapter.duration, 0);
      return {
        id: item.id,
        title: item.title,
        detail: item.summary,
        status,
        artId: artCycle[index % artCycle.length],
        duration: frames ? formatClock(frames) : '',
        progress: status === 'done' ? 100 : built.progress,
        timeLeft: frames ? built.timeLeft : '',
        href: `/study/${item.id}`,
        chapters: built.items,
      };
    });
    const doneCount = steps.filter((step) => step.status === 'done').length;
    const quizReady = ordered.filter((item) => lessonMarks(`study:${item.id}`).quizReady).length;
    const totalFrames = ordered.reduce((total, item) => {
      const lesson = session.lessons[item.id];
      return total + (lesson?.segments.reduce((sum, segment) => sum + segment.durationInFrames, 0) ?? 0);
    }, 0);
    const fileName = session.fileName ?? '';
    const sources: SourceFile[] = fileName
      ? [{ name: fileName, kind: /\.(png|jpe?g|gif|webp)$/i.test(fileName) ? 'image' : 'pdf' }]
      : [];

    return (
      <RoadmapLayout
        backTo="/"
        backLabel="Library"
        title="Roadmap"
        summary={
          session.roadmap && session.fileName
            ? `From ${session.fileName}. Open a topic to generate its lesson.`
            : 'Add a document from the library to build a roadmap.'
        }
        pills={
          steps.length > 0 ? (
            <StatPills
              done={doneCount}
              total={steps.length}
              length={totalFrames ? formatLength(totalFrames) : undefined}
              quizReady={quizReady}
            />
          ) : undefined
        }
        notice={
          session.error ? <p className="mt-4 text-[16px] text-crayon-text">{session.error}</p> : undefined
        }
        steps={steps}
        sources={sources}
        onAdd={() => openUpload()}
        legend="ready"
        empty={
          session.status === 'roadmap' ? (
            <p className="text-[16px] text-muted">Reading the document…</p>
          ) : (
            <Button onClick={() => openUpload()}>Create a lesson from your notes</Button>
          )
        }
      />
    );
  }

  if (!topic) return <Navigate to={home} replace />;

  const base = home === '/' ? '' : home;
  const ids = topic.subtopics.map((subtopic) => subtopic.id);
  const done = doneIds(topicKey(topic.id));
  const current = nextSubtopic(topic, done);
  const currentIndex = Math.max(
    0,
    topic.subtopics.findIndex((subtopic) => subtopic.id === current.id),
  );
  const finished = done.length >= topic.subtopics.length;
  const quizReady = topic.subtopics.filter((subtopic) => lessonMarks(lessonKey(topic.id, subtopic.id)).quizReady).length;

  const stepFrom = (subtopic: Subtopic): TrailStep => {
    const status = finished ? 'done' : stepStatus(done, ids, subtopic.id);
    const marks = lessonMarks(lessonKey(topic.id, subtopic.id));
    const built = chaptersFor(curatedChapters(subtopic), marks.watchedIds);
    return {
      id: subtopic.id,
      title: subtopic.title,
      detail: subtopic.beats[0] ?? '',
      status,
      artId: topic.id,
      duration: formatClock(curatedChapters(subtopic).reduce((total, chapter) => total + chapter.duration, 0)),
      progress: status === 'done' ? 100 : built.progress,
      timeLeft: built.timeLeft,
      hint: status === 'locked' ? `Finish step ${currentIndex + 1} first` : undefined,
      href: status === 'locked' ? undefined : `${base}/topics/${topic.id}/${subtopic.id}`,
      chapters: built.items,
    };
  };

  return (
    <RoadmapLayout
      backTo={home}
      backLabel="All topics"
      eyebrow={`${topic.field} · Roadmap`}
      title={topic.title}
      summary={topic.howTo}
      pills={
        <StatPills
          done={done.length}
          total={topic.subtopics.length}
          length={formatLength(topicFrames(topic))}
          quizReady={quizReady}
        />
      }
      steps={topic.subtopics.map(stepFrom)}
      sources={sourceList(topicKey(topic.id))}
      onAdd={() => openUpload(topic.id)}
      legend="locked"
    />
  );
}
