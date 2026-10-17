import { useEffect, useId, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { topics } from '../data/topics.ts';
import { MAX_INLINE_BYTES } from '../lib/ai.ts';
import { useBackendPipeline } from '../lib/api.ts';
import { usePalette } from '../paletteState.ts';
import { topicKey, useLocalStudy } from '../study/localStudy.tsx';
import { useStudySession } from '../study/studyState.ts';
import { useUpload } from '../study/uploadState.tsx';
import { Button } from './ui/Button.tsx';
import { Chip } from './ui/Chip.tsx';
import { IconClose, IconFile, IconImage } from './ui/icons.tsx';
import { cx } from './ui/cx.ts';

type ListedFile =
  | { name: string; kind: 'pdf' | 'image'; file: File; preview?: string }
  | { name: string; kind: 'rejected' };

const classify = (file: File): ListedFile => {
  const name = file.name;
  if (file.type === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
    return { name, kind: 'pdf', file };
  }
  if (file.type.startsWith('image/')) {
    return { name, kind: 'image', file, preview: URL.createObjectURL(file) };
  }
  return { name, kind: 'rejected' };
};

type AddDocsPopupProps = {
  onClose: () => void;
};

export function AddDocsPopup({ onClose }: AddDocsPopupProps) {
  const navigate = useNavigate();
  const { prefix } = usePalette();
  const { topicId } = useUpload();
  const { addSources } = useLocalStudy();
  const { startFromFile, startFromFiles } = useStudySession();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<ListedFile[]>([]);
  const [selected, setSelected] = useState(topicId ?? topics[0].id);
  const [mode, setMode] = useState<'existing' | 'new'>(topicId ? 'existing' : 'new');
  const [files, setFiles] = useState<ListedFile[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      filesRef.current.forEach((file) => {
        if (file.kind === 'image' && file.preview) URL.revokeObjectURL(file.preview);
      });
    };
  }, []);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = dialogRef.current;
    const focusable = () =>
      [...(root?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea') ?? [])].filter(
        (node) => !node.hasAttribute('disabled'),
      );
    focusable()[0]?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list, classify)]);
    setError(null);
  };

  const removeAt = (index: number) => {
    setFiles((current) => {
      const file = current[index];
      if (file?.kind === 'image' && file.preview) URL.revokeObjectURL(file.preview);
      return current.filter((_, item) => item !== index);
    });
  };

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setOver(false);
    addFiles(event.dataTransfer.files);
  };

  const accepted = files.filter((file) => file.kind !== 'rejected');
  const home = prefix || '/';
  const base = home === '/' ? '' : home;
  const selectedTopic = topics.find((topic) => topic.id === selected) ?? topics[0];

  const addToTopic = () => {
    if (accepted.length === 0) return;
    addSources(
      topicKey(selectedTopic.id),
      accepted.map((file) => ({ name: file.name, kind: file.kind })),
    );
    onClose();
    navigate(`${base}/topics/${selectedTopic.id}`);
  };

  const createTopic = async () => {
    if (accepted.length === 0) return;
    if (accepted.some((file) => file.file.size > MAX_INLINE_BYTES)) {
      setError('That file is over 20MB. Choose a smaller PDF or photo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (useBackendPipeline) await startFromFiles(accepted.map((file) => file.file));
      else await startFromFile(accepted[0].file);
      onClose();
      navigate('/study');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The roadmap could not be created.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button type="button" aria-label="Close add documentation" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative z-10 grid max-h-[calc(100dvh-1.5rem)] w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-paper p-4 shadow-[6px_6px_0_var(--color-ink)] sm:p-5',
          files.length > 0 ? 'max-w-3xl' : 'max-w-lg',
        )}
        onKeyDown={(event: KeyboardEvent) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold tracking-[0.16em] text-crayon-text uppercase">Documentation</p>
            <h2 id={titleId} className="mt-1 font-serif text-3xl text-ink">
              Add sources
            </h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-ink">
            <IconClose className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {useBackendPipeline
            ? 'PDFs and photos only. Add them to a topic you already have, or start a lesson from every file you drop.'
            : 'PDFs and photos only. Add them to a topic you already have, or let the first file become a new topic.'}
        </p>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Where the files go">
          <Chip active={mode === 'new'} onClick={() => setMode('new')}>
            Create new topic
          </Chip>
          {topics.map((topic) => (
            <Chip
              key={topic.id}
              active={mode === 'existing' && selected === topic.id}
              onClick={() => {
                setMode('existing');
                setSelected(topic.id);
              }}
            >
              {topic.title}
            </Chip>
          ))}
        </div>

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
          onDragEnter={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cx(
            'mt-4 flex w-full shrink-0 flex-col items-center rounded-2xl border-[2.5px] border-dashed px-4 text-center',
            files.length > 0 ? 'py-3' : 'py-8',
            over ? 'border-crayon bg-yellow/40' : 'border-ink/40 bg-stone/60',
          )}
        >
          <span className="text-[16px] font-medium text-ink">Drop PDFs or photos</span>
          <span className="mt-1 text-[14px] text-muted">or click to browse</span>
        </button>

        {mode === 'new' && !useBackendPipeline && accepted.length > 1 && (
          <p className="mt-3 text-[14px] text-muted">Using the first file, {accepted[0]?.name}.</p>
        )}

        {files.length > 0 && (
          <ul className="mt-3 grid grid-cols-2 content-start gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex min-w-0 items-center gap-2 rounded-lg border-2 border-ink/20 bg-stone/50 px-1.5 py-1"
              >
                {file.kind === 'image' && file.preview ? (
                  <img src={file.preview} alt="" className="h-8 w-8 shrink-0 rounded-md border-2 border-ink object-cover" />
                ) : file.kind === 'pdf' ? (
                  <IconFile className="h-4 w-4 shrink-0 text-crayon-text" />
                ) : (
                  <IconImage className="h-4 w-4 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  {file.kind === 'rejected' ? 'Skip' : file.kind}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeAt(index)}
                  className="shrink-0 rounded-full p-0.5 text-ink"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>

        <div>
        {busy && (
          <div className="mt-3 shrink-0">
            <p className="text-[15px] text-ink">Creating your topic…</p>
            <div
              role="progressbar"
              aria-label="Creating a topic"
              aria-valuetext="Creating your topic"
              className="mt-2 h-3 overflow-hidden rounded-full bg-line"
            >
              <div className="crayon-indeterminate h-full w-1/3 rounded-full bg-crayon" />
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-[15px] text-crayon-text">{error}</p>}

        {mode === 'existing' ? (
          <Button className="mt-4 w-full shrink-0" disabled={accepted.length === 0 || busy} onClick={addToTopic}>
            Add to {selectedTopic.title}
          </Button>
        ) : (
          <Button className="mt-4 w-full shrink-0" disabled={accepted.length === 0 || busy} onClick={() => void createTopic()}>
            {busy ? 'Creating your topic…' : 'Create new topic'}
          </Button>
        )}
        </div>
      </div>
    </div>
  );
}
