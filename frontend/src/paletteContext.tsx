import type { CSSProperties, ReactNode } from 'react';
import type { Palette } from './palettes.ts';
import { PaletteContext } from './paletteState.ts';

type PaletteScopeProps = {
  palette: Palette;
  children: ReactNode;
};

export function PaletteScope({ palette, children }: PaletteScopeProps) {
  const style = {
    '--color-stone': palette.stone,
    '--color-paper': palette.paper,
    '--color-line': palette.line,
    '--color-ink': palette.ink,
    '--color-muted': palette.muted,
    '--color-crayon': palette.crayon,
    '--color-crayon-text': palette.crayonText,
    '--color-yellow': palette.yellow,
    '--color-done': palette.done,
    '--color-done-fill': palette.doneFill,
    '--color-focus': palette.focus,
    '--color-chalk': palette.chalk,
    '--color-dot': palette.dot,
    backgroundColor: palette.stone,
    backgroundImage: 'radial-gradient(var(--color-dot) 1.15px, transparent 1.15px)',
    backgroundSize: '16px 16px',
    color: palette.ink,
    minHeight: '100%',
  } as CSSProperties;

  return (
    <PaletteContext.Provider
      value={{
        prefix: `/preview/${palette.id}`,
        colors: {
          paper: palette.paper,
          ink: palette.ink,
          muted: palette.muted,
          crayon: palette.crayon,
        },
      }}
    >
      <div style={style}>
        <p className="border-b border-line px-5 py-2 text-center text-[11px] tracking-[0.16em] text-muted uppercase">
          Preview · {palette.name}
        </p>
        {children}
      </div>
    </PaletteContext.Provider>
  );
}
