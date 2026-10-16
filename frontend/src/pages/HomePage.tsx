import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AddDocsPopup } from '../components/AddDocsPopup.tsx';
import { topics } from '../data/topics.ts';
import { usePalette } from '../paletteState.ts';

export function HomePage() {
  const { prefix } = usePalette();
  const [adding, setAdding] = useState(false);

  return (
    <div className="min-h-full px-5 py-6 md:px-10 md:py-8">
      <header className="mx-auto flex max-w-6xl flex-col items-start gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.22em] text-crayon uppercase">Krayon</p>
          <h1 className="mt-2 font-serif text-4xl leading-none text-ink md:text-5xl">Topics</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Curated paths through economy, business, and software. Open one, or attach PDFs and
            photos to a path that already exists.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper"
        >
          Add documentation
        </button>
      </header>

      <ul className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2">
        {topics.map((topic) => (
          <li key={topic.id}>
            <Link
              to={`${prefix}/topics/${topic.id}`}
              className="flex h-full flex-col rounded-2xl border border-line bg-paper px-5 py-5 transition-colors hover:border-crayon"
            >
              <span className="text-[11px] font-semibold tracking-[0.16em] text-crayon uppercase">
                {topic.field}
              </span>
              <span className="mt-2 font-serif text-2xl leading-tight text-ink">{topic.title}</span>
              <span className="mt-2 text-sm leading-relaxed text-muted">{topic.summary}</span>
              <span className="mt-4 text-xs tracking-[0.08em] text-muted uppercase">
                {topic.subtopics.length} steps
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {adding && <AddDocsPopup onClose={() => setAdding(false)} />}
    </div>
  );
}
