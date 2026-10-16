import { createContext, useContext } from 'react';
import { theme } from './remotion/theme.ts';

export type LessonColors = {
  paper: string;
  ink: string;
  muted: string;
  crayon: string;
};

const currentColors: LessonColors = {
  paper: theme.paper,
  ink: theme.ink,
  muted: theme.muted,
  crayon: theme.crayon,
};

export const PaletteContext = createContext<{ prefix: string; colors: LessonColors }>({
  prefix: '',
  colors: currentColors,
});

export const usePalette = () => useContext(PaletteContext);
