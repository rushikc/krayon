import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { LessonTool } from './LessonFrame.tsx';
import { IconArrow, IconClose, IconPin } from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';
import type { LessonMarks } from '../study/localStudy.tsx';

type DoubtPanelProps = {
  paused: boolean;
  timeLabel: string;
  answer: string;
  marks: LessonMarks;
  tool: LessonTool | null;
  prompts: { id: string; text: string }[];
  onAsk: (question: string) => void;
  onExplain: () => void;
  onPin: (text: string) => void;
  onNote: (text: string) => void;
  onQuizToggle: (id: string) => void;
  onQuiz: () => void;
  chapterLabel: string;
  highlightAttached: boolean;
  onClose: () => void;
  topicId?: string;
};

export function DoubtPanel({
  paused,
  timeLabel,
  answer,
  marks,
  tool,
  prompts,
  onAsk,
  onExplain,
  onPin,
  onNote,
  onQuizToggle,
  onQuiz,
  chapterLabel,
  highlightAttached,
  onClose,
  topicId,
}: DoubtPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const checked = prompts.filter((prompt) => marks.quizIds.includes(prompt.id)).length;

  useEffect(() => {
    if (tool === 'ask') inputRef.current?.focus();
  }, [tool]);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [draft]);

  const sendQuestion = (question: string) => {
    const text = question.trim();
    if (!text) return;
    onAsk(text);
    setDraft('');
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    sendQuestion(draft);
  };

  const onComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendQuestion(draft);
    }
  };

  const saveNote = (event: FormEvent) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) return;
    onNote(text);
    setNote('');
  };

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border-[2.5px] border-ink bg-paper shadow-[5px_5px_0_var(--color-ink)]">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="font-serif text-[20px] leading-none text-ink">Ask about this moment</h2>
        <button
          type="button"
          aria-label="Close ask panel"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink"
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 pb-2">
        <p className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-ink bg-stone px-1.5 py-1 text-[13px] text-ink">
          {topicId && <TopicArt topicId={topicId} className="h-6 w-9 shrink-0 overflow-hidden rounded-sm bg-chalk" />}
          <span className="truncate">
            {paused ? 'Paused at' : 'At'} {timeLabel} · {chapterLabel}
            {highlightAttached ? ' · highlight attached' : ''}
          </span>
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-1">
        {marks.doubts.map((turn, index) =>
          turn.role === 'user' ? (
            <p
              key={`${turn.role}-${index}`}
              className="max-w-[90%] self-end rounded-2xl rounded-br-md bg-ink px-2.5 py-1.5 text-[14px] leading-snug text-paper"
            >
              {turn.text}
            </p>
          ) : (
            <div key={`${turn.role}-${index}`} className="rounded-2xl border-[1.5px] border-ink bg-white px-2.5 py-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-crayon-text uppercase">Krayon</p>
              <p className="mt-1 text-[14px] leading-snug text-ink">{turn.text}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" onClick={onExplain} className={miniClass}>
                  Explain longer
                </button>
                <button type="button" onClick={() => onPin(turn.text)} className={miniClass}>
                  <IconPin className="h-3.5 w-3.5" />
                  Pin
                </button>
              </div>
            </div>
          ),
        )}
        {marks.doubts.length === 0 && (
          <div className="rounded-2xl border-[1.5px] border-ink bg-white px-2.5 py-2">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-crayon-text uppercase">Krayon</p>
            <p className="mt-1 text-[14px] leading-snug text-ink">{answer}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={onExplain} className={miniClass}>
                Explain longer
              </button>
              <button type="button" onClick={() => onPin(answer)} className={miniClass}>
                <IconPin className="h-3.5 w-3.5" />
                Pin
              </button>
            </div>
          </div>
        )}

        {tool === 'note' && (
          <form onSubmit={saveNote} className="grid gap-2">
            <label htmlFor={`${inputId}-note`} className="text-[14px] font-medium text-ink">
              Note at {timeLabel}
            </label>
            <textarea
              id={`${inputId}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="rounded-xl border-2 border-ink bg-paper px-3 py-2 text-[14px] text-ink"
              placeholder="Write a note for this moment"
            />
            <button type="submit" disabled={note.trim().length === 0} className={miniClass}>
              Save note
            </button>
          </form>
        )}

        {marks.notes.length > 0 && (
          <ul className="grid gap-1">
            {marks.notes.map((item) => (
              <li key={item.id} className="text-[14px] text-ink">
                <span className="mr-2 font-medium text-muted">{item.timestamp}</span>
                {item.text}
              </li>
            ))}
          </ul>
        )}

        {tool === 'quiz' && (
          <fieldset className="grid gap-2">
            <legend className="text-[14px] font-medium text-ink">
              Quiz · {checked} of {prompts.length} ready
            </legend>
            {prompts.map((prompt) => (
              <label key={prompt.id} className="flex items-start gap-2 text-[14px] text-ink">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={marks.quizIds.includes(prompt.id)}
                  onChange={() => onQuizToggle(prompt.id)}
                />
                <span>{prompt.text}</span>
              </label>
            ))}
            {marks.quizReady && <p className="text-[14px] font-medium text-done">Quiz ready</p>}
          </fieldset>
        )}
      </div>

      <div className="shrink-0 px-3 pt-2 pb-3">
        <div className="flex gap-1.5 overflow-x-auto">
          <button type="button" onClick={() => sendQuestion('Explain this more simply')} className={chipClass}>
            Explain simpler
          </button>
          <button type="button" onClick={() => sendQuestion('Give an example')} className={chipClass}>
            Give an example
          </button>
          <button type="button" onClick={onQuiz} className={chipClass}>
            Quiz me
          </button>
        </div>
        <form onSubmit={send} className="relative mt-2">
          <label htmlFor={inputId} className="sr-only">
            Ask a follow-up
          </label>
          <textarea
            ref={inputRef}
            id={inputId}
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Ask a follow-up…"
            className="max-h-36 min-h-[4.75rem] w-full resize-none rounded-2xl border-2 border-ink bg-paper py-2 pr-12 pl-3 text-[14px] text-ink"
          />
          <button
            type="submit"
            aria-label="Send question"
            className="absolute right-2 bottom-2 flex h-8 w-8 items-center justify-center rounded-full bg-crayon text-white"
          >
            <IconArrow className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1 text-[12px] text-muted">Enter to send · Shift+Enter for new line</p>
      </div>
    </aside>
  );
}

const chipClass = 'shrink-0 rounded-full border-2 border-ink bg-paper px-2.5 py-1 text-[13px] font-medium text-ink';
const miniClass =
  'inline-flex h-7 items-center gap-1 rounded-full border-[1.5px] border-ink bg-paper px-2 text-[13px] font-medium text-ink disabled:opacity-40';
