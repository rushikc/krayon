import { useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { LessonDrawer } from '../components/LessonDrawer.tsx';
import type { SourceFile, Subtopic } from '../data/topics.ts';
import { getTopic } from '../data/topics.ts';

const readSources = (state: unknown): SourceFile[] => {
  if (!state || typeof state !== 'object' || !('sources' in state)) return [];
  const sources = state.sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (source): source is SourceFile =>
      !!source &&
      typeof source === 'object' &&
      'name' in source &&
      typeof source.name === 'string' &&
      'kind' in source &&
      (source.kind === 'pdf' || source.kind === 'image'),
  );
};

export function RoadmapPage() {
  const { topicId } = useParams();
  const location = useLocation();
  const topic = topicId ? getTopic(topicId) : undefined;
  const sources = readSources(location.state);
  const [open, setOpen] = useState<Subtopic | null>(null);

  if (!topic) return <Navigate to="/" replace />;

  return (
    <div className="min-h-full px-5 py-6 md:px-10 md:py-8">
      <header className="mx-auto max-w-3xl">
        <Link to="/" className="text-[11px] font-semibold tracking-[0.18em] text-crayon uppercase">
          Krayon
        </Link>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          {topic.field}
        </p>
        <h1 className="mt-2 font-serif text-4xl leading-none text-ink md:text-5xl">{topic.title}</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">{topic.howTo}</p>
        {sources.length > 0 && (
          <div className="mt-5 rounded-2xl border border-line bg-paper px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              Sources added
            </p>
            <ul className="mt-2 grid gap-1">
              {sources.map((source) => (
                <li key={source.name} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink">{source.name}</span>
                  <span className="text-[11px] tracking-[0.14em] text-muted uppercase">
                    {source.kind}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </header>

      <ol className="mx-auto mt-10 grid max-w-3xl">
        {topic.subtopics.map((subtopic, index) => (
          <li key={subtopic.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
            <div className="flex flex-col items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-crayon bg-paper text-sm font-medium text-ink">
                {index + 1}
              </span>
              {index < topic.subtopics.length - 1 && <span className="w-px flex-1 bg-line" />}
            </div>
            <button
              type="button"
              onClick={() => setOpen(subtopic)}
              className="mb-4 rounded-2xl border border-line bg-paper px-4 py-4 text-left transition-colors hover:border-crayon"
            >
              <span className="block font-serif text-2xl leading-tight text-ink">
                {subtopic.title}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {subtopic.beats.length} part lesson
              </span>
            </button>
          </li>
        ))}
      </ol>

      {open && <LessonDrawer subtopic={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
