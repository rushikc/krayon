import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx.ts';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
};

export const buttonClass = (variant: 'primary' | 'secondary' = 'primary', className?: string) =>
  cx(
    'inline-flex items-center justify-center gap-2 rounded-full border-[2.5px] border-ink px-4 py-2.5 text-[15px] font-medium shadow-[3px_3px_0_var(--color-ink)] transition-transform hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-40',
    variant === 'primary' ? 'bg-crayon text-white' : 'bg-paper text-ink',
    className,
  );

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, className)} {...rest} />;
}
