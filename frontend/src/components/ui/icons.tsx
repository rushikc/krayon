import type { ReactNode } from 'react';

type IconProps = {
  className?: string;
  title?: string;
};

function Svg({ className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'h-5 w-5 shrink-0'}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <g transform="translate(28.4 28.4) rotate(-45)">
        <rect x="-4.6" y="-31" width="9.2" height="16" rx="1.6" fill="var(--color-ink)" />
        <rect x="-4.6" y="-23.5" width="9.2" height="4" fill="var(--color-yellow)" />
        <path d="M0 0 L-6.5 -17 H6.5 Z" fill="var(--color-crayon)" />
      </g>
    </svg>
  );
}

export function IconPause(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 5.4v13.2M16 5.4v13.2" />
    </Svg>
  );
}

export function IconPlay(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.4 5.6c-.6-.4-.4.6 0 6.8.2 3 .3 5.6.9 5.8 1.2.4 9.4-5.2 9.8-6.1.3-.9-8.8-6-10.7-6.5z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 12.4c1.6 1.1 3 3.6 4.4 5.4C11.4 14 15.2 8.2 19.6 5.6" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5.5" y="10.5" width="13" height="9" rx="1.6" />
      <path d="M8.2 10.6V8a3.8 3.8 0 0 1 7.6.1v2.5" />
    </Svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 3.6h6.4L18.2 8.6V20.4H6.5z" />
      <path d="M12.6 3.8v5.1h5.2" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.8" y="5" width="16.4" height="14" rx="2" />
      <path d="M4.4 15.6l4.1-3.4 3.2 2.5 2.5-1.8 5.2 4" />
      <circle cx="9" cy="9.4" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.2h6.2l-.7 6.4 2.6 2.2H7.1l2.5-2.2z" />
      <path d="M12 13.2V20" />
    </Svg>
  );
}

export function IconNote(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.4 3.6h7.4l3.8 3.8V20.4H6.4z" />
      <path d="M13.6 3.8V8h4" />
      <path d="M9 12.4h6" />
      <path d="M9 16h3.6" />
    </Svg>
  );
}

export function IconHighlight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.2 3.6l6.2 6.2-9.4 9.4H4.8v-6.2z" />
      <path d="M12.6 5.2l6.2 6.2" />
    </Svg>
  );
}

export function IconQuiz(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.2 9.5a2.8 2.8 0 1 1 3.5 2.7c-.8.3-1.1.9-1.1 1.7" />
      <path d="M11.6 16.8h.2" />
    </Svg>
  );
}

export function IconAsk(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 6.2h12.4c.8 0 1.4.6 1.4 1.4v6c0 .8-.6 1.4-1.4 1.4H10l-3.4 2.8v-2.8H5.8c-.7 0-1.3-.6-1.3-1.4V7.6c0-.8.6-1.4 1.3-1.4z" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5.2v13.6M5.2 12h13.6" />
    </Svg>
  );
}

export function IconArrow(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 12h13.2" />
      <path d="M13 6.6l5.6 5.4L13 17.4" />
    </Svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.6 5.4L8 12l6.6 6.6" />
    </Svg>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 8.1V12l2.8 2" />
    </Svg>
  );
}

export function IconVolume(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 9.2h3.2l4.2-3.2v12l-4.2-3.2H4.8z" />
      <path d="M15.2 9.2c1.2.8 1.8 1.8 1.8 2.8s-.6 2-1.8 2.8" />
      <path d="M17.4 7c2 .1 3.2 2.2 3.2 5s-1.2 4.6-3.2 5" />
    </Svg>
  );
}

export function IconMuted(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.8 9.2h3.2l4.2-3.2v12l-4.2-3.2H4.8z" />
      <path d="M16 10l4 4M20 10l-4 4" />
    </Svg>
  );
}

export function IconFullscreen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 9.2V5.4h3.8M15.2 5.4H19V9.2M19 14.8v3.8h-3.8M8.8 18.6H5v-3.8" />
    </Svg>
  );
}
