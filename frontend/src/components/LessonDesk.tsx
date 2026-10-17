import { Link } from 'react-router-dom';
import type { Stamp } from '../study/localStudy.tsx';
import { cardClass } from './ui/Card.tsx';
import { TopicArt } from './ui/TopicArt.tsx';

type NextStep = {
  title: string;
  duration: string;
  href?: string;
  artId: string;
};

type LessonDeskProps = {
  sentences: string[];
  pins: Stamp[];
  onAddNote: () => void;
  onOpenStudyDoc?: () => void;
  next: NextStep | null;
};

export function LessonDesk({ sentences, pins, onAddNote, onOpenStudyDoc, next }: LessonDeskProps) {
  return (
    <div className="mt-3 grid items-start gap-3 md:grid-cols-3">
      <section className={cardClass(false, false, 'p-3')}>
        <h2 className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">In this chapter</h2>
        <ul className="mt-2 grid gap-1.5">
          {sentences.map((sentence) => (
            <li key={sentence} className="text-[14px] leading-snug text-ink">
              {sentence}
            </li>
          ))}
        </ul>
        {onOpenStudyDoc && (
          <button type="button" onClick={onOpenStudyDoc} className="mt-3 text-[14px] font-medium text-crayon-text">
            Open study doc
          </button>
        )}
      </section>

      <section className={cardClass(false, false, 'p-3')}>
        <h2 className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
          Pinned{pins.length > 0 ? ` · ${pins.length}` : ''}
        </h2>
        {pins.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">Nothing pinned at this step yet.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {pins.map((pin) => (
              <li key={pin.id} className="border-l-[3px] border-crayon pl-2 text-[14px] leading-snug text-ink">
                <span className="mr-1 font-medium text-crayon-text">{pin.timestamp}</span>
                {pin.text}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onAddNote} className="mt-3 text-[14px] font-medium text-ink">
          Add note
        </button>
      </section>

      <section className={cardClass(false, false, 'p-3')}>
        <h2 className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
          {next ? 'Up next' : 'End of the path'}
        </h2>
        {next ? (
          <div className="mt-2 flex items-center gap-2">
            <TopicArt topicId={next.artId} className="h-14 w-20 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium text-ink">{next.title}</p>
              <p className="text-[13px] text-muted">{next.duration}</p>
              {next.href ? (
                <Link to={next.href} className="mt-1 inline-block text-[14px] font-medium text-crayon-text">
                  Open
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[14px] text-muted">This is the last step.</p>
        )}
      </section>
    </div>
  );
}
