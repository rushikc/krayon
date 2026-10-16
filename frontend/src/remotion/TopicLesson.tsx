import type { FC } from 'react';
import { AbsoluteFill, Easing, interpolate, Series, useCurrentFrame } from 'remotion';
import type { LessonColors } from '../paletteState.ts';
import { theme } from './theme.ts';
import { TOPIC_BEAT_FRAMES, TOPIC_TITLE_FRAMES } from './topicLessonTiming.ts';

export type TopicLessonProps = {
  title: string;
  beats: string[];
  colors: LessonColors;
};

const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

const TitleFrame: FC<{ title: string; colors: LessonColors }> = ({ title, colors }) => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [0, 16], [18, 0], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.paper,
        color: colors.ink,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 10,
          backgroundColor: colors.crayon,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 88,
          right: 88,
          top: 220,
          transform: `translateY(${rise}px)`,
          fontFamily: theme.serif,
          fontSize: 68,
          lineHeight: 1.05,
        }}
      >
        {title}
      </div>
    </AbsoluteFill>
  );
};

const BeatFrame: FC<{ index: number; text: string; colors: LessonColors }> = ({
  index,
  text,
  colors,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.paper,
        color: colors.ink,
        fontFamily: theme.sans,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 10,
          backgroundColor: colors.crayon,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 72,
          fontSize: 16,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: colors.muted,
        }}
      >
        0{index + 1}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 88,
          top: 200,
          opacity,
          fontFamily: theme.serif,
          fontSize: 52,
          lineHeight: 1.25,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

export const TopicLesson: FC<TopicLessonProps> = ({ title, beats, colors }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.paper }}>
      <Series>
        <Series.Sequence durationInFrames={TOPIC_TITLE_FRAMES}>
          <TitleFrame title={title} colors={colors} />
        </Series.Sequence>
        {beats.map((beat, index) => (
          <Series.Sequence key={`${index}-${beat}`} durationInFrames={TOPIC_BEAT_FRAMES}>
            <BeatFrame index={index} text={beat} colors={colors} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};
