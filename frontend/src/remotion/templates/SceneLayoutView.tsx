import type { SceneLayout } from '../scene.ts';
import { isLayoutType } from '../scene.ts';
import { Bullets } from './Bullets.tsx';
import { Callout } from './Callout.tsx';
import { Chart } from './Chart.tsx';
import { Compare } from './Compare.tsx';
import { CouldntDraw } from './CouldntDraw.tsx';
import { Flow } from './Flow.tsx';
import { HubSpoke } from './HubSpoke.tsx';
import { Timeline } from './Timeline.tsx';
import { TitleCard } from './TitleCard.tsx';

type SceneLayoutViewProps = {
  layout: SceneLayout;
  durationInFrames: number;
};

export function SceneLayoutView({ layout, durationInFrames }: SceneLayoutViewProps) {
  if (!layout || !isLayoutType(layout.type)) return <CouldntDraw />;
  switch (layout.type) {
    case 'titleCard':
      return layout.title ? <TitleCard layout={layout} durationInFrames={durationInFrames} /> : <CouldntDraw />;
    case 'bullets':
      return layout.heading && layout.items?.length ? (
        <Bullets layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'flow':
      return layout.nodes?.length >= 2 ? (
        <Flow layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'compare':
      return layout.left?.title && layout.right?.title ? (
        <Compare layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'hubSpoke':
      return layout.center?.label && layout.spokes?.length >= 3 ? (
        <HubSpoke layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'chart':
      return layout.curves?.length && layout.xLabel && layout.yLabel ? (
        <Chart layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'timeline':
      return layout.steps?.length >= 2 ? (
        <Timeline layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    case 'callout':
      return layout.title && layout.body ? (
        <Callout layout={layout} durationInFrames={durationInFrames} />
      ) : (
        <CouldntDraw />
      );
    default:
      return <CouldntDraw />;
  }
}
