import { Composition, registerRoot } from 'remotion';
import type { GeneratedSegment } from '../scene.js';
import { SegmentStill } from './SegmentStill.js';

const placeholder: GeneratedSegment = {
  id: 'placeholder',
  title: 'Placeholder',
  durationInFrames: 90,
  narration: '',
  scene: { layout: { type: 'titleCard', title: 'Lesson' } },
};

const Root = () => {
  return (
    <Composition
      id="SegmentStill"
      component={SegmentStill}
      durationInFrames={90}
      fps={30}
      width={1280}
      height={720}
      defaultProps={{ segment: placeholder }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, Math.round(props.segment.durationInFrames || 90)),
      })}
    />
  );
};

registerRoot(Root);
