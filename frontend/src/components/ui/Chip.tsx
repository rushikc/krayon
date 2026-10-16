import type { ReactNode } from 'react';
import { cx } from './cx.ts';

type ChipProps = {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
};

export function Chip({ active, children, className, onClick }: ChipProps) {
  const look = cx(
    'inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-[15px] font-medium',
    active ? 'border-ink bg-ink text-paper' : 'border-ink/80 bg-paper text-ink',
    className,
  );
  if (!onClick) return <span className={look}>{children}</span>;
  return (
    <button type="button" onClick={onClick} className={look} aria-pressed={active}>
      {children}
    </button>
  );
}
