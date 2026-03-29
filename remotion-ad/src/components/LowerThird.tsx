import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Lower third bar with brand/URL info at the bottom of the frame.
 * Common in professional video ads and broadcast graphics.
 */

export type LowerThirdStyle = 'bar' | 'pill' | 'glass' | 'minimal';

interface LowerThirdProps {
  text: string;               // main text (brand name, URL, etc.)
  subtext?: string;            // secondary line
  bgColor?: string;
  textColor?: string;
  accentColor?: string;        // left accent bar color
  style?: LowerThirdStyle;
  startFrame?: number;
  fontFamily?: string;
  position?: 'left' | 'center' | 'right';
}

export const LowerThird: React.FC<LowerThirdProps> = ({
  text,
  subtext,
  bgColor = 'rgba(0,0,0,0.75)',
  textColor = '#FFFFFF',
  accentColor = '#F5A623',
  style = 'bar',
  startFrame = 15,
  fontFamily = 'Inter, sans-serif',
  position = 'left',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideIn = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: { damping: 14, stiffness: 100 },
  });
  const opacity = interpolate(frame, [startFrame, startFrame + 10], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  const alignMap: Record<string, React.CSSProperties> = {
    left: { left: '5%' },
    center: { left: '50%', transform: `translateX(-50%) translateY(${interpolate(slideIn, [0, 1], [30, 0])}px)` },
    right: { right: '5%' },
  };

  const slideTransform = position !== 'center'
    ? `translateX(${interpolate(slideIn, [0, 1], [position === 'left' ? -100 : 100, 0])}px)`
    : alignMap.center.transform;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '6%',
    ...alignMap[position],
    transform: slideTransform,
    opacity,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    maxWidth: '80%',
  };

  if (style === 'minimal') {
    return (
      <div style={containerStyle}>
        <div style={{
          fontFamily,
          fontSize: 28,
          fontWeight: 600,
          color: textColor,
          textShadow: '0 2px 12px rgba(0,0,0,0.5)',
          letterSpacing: '0.05em',
        }}>
          {text}
          {subtext && (
            <div style={{ fontSize: 22, fontWeight: 400, opacity: 0.8, marginTop: 4 }}>
              {subtext}
            </div>
          )}
        </div>
      </div>
    );
  }

  const bgStyle: React.CSSProperties = style === 'glass'
    ? {
        backgroundColor: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.15)',
      }
    : style === 'pill'
    ? {
        backgroundColor: bgColor,
        borderRadius: 50,
      }
    : {
        backgroundColor: bgColor,
        borderRadius: 8,
      };

  return (
    <div style={containerStyle}>
      {/* Accent bar (left edge) */}
      {style === 'bar' && (
        <div style={{
          width: 5,
          backgroundColor: accentColor,
          borderRadius: '8px 0 0 8px',
          flexShrink: 0,
        }} />
      )}

      <div style={{
        ...bgStyle,
        padding: style === 'pill' ? '14px 36px' : '14px 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}>
        <div style={{
          fontFamily,
          fontSize: 30,
          fontWeight: 700,
          color: textColor,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }}>
          {text}
        </div>
        {subtext && (
          <div style={{
            fontFamily,
            fontSize: 22,
            fontWeight: 400,
            color: textColor,
            opacity: 0.75,
            marginTop: 4,
            whiteSpace: 'nowrap',
          }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
};
