import type { HTMLAttributes } from 'react';
import { cx } from './cx.ts';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  featured?: boolean;
  dashed?: boolean;
};

export const cardClass = (featured = false, dashed = false, className?: string) =>
  cx(
    'rounded-[20px] border-[2.5px] bg-paper',
    dashed
      ? 'border-dashed border-ink/40 shadow-none'
      : 'border-ink shadow-[4px_4px_0_var(--color-ink)]',
    featured && '-rotate-1',
    className,
  );

export function Card({ featured, dashed, className, ...rest }: CardProps) {
  return <div className={cardClass(featured, dashed, className)} {...rest} />;
}
