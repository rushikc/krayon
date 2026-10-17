export type Palette = {
  id: string;
  name: string;
  stone: string;
  paper: string;
  line: string;
  ink: string;
  muted: string;
  crayon: string;
  crayonText: string;
  yellow: string;
  done: string;
  doneFill: string;
  focus: string;
  chalk: string;
  trail: string;
  dot: string;
};

export const previewPalettes: Palette[] = [
  {
    id: 'paper',
    name: 'Cool paper',
    stone: '#f2f1ef',
    paper: '#fbfbfa',
    line: '#e4e2de',
    ink: '#1c1b19',
    muted: '#6b6762',
    crayon: '#e4572e',
    crayonText: '#b8401f',
    yellow: '#f2c14e',
    done: '#217a45',
    doneFill: '#3c9a55',
    focus: '#3d6fb6',
    chalk: '#1a2420',
    trail: '#c9c4bb',
    dot: 'rgba(28, 27, 25, 0.12)',
  },
  {
    id: 'ink',
    name: 'Ink and blue',
    stone: '#eef1f4',
    paper: '#f8fafb',
    line: '#d9e0e6',
    ink: '#1a1d23',
    muted: '#5c6570',
    crayon: '#2f5d9f',
    crayonText: '#1e4a86',
    yellow: '#e2b84a',
    done: '#1f7a4a',
    doneFill: '#2f8f5a',
    focus: '#3d6fb6',
    chalk: '#1a2420',
    trail: '#b7c3d0',
    dot: 'rgba(26, 29, 35, 0.12)',
  },
  {
    id: 'chalk',
    name: 'Chalkboard',
    stone: '#121614',
    paper: '#1c2420',
    line: '#2c3832',
    ink: '#f3efe6',
    muted: '#a39e93',
    crayon: '#d6f26a',
    crayonText: '#d6f26a',
    yellow: '#f2c14e',
    done: '#9ddeaf',
    doneFill: '#7dce8a',
    focus: '#8eb6ef',
    chalk: '#0c100e',
    trail: '#3a4a42',
    dot: 'rgba(243, 239, 230, 0.16)',
  },
];

export const getPreviewPalette = (id: string) =>
  previewPalettes.find((palette) => palette.id === id);
