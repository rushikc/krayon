import type { SceneLayout } from '../../scene.js';
import { isLayoutType } from '../../scene.js';
import { Bullets } from './Bullets.js';
import { Callout } from './Callout.js';
import { Chart } from './Chart.js';
import { Compare } from './Compare.js';
import { CouldntDraw } from './CouldntDraw.js';
import { Flow } from './Flow.js';
import { HubSpoke } from './HubSpoke.js';
import { Timeline } from './Timeline.js';
import { TitleCard } from './TitleCard.js';

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
