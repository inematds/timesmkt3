import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export type CTAStyle = 'solid' | 'glass' | 'outline' | 'pill';

interface CTAButtonProps {
  text: string;
  bgColor?: string;
  textColor?: string;
  startFrame?: number;
  style?: CTAStyle;
  fontFamily?: string;
}

export const CTAButton: React.FC<CTAButtonProps> = ({
  text,
  bgColor = '#F5A623',
  textColor = '#2C1A0E',
  startFrame = 30,
  style = 'solid',
  fontFamily,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: Math.max(0, frame - startFrame),
    fps,
    config: { damping: 10, stiffness: 110 },
  });
  const opacity = interpolate(frame, [startFrame, startFrame + 15], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  // Subtle pulse after entrance
  const pulse = frame > startFrame + 30
    ? 1 + Math.sin((frame - startFrame) * 0.08) * 0.02
    : 1;

  const baseButtonStyle: React.CSSProperties = {
    color: textColor,
    fontFamily: fontFamily || 'Inter, sans-serif',
    fontSize: 40,
    fontWeight: 800,
    padding: '24px 80px',
    borderRadius: 60,
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  };

  const styleVariants: Record<CTAStyle, React.CSSProperties> = {
    solid: {
      backgroundColor: bgColor,
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
    },
    glass: {
      backgroundColor: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.25)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
    },
    outline: {
      backgroundColor: 'transparent',
      border: `3px solid ${bgColor}`,
      boxShadow: `0 0 20px ${bgColor}44`,
    },
    pill: {
      backgroundColor: bgColor,
      boxShadow: `0 6px 24px ${bgColor}66, 0 10px 40px rgba(0,0,0,0.2)`,
      padding: '20px 60px',
      borderRadius: 100,
    },
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: '12%',
      left: '50%',
      transform: `translateX(-50%) scale(${scale * pulse})`,
      opacity,
      zIndex: 25,
    }}>
      <div style={{ ...baseButtonStyle, ...styleVariants[style] }}>
        {text}
      </div>
    </div>
  );
};
