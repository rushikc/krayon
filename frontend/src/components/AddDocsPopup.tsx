import { useEffect, useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SourceFile } from '../data/topics.ts';
import { topics } from '../data/topics.ts';

type ListedFile = SourceFile | { name: string; kind: 'rejected' };

const classify = (file: File): ListedFile => {
  const name = file.name;
  if (file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return { name, kind: 'pdf' };
  }
  if (file.type.startsWith('image/')) {
    return { name, kind: 'image' };
  }
  return { name, kind: 'rejected' };
};

type AddDocsPopupProps = {
  onClose: () => void;
};

export function AddDocsPopup({ onClose }: AddDocsPopupProps) {
  const navigate = useNavigate();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [topicId, setTopicId] = useState(topics[0].id);
  const [files, setFiles] = useState<ListedFile[]>([]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list, classify)]);
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  };

  const accepted = files.filter((file): file is SourceFile => file.kind !== 'rejected');

  const continueToRoadmap = () => {
    if (accepted.length === 0) return;
    navigate(`/topics/${topicId}`, { state: { sources: accepted } });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close add documentation"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-2xl bg-paper p-5 shadow-[0_24px_60px_rgba(28,22,18,0.28)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-crayon uppercase">
              Documentation
            </p>
            <h2 id={titleId} className="mt-1 font-serif text-3xl text-ink">
              Add sources
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
        <p className="mt-2 text-sm leading-relaxed text-muted">
          PDFs and photos only. They attach to a topic that already exists.
        </p>

        <label className="mt-5 block text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
          Topic
          <select
            value={topicId}
            onChange={(event) => setTopicId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-stone px-3 py-2 text-sm font-medium tracking-normal text-ink normal-case"
          >
            {topics.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.title}
              </option>
            ))}
          </select>
        </label>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf,image/*"
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
          className="mt-4 flex w-full flex-col items-center rounded-xl border border-dashed border-line bg-stone/70 px-4 py-8 text-center"
        >
          <span className="text-sm font-medium text-ink">Drop PDFs or photos</span>
          <span className="mt-1 text-xs text-muted">or click to browse</span>
        </button>

        {files.length > 0 && (
          <ul className="mt-4 grid gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="truncate text-ink">{file.name}</span>
                <span
                  className={`shrink-0 text-[11px] tracking-[0.14em] uppercase ${
                    file.kind === 'rejected' ? 'text-crayon' : 'text-muted'
                  }`}
                >
                  {file.kind === 'rejected' ? 'Not added' : file.kind}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          type="button"
          disabled={accepted.length === 0}
          onClick={continueToRoadmap}
          className="mt-5 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-40"
        >
          Open roadmap
        </button>
      </div>
    </div>
  );
}
