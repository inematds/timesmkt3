import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Stories-style progress bar at the top of the video.
 * Shows segments for each scene and fills as video progresses.
 */

export type ProgressBarStyle = 'stories' | 'line' | 'dots';

interface ProgressBarProps {
  segments: number;           // number of scenes
  segmentDurations?: number[]; // frame count per segment (uniform if omitted)
  style?: ProgressBarStyle;
  color?: string;             // active color
  bgColor?: string;           // inactive color
  height?: number;
  position?: 'top' | 'bottom';
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  segments,
  segmentDurations,
  style = 'stories',
  color = '#FFFFFF',
  bgColor = 'rgba(255,255,255,0.3)',
  height = 4,
  position = 'top',
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Build segment boundaries
  const durations = segmentDurations && segmentDurations.length === segments
    ? segmentDurations
    : Array(segments).fill(Math.floor(durationInFrames / segments));

  const totalFrames = durations.reduce((a, b) => a + b, 0);
  let accumulated = 0;
  const segmentBounds = durations.map(d => {
    const start = accumulated;
    accumulated += d;
    return { start, end: accumulated };
  });

  if (style === 'dots') {
    return (
      <div style={{
        position: 'absolute',
        [position]: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 10,
        zIndex: 40,
      }}>
        {segmentBounds.map((seg, i) => {
          const isActive = frame >= seg.start;
          const isCurrent = frame >= seg.start && frame < seg.end;
          return (
            <div
              key={i}
              style={{
                width: isCurrent ? 20 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: isActive ? color : bgColor,
                transition: 'width 0.2s',
              }}
            />
          );
        })}
      </div>
    );
  }

  if (style === 'line') {
    const progress = Math.min(1, frame / totalFrames);
    return (
      <div style={{
        position: 'absolute',
        [position]: 0,
        left: 0,
        right: 0,
        height,
        backgroundColor: bgColor,
        zIndex: 40,
      }}>
        <div style={{
          width: `${progress * 100}%`,
          height: '100%',
          backgroundColor: color,
        }} />
      </div>
    );
  }

  // Stories style (segmented)
  const gap = 4;
  return (
    <div style={{
      position: 'absolute',
      [position]: 12,
      left: 12,
      right: 12,
      display: 'flex',
      gap,
      zIndex: 40,
    }}>
      {segmentBounds.map((seg, i) => {
        const segProgress = frame < seg.start
          ? 0
          : frame >= seg.end
          ? 1
          : (frame - seg.start) / (seg.end - seg.start);

        return (
          <div
            key={i}
            style={{
              flex: durations[i],
              height,
              borderRadius: height / 2,
              backgroundColor: bgColor,
              overflow: 'hidden',
            }}
          >
            <div style={{
              width: `${segProgress * 100}%`,
              height: '100%',
              backgroundColor: color,
              borderRadius: height / 2,
            }} />
          </div>
        );
      })}
    </div>
  );
};
