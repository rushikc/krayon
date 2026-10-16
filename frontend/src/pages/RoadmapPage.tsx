import { Link, Navigate, useMatch, useParams } from 'react-router-dom';
import { GeneratedLessonDrawer } from '../components/GeneratedLessonDrawer.tsx';
import { RoadmapTrail } from '../components/RoadmapTrail.tsx';
import type { TrailStep } from '../components/RoadmapTrail.tsx';
import { Button, buttonClass } from '../components/ui/Button.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Chip } from '../components/ui/Chip.tsx';
import { CrayonProgress } from '../components/ui/CrayonProgress.tsx';
import { HandUnderline } from '../components/ui/HandUnderline.tsx';
import { IconBack, IconFile, IconImage, IconPlus } from '../components/ui/icons.tsx';
import { Shell } from '../components/ui/Shell.tsx';
import { getTopic } from '../data/topics.ts';
import { usePalette } from '../paletteState.ts';
import { orderTopics } from '../remotion/scene.ts';
import {
  lessonKey,
  nextSubtopic,
  stepStatus,
  topicKey,
  useLocalStudy,
} from '../study/localStudy.tsx';
import { formatClock, formatLength, subtopicFrames, topicFrames } from '../study/time.ts';
import { useUpload } from '../study/uploadState.tsx';
import { useStudySession } from '../study/studyState.ts';

const artCycle = [
  'inflation-and-interest-rates',
  'how-a-company-makes-money',
  'how-the-internet-works',
  'unit-economics',
];

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
    const active = ordered.find((item) => item.id === session.activeTopicId) ?? null;
    const steps: TrailStep[] = ordered.map((item, index) => ({
      id: item.id,
      title: item.title,
      detail: item.summary,
      status: 'open',
      artId: artCycle[index % artCycle.length],
      duration: '',
      progress: session.lessons[item.id] ? 100 : 0,
      action: session.lessons[item.id] ? 'Watch again' : 'Open',
      onOpen: () => void session.openTopic(item.id),
      disabled: session.status === 'lesson',
    }));

    return (
      <Shell>
        <div className="mt-8">
          <Link to="/" className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
            <IconBack className="h-4 w-4" />
            Library
          </Link>
          <h1 className="mt-4 font-serif text-5xl text-ink">
            <HandUnderline>Roadmap</HandUnderline>
          </h1>
          <p className="mt-3 max-w-xl text-[16px] text-muted">
            {session.roadmap && session.fileName
              ? `From ${session.fileName}. Open a topic to generate its lesson.`
              : 'Add a document from the library to build a roadmap.'}
          </p>
          {session.status === 'roadmap' && <p className="mt-4 text-[16px] text-muted">Reading the document…</p>}
          {session.error && !active && <p className="mt-4 text-[16px] text-crayon-text">{session.error}</p>}
          {steps.length > 0 ? (
            <div className="mt-8">
              <RoadmapTrail steps={steps} />
            </div>
          ) : (
            <Button className="mt-6" onClick={() => openUpload()}>
              Create a lesson from your notes
            </Button>
          )}
        </div>
        {active && (
          <GeneratedLessonDrawer
            topic={active}
            lesson={session.lessons[active.id] ?? null}
            loading={session.status === 'lesson' && !session.lessons[active.id]}
            failed={session.fallbackTopicId === active.id && !session.lessons[active.id]}
            error={session.error}
            onClose={session.closeTopic}
          />
        )}
      </Shell>
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
  const percent = Math.round((done.length / topic.subtopics.length) * 100);
  const quizReady = topic.subtopics.filter(
    (subtopic) => lessonMarks(lessonKey(topic.id, subtopic.id)).quizReady,
  ).length;
  const sources = sourceList(topicKey(topic.id));

  const steps: TrailStep[] = topic.subtopics.map((subtopic, index) => {
    const status = stepStatus(done, ids, subtopic.id);
    const marks = lessonMarks(lessonKey(topic.id, subtopic.id));
    const watched = Math.round((marks.watchedIds.length / subtopic.beats.length) * 100);
    return {
      id: subtopic.id,
      title: subtopic.title,
      detail: `${subtopic.beats.length}-part lesson`,
      status,
      artId: artCycle[index % artCycle.length],
      duration: formatClock(subtopicFrames(subtopic.beats.length)),
      progress: status === 'done' ? 100 : watched,
      action: status === 'done' ? 'Watch again' : 'Resume',
      hint: status === 'locked' ? `Finish step ${currentIndex + 1} first` : undefined,
      href: status === 'locked' ? undefined : `${base}/topics/${topic.id}/${subtopic.id}`,
    };
  });

  return (
    <Shell>
      <div className="mt-6 grid items-start gap-10 lg:mt-10 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:gap-12">
        <div>
          <Link to={home} className="inline-flex items-center gap-1 text-[15px] font-medium text-ink">
            <IconBack className="h-4 w-4" />
            All topics
          </Link>
          <p className="mt-5 text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">
            {topic.field}
          </p>
          <h1 className="mt-2 font-serif text-5xl leading-[1.05] text-ink">
            <HandUnderline>{topic.title}</HandUnderline>
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{topic.howTo}</p>
          <dl className="mt-6 flex flex-wrap gap-6">
            <div>
              <dt className="font-serif text-3xl text-ink">
                {done.length}
                <span className="text-muted"> / {topic.subtopics.length}</span>
              </dt>
              <dd className="text-[13px] text-muted">steps done</dd>
            </div>
            <div>
              <dt className="font-serif text-3xl text-ink">{formatLength(topicFrames(topic))}</dt>
              <dd className="text-[13px] text-muted">total</dd>
            </div>
            <div>
              <dt className="font-serif text-3xl text-ink">{quizReady}</dt>
              <dd className="text-[13px] text-muted">quiz ready</dd>
            </div>
          </dl>
          <div className="mt-4 max-w-xs">
            <CrayonProgress value={percent} label={`${topic.title} progress`} showValue />
          </div>
          <Link to={`${base}/topics/${topic.id}/${current.id}`} className={buttonClass('primary', 'mt-5')}>
            {finished ? 'Review step 1' : `Resume step ${currentIndex + 1}`}
          </Link>
          <Card className="mt-6 p-4">
            <h2 className="font-serif text-2xl text-ink">Sources</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.map((source) => (
                <Chip key={source.name}>
                  {source.kind === 'pdf' ? <IconFile className="h-4 w-4" /> : <IconImage className="h-4 w-4" />}
                  <span className="max-w-[14rem] truncate">{source.name}</span>
                </Chip>
              ))}
              <Chip onClick={() => openUpload(topic.id)}>
                <IconPlus className="h-4 w-4" />
                Add
              </Chip>
            </div>
          </Card>
        </div>
        <RoadmapTrail steps={steps} />
      </div>
    </Shell>
  );
}
