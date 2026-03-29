import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

/**
 * Synchronized subtitles that follow narration timing.
 * Each subtitle segment has start/end frames and text.
 */

export interface SubtitleSegment {
  text: string;
  startFrame: number;
  endFrame: number;
}

export type SubtitleStyle = 'default' | 'bold' | 'karaoke' | 'minimal';

interface SubtitlesProps {
  segments: SubtitleSegment[];
  fontSize?: number;
  color?: string;
  bgColor?: string;
  fontFamily?: string;
  style?: SubtitleStyle;
  position?: 'bottom' | 'center' | 'top';
  maxWidth?: string;
}

export const Subtitles: React.FC<SubtitlesProps> = ({
  segments,
  fontSize = 36,
  color = '#FFFFFF',
  bgColor = 'rgba(0,0,0,0.6)',
  fontFamily = 'Inter, sans-serif',
  style = 'default',
  position = 'bottom',
  maxWidth = '85%',
}) => {
  const frame = useCurrentFrame();

  // Find current segment
  const current = segments.find(s => frame >= s.startFrame && frame <= s.endFrame);
  if (!current) return null;

  const segDuration = current.endFrame - current.startFrame;
  const segProgress = (frame - current.startFrame) / segDuration;

  // Fade in/out
  const fadeIn = interpolate(frame, [current.startFrame, current.startFrame + 6], [0, 1], {
    extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
  });
  const fadeOut = interpolate(frame, [current.endFrame - 6, current.endFrame], [1, 0], {
    extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const posMap: Record<string, React.CSSProperties> = {
    bottom: { bottom: '8%' },
    center: { top: '50%', transform: 'translateX(-50%) translateY(-50%)' },
    top: { top: '8%' },
  };

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    transform: posMap[position].transform || 'translateX(-50%)',
    ...posMap[position],
    zIndex: 35,
    opacity,
    maxWidth,
    textAlign: 'center',
  };

  if (style === 'karaoke') {
    // Word-by-word highlight
    const words = current.text.split(' ');
    const wordsHighlighted = Math.floor(segProgress * words.length);

    return (
      <div style={containerStyle}>
        <div style={{
          backgroundColor: bgColor,
          borderRadius: 12,
          padding: '12px 28px',
          display: 'inline-block',
        }}>
          {words.map((word, i) => (
            <span key={i} style={{
              fontFamily,
              fontSize,
              fontWeight: 700,
              color: i <= wordsHighlighted ? '#FFD700' : color,
              transition: 'color 0.1s',
              marginRight: fontSize * 0.25,
            }}>
              {word}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (style === 'minimal') {
    return (
      <div style={containerStyle}>
        <span style={{
          fontFamily,
          fontSize,
          fontWeight: 600,
          color,
          textShadow: '0 2px 16px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.5)',
        }}>
          {current.text}
        </span>
      </div>
    );
  }

  if (style === 'bold') {
    return (
      <div style={containerStyle}>
        <div style={{
          backgroundColor: bgColor,
          borderRadius: 16,
          padding: '16px 36px',
          display: 'inline-block',
        }}>
          <span style={{
            fontFamily,
            fontSize: fontSize * 1.1,
            fontWeight: 900,
            color,
            letterSpacing: '-0.02em',
          }}>
            {current.text}
          </span>
        </div>
      </div>
    );
  }

  // Default style
  return (
    <div style={containerStyle}>
      <div style={{
        backgroundColor: bgColor,
        borderRadius: 8,
        padding: '10px 24px',
        display: 'inline-block',
      }}>
        <span style={{
          fontFamily,
          fontSize,
          fontWeight: 600,
          color,
        }}>
          {current.text}
        </span>
      </div>
    </div>
  );
};
