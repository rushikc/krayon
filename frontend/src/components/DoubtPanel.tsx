import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { LessonTool } from './LessonFrame.tsx';
import { Button } from './ui/Button.tsx';
import { Card } from './ui/Card.tsx';
import { IconArrow, IconPin } from './ui/icons.tsx';
import { TopicArt } from './ui/TopicArt.tsx';
import type { LessonMarks } from '../study/localStudy.tsx';

type DoubtPanelProps = {
  topicId: string;
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
};

export function DoubtPanel({
  topicId,
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
}: DoubtPanelProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const checked = prompts.filter((prompt) => marks.quizIds.includes(prompt.id)).length;

  useEffect(() => {
    if (tool === 'ask') inputRef.current?.focus();
  }, [tool]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question) return;
    onAsk(question);
    setDraft('');
  };

  const saveNote = (event: FormEvent) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) return;
    onNote(text);
    setNote('');
  };

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-paper p-2">
        <TopicArt topicId={topicId} className="h-14 w-20 shrink-0" />
        <div>
          <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
            {paused ? 'Paused at' : 'At'}
          </p>
          <p className="font-serif text-2xl leading-none text-ink">{timeLabel}</p>
        </div>
      </div>

      <div className="grid max-h-[28rem] gap-3 overflow-y-auto">
        {marks.doubts.map((turn, index) =>
          turn.role === 'user' ? (
            <p
              key={`${turn.role}-${index}`}
              className="justify-self-end max-w-[90%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[15px] text-paper"
            >
              {turn.text}
            </p>
          ) : (
            <div key={`${turn.role}-${index}`} className="rounded-2xl border-[2.5px] border-ink bg-paper p-3">
              <p className="text-[12px] font-semibold tracking-[0.14em] text-crayon-text uppercase">Krayon</p>
              <p className="mt-2 text-[15px] leading-relaxed text-ink">{turn.text}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button className="px-3 py-1.5" onClick={onExplain}>
                  Explain longer
                </Button>
                <Button variant="secondary" className="px-3 py-1.5" onClick={() => onPin(turn.text)}>
                  <IconPin className="h-4 w-4" />
                  Pin
                </Button>
              </div>
            </div>
          ),
        )}
        {marks.doubts.length === 0 && (
          <div className="rounded-2xl border-[2.5px] border-ink bg-paper p-3">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-crayon-text uppercase">Krayon</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{answer}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button className="px-3 py-1.5" onClick={onExplain}>
                Explain longer
              </Button>
              <Button variant="secondary" className="px-3 py-1.5" onClick={() => onPin(answer)}>
                <IconPin className="h-4 w-4" />
                Pin
              </Button>
            </div>
          </div>
        )}
      </div>

      {marks.pins.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">Pinned</p>
          <ul className="mt-2 grid gap-2">
            {marks.pins.map((pin) => (
              <li key={pin.id} className="border-l-[3px] border-crayon pl-3 text-[15px] text-ink">
                <span className="mr-2 font-medium text-crayon-text">{pin.timestamp}</span>
                {pin.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tool === 'note' && (
        <form onSubmit={saveNote} className="grid gap-2">
          <label htmlFor={`${inputId}-note`} className="text-[15px] font-medium text-ink">
            Note at {timeLabel}
          </label>
          <textarea
            id={`${inputId}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="rounded-xl border-[2.5px] border-ink bg-paper px-3 py-2 text-[15px] text-ink"
            placeholder="Write a note for this moment"
          />
          <Button type="submit" disabled={note.trim().length === 0}>
            Save note
          </Button>
        </form>
      )}

      {marks.notes.length > 0 && (
        <ul className="grid gap-2">
          {marks.notes.map((item) => (
            <li key={item.id} className="text-[15px] text-ink">
              <span className="mr-2 font-medium text-muted">{item.timestamp}</span>
              {item.text}
            </li>
          ))}
        </ul>
      )}

      {tool === 'quiz' && (
        <fieldset className="grid gap-2">
          <legend className="text-[15px] font-medium text-ink">
            Quiz · {checked} of {prompts.length} ready
          </legend>
          {prompts.map((prompt) => (
            <label key={prompt.id} className="flex items-start gap-2 text-[15px] text-ink">
              <input
                type="checkbox"
                className="mt-1"
                checked={marks.quizIds.includes(prompt.id)}
                onChange={() => onQuizToggle(prompt.id)}
              />
              <span>{prompt.text}</span>
            </label>
          ))}
          {marks.quizReady && <p className="text-[15px] font-medium text-done">Quiz ready</p>}
        </fieldset>
      )}

      <form onSubmit={send} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          Ask a follow-up
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a follow-up…"
          className="min-w-0 flex-1 rounded-full border-[2.5px] border-ink bg-paper px-4 py-2 text-[15px] text-ink"
        />
        <button
          type="submit"
          aria-label="Send question"
          className="flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-ink bg-crayon text-white"
        >
          <IconArrow className="h-4 w-4" />
        </button>
      </form>
    </Card>
  );
}
