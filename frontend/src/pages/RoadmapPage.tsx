import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useMatch, useParams } from 'react-router-dom';
import { CrayonSketch } from '../components/CrayonSketch.tsx';
import { FailureNotes } from '../components/FailureNotes.tsx';
import { topicFailures } from '../study/failures.ts';
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
import { lessonKey, stepStatus, topicKey, useLocalStudy } from '../study/localStudy.tsx';
import { formatClock, formatLength, topicFrames } from '../study/time.ts';
import { useUpload } from '../study/uploadState.tsx';
import { useStudySession } from '../study/studyState.ts';

const artCycle = [
  'inflation-and-interest-rates',
  'how-a-company-makes-money',
  'how-the-internet-works',
  'unit-economics',
];

const pill = 'inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[13px] font-medium';

const renderStageLabels = ['Queued', 'Writing the lesson', 'Checking the segment', 'Rendering keyframes', 'Reviewing'];

const renderTasks = (status: string | undefined, detail: string | null) => {
  const text = detail ?? '';
  const active =
    status === 'reviewing' || /review/i.test(text)
      ? 4
      : /rendering keyframes/i.test(text)
        ? 3
        : status === 'checking' || /check/i.test(text)
          ? 2
          : status === 'generating'
            ? 1
            : 0;
  return renderStageLabels.map((label, index) => ({
    label: index === 4 && active === 4 && /review/i.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : label,
    state: (index < active ? 'done' : index === active ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));
};

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
  empty?: ReactNode;
}) {
  const fallback = steps.find((step) => step.status === 'next')?.id ?? steps[0]?.id ?? null;
  const [picked, setPicked] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const selectedId = picked ?? fallback;
  const selectedIndex = steps.findIndex((step) => step.id === selectedId);
  const selected = selectedIndex >= 0 ? steps[selectedIndex] : undefined;

  const context = eyebrow || summary;

  return (
    <Shell>
      <div>
        <div className="mt-2 flex h-14 items-center gap-3">
          <Link
            to={backTo}
            aria-label={backLabel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper"
          >
            <IconBack className="h-4 w-4" />
          </Link>
          <h1 className="min-w-0 truncate font-serif text-[24px] leading-none text-ink">
            <HandUnderline>{title}</HandUnderline>
          </h1>
          <p className="min-w-0 truncate text-[14px] text-muted">{context}</p>
          {pills && <div className="ml-auto shrink-0">{pills}</div>}
        </div>
        {notice}
        {steps.length === 0 ? (
          <div className="mt-6">{empty}</div>
        ) : (
          <div
            className={
              panelOpen && selected
                ? 'mt-3 grid gap-6 min-[1200px]:grid-cols-[minmax(0,1fr)_minmax(420px,36%)]'
                : 'mt-3'
            }
          >
            <RoadmapTrail
              steps={steps}
              selectedId={panelOpen ? selectedId ?? undefined : undefined}
              onSelect={(id) => {
                setPicked(id);
                setPanelOpen(true);
              }}
            />
            {panelOpen && selected && (
              <div className="min-w-0">
                <StepPanel
                  step={selected}
                  index={selectedIndex}
                  sources={sources}
                  onAdd={onAdd}
                  onClose={() => setPanelOpen(false)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}

function StatPills({ done, total, length, quizReady }: { done: number; total: number; length?: string; quizReady: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${pill} bg-yellow`}>
        <IconCheck className="h-3.5 w-3.5" />
        {done}/{total} steps done
      </span>
      {length && (
        <span className={`${pill} bg-paper`}>
          <IconClock className="h-3.5 w-3.5" />
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
    const waiting = !session.roadmap && (session.buildingRoadmap || session.status === 'roadmap');
    let markedNext = false;
    const topicSteps: TrailStep[] = ordered.map((item, index) => {
      const lesson = session.lessons[item.id];
      const runtime = session.topics[item.id];
      const ready = Boolean(lesson);
      const marks = lessonMarks(`study:${item.id}`);
      const chapters = lesson ? generatedChapters(lesson.segments) : [];
      const built = chaptersFor(chapters, marks.watchedIds);
      const complete = ready && chapters.length > 0 && chapters.every((chapter) => marks.watchedIds.includes(chapter.id));
      const phase = runtime?.status;
      const phaseLabel =
        phase === 'failed'
          ? 'Failed'
          : phase === 'reviewing'
            ? (runtime?.statusDetail ?? 'Reviewing')
            : phase === 'checking'
              ? 'Checking'
              : phase === 'generating'
                ? 'Generating'
                : phase === 'queued'
                  ? 'Queued'
                  : undefined;
      let status: TrailStep['status'] = 'rendering';
      if (complete) status = 'done';
      else if (ready && !markedNext) {
        status = 'next';
        markedNext = true;
      } else if (ready) status = 'open';
      else if (phase === 'failed') status = 'failed';
      else if (phase === 'idle' || !phase) status = 'idle';
      const frames = chapters.reduce((total, chapter) => total + chapter.duration, 0);
      const failures = topicFailures(session, item);
      const progress = complete
        ? 100
        : ready
          ? built.progress
          : phase === 'failed'
            ? 0
            : phase === 'reviewing'
              ? 78
              : phase === 'checking'
                ? 55
                : phase === 'generating'
                  ? 32
                  : 8;
      return {
        id: item.id,
        title: item.title,
        detail: item.summary,
        status,
        artId: artCycle[index % artCycle.length],
        duration: frames ? formatClock(frames) : '',
        progress,
        timeLeft: frames ? built.timeLeft : '',
        hint: phase === 'failed' ? (runtime?.error ?? 'This lesson could not be rendered.') : ready ? undefined : (runtime?.statusDetail ?? phaseLabel),
        statusText: phaseLabel,
        href: ready ? `/study/${item.id}` : undefined,
        onRender: status === 'idle' ? () => void session.renderTopic(item.id) : undefined,
        tasks: status === 'rendering' ? renderTasks(phase, runtime?.statusDetail ?? null) : undefined,
        chapters: built.items,
        note: failures.length > 0 ? <FailureNotes items={failures} /> : undefined,
      };
    });
    const steps = topicSteps;
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
            ? `From ${session.fileName}. A topic opens once its lesson is ready.`
            : waiting
              ? 'Reading the document…'
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
        empty={
          waiting ? <CrayonSketch /> : <Button onClick={() => openUpload()}>Create a lesson from your notes</Button>
        }
      />
    );
  }

  if (!topic) return <Navigate to={home} replace />;

  const base = home === '/' ? '' : home;
  const ids = topic.subtopics.map((subtopic) => subtopic.id);
  const done = doneIds(topicKey(topic.id));
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
      href: `${base}/topics/${topic.id}/${subtopic.id}`,
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
    />
  );
}
