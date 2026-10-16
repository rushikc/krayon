import type { ReactNode } from 'react';
import { cx } from './cx.ts';

type HandUnderlineProps = {
  children: ReactNode;
  className?: string;
  color?: string;
};

export function HandUnderline({ children, className, color = 'text-crayon' }: HandUnderlineProps) {
  return (
    <span className={cx('relative inline-block', className)}>
      <span className="relative z-10">{children}</span>
      <svg
        aria-hidden="true"
        className={cx('pointer-events-none absolute -bottom-[0.12em] left-0 h-[0.32em] w-full', color)}
        viewBox="0 0 120 12"
        preserveAspectRatio="none"
      >
        <path
          d="M1 8.2C16 3.4 28 10.4 48 6.8 68 3.2 86 9.6 119 6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
