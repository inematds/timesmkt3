import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * Localized gradient band behind text — not a full-frame overlay.
 * Provides contrast without darkening the entire image.
 */

export type BandStyle = 'gradient' | 'solid' | 'blur' | 'glass';
export type BandPosition = 'top' | 'center' | 'bottom';

interface TextBackgroundBandProps {
  position?: BandPosition;
  positionPercent?: number;
  height?: string;          // CSS height, e.g. '30%' or '200px'
  color?: string;           // base color
  opacity?: number;
  style?: BandStyle;
  startFrame?: number;
  gradientDirection?: 'up' | 'down'; // gradient fades toward this direction
}

export const TextBackgroundBand: React.FC<TextBackgroundBandProps> = ({
  position = 'bottom',
  positionPercent,
  height = '35%',
  color = '#000000',
  opacity = 0.6,
  style = 'gradient',
  startFrame = 0,
  gradientDirection = 'down',
}) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [startFrame, startFrame + 15], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  // Position
  const posProps: React.CSSProperties = {};
  if (positionPercent !== undefined) {
    posProps.top = `${positionPercent}%`;
    posProps.transform = 'translateY(-50%)';
  } else {
    const posMap: Record<BandPosition, React.CSSProperties> = {
      top: { top: 0 },
      center: { top: '50%', transform: 'translateY(-50%)' },
      bottom: { bottom: 0 },
    };
    Object.assign(posProps, posMap[position]);
  }

  // Parse color to rgba
  const hexToRgb = (hex: string) => {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) || 0,
      g: parseInt(h.substring(2, 4), 16) || 0,
      b: parseInt(h.substring(4, 6), 16) || 0,
    };
  };
  const rgb = hexToRgb(color);
  const rgba = (a: number) => `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;

  // Style variants
  let background: string;
  let backdropFilter: string | undefined;
  let border: string | undefined;

  switch (style) {
    case 'solid':
      background = rgba(opacity);
      break;
    case 'blur':
      background = rgba(opacity * 0.4);
      backdropFilter = 'blur(12px)';
      break;
    case 'glass':
      background = rgba(opacity * 0.3);
      backdropFilter = 'blur(20px)';
      border = `1px solid ${rgba(0.15)}`;
      break;
    case 'gradient':
    default: {
      const dir = gradientDirection === 'up' ? 'to top' : 'to bottom';
      if (position === 'top') {
        background = `linear-gradient(to bottom, ${rgba(opacity)} 0%, ${rgba(opacity * 0.6)} 60%, transparent 100%)`;
      } else if (position === 'center') {
        background = `linear-gradient(${dir}, transparent 0%, ${rgba(opacity)} 30%, ${rgba(opacity)} 70%, transparent 100%)`;
      } else {
        background = `linear-gradient(to top, ${rgba(opacity)} 0%, ${rgba(opacity * 0.6)} 60%, transparent 100%)`;
      }
      break;
    }
  }

  return (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      height,
      ...posProps,
      background,
      backdropFilter,
      WebkitBackdropFilter: backdropFilter,
      border,
      opacity: fadeIn,
      zIndex: 15,
      pointerEvents: 'none',
    }} />
  );
};
