import type { LessonSegment } from './types.ts';
import { Recap } from './segments/Recap.tsx';
import { SlopeDiagram } from './segments/SlopeDiagram.tsx';
import { TitleCard } from './segments/TitleCard.tsx';

export const FPS = 30;
export const COMPOSITION_WIDTH = 1280;
export const COMPOSITION_HEIGHT = 720;

export const sampleSegments: LessonSegment[] = [
  {
    id: 'intro',
    title: 'What slope is',
    durationInFrames: 75,
    component: TitleCard,
  },
  {
    id: 'diagram',
    title: 'Rise over run',
    durationInFrames: 180,
    component: SlopeDiagram,
  },
  {
    id: 'recap',
    title: 'Remember this',
    durationInFrames: 105,
    component: Recap,
  },
];
