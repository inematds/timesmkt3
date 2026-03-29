import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Split screen — before/after, side-by-side comparison.
 */

export type SplitDirection = 'horizontal' | 'vertical';
export type SplitAnimation = 'slide' | 'reveal' | 'instant';

interface SplitScreenProps {
  leftSrc: string;
  rightSrc: string;
  direction?: SplitDirection;
  animation?: SplitAnimation;
  splitPosition?: number; // 0-100, default 50
  startFrame?: number;
  labelLeft?: string;
  labelRight?: string;
  labelColor?: string;
}

export const SplitScreen: React.FC<SplitScreenProps> = ({
  leftSrc,
  rightSrc,
  direction = 'horizontal',
  animation = 'slide',
  splitPosition = 50,
  startFrame = 0,
  labelLeft,
  labelRight,
  labelColor = '#FFFFFF',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const resolvedSrc = (src: string) =>
    src.startsWith('/') || src.startsWith('http') ? src : staticFile(src);

  let split: number;
  if (animation === 'instant') {
    split = splitPosition;
  } else if (animation === 'reveal') {
    split = interpolate(frame, [startFrame, startFrame + 40], [0, splitPosition], {
      extrapolateRight: 'clamp',
      extrapolateLeft: 'clamp',
    });
  } else {
    const s = spring({
      frame: Math.max(0, frame - startFrame),
      fps,
      config: { damping: 14 },
    });
    split = interpolate(s, [0, 1], [0, splitPosition]);
  }

  const isHoriz = direction === 'horizontal';
  const labelStyle: React.CSSProperties = {
    position: 'absolute',
    color: labelColor,
    fontFamily: 'Inter, sans-serif',
    fontSize: 28,
    fontWeight: 700,
    textShadow: '0 2px 12px rgba(0,0,0,0.6)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    zIndex: 5,
  };

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Right/bottom image (full) */}
      <Img
        src={resolvedSrc(rightSrc)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      {/* Left/top image (clipped) */}
      <div style={{
        position: 'absolute',
        inset: 0,
        clipPath: isHoriz
          ? `inset(0 ${100 - split}% 0 0)`
          : `inset(0 0 ${100 - split}% 0)`,
        overflow: 'hidden',
      }}>
        <Img
          src={resolvedSrc(leftSrc)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* Divider line */}
      <div style={{
        position: 'absolute',
        ...(isHoriz
          ? { left: `${split}%`, top: 0, bottom: 0, width: 3 }
          : { top: `${split}%`, left: 0, right: 0, height: 3 }),
        backgroundColor: 'rgba(255,255,255,0.8)',
        boxShadow: '0 0 12px rgba(0,0,0,0.4)',
        zIndex: 4,
      }} />

      {/* Labels */}
      {labelLeft && (
        <div style={{
          ...labelStyle,
          ...(isHoriz
            ? { left: '5%', bottom: '8%' }
            : { left: '5%', top: '5%' }),
        }}>
          {labelLeft}
        </div>
      )}
      {labelRight && (
        <div style={{
          ...labelStyle,
          ...(isHoriz
            ? { right: '5%', bottom: '8%' }
            : { right: '5%', bottom: '5%' }),
        }}>
          {labelRight}
        </div>
      )}
    </AbsoluteFill>
  );
};
