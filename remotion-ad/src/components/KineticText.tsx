import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Kinetic typography — words that scale, rotate, and move with emphasis.
 * Designed for impact headlines and beat-synced text.
 */

export type KineticStyle = 'grow' | 'wave' | 'stagger-scale' | 'rotate-in' | 'elastic' | 'slam';

interface KineticTextProps {
  text: string;
  style?: KineticStyle;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  startFrame?: number;
  // Beat sync: frames where emphasis happens (e.g., music beats)
  beats?: number[];
}

export const KineticText: React.FC<KineticTextProps> = ({
  text,
  style = 'grow',
  fontSize = 72,
  color = '#FFFFFF',
  fontFamily = 'Inter, sans-serif',
  fontWeight = 900,
  startFrame = 0,
  beats,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const words = text.split(' ');
  const relFrame = Math.max(0, frame - startFrame);

  // Beat pulse: find nearest beat and compute bounce
  const beatPulse = beats && beats.length > 0
    ? beats.reduce((pulse, beat) => {
        const dist = frame - beat;
        if (dist >= 0 && dist < 10) {
          const s = spring({ frame: dist, fps, config: { damping: 6, stiffness: 200 } });
          return Math.max(pulse, 1 + (1 - s) * 0.15);
        }
        return pulse;
      }, 1)
    : 1;

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: `translate(-50%, -50%) scale(${beatPulse})`,
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: fontSize * 0.25,
    width: '85%',
    textAlign: 'center',
    zIndex: 20,
  };

  return (
    <div style={containerStyle}>
      {words.map((word, i) => (
        <KineticWord
          key={i}
          word={word}
          index={i}
          total={words.length}
          kineticStyle={style}
          fontSize={fontSize}
          color={color}
          fontFamily={fontFamily}
          fontWeight={fontWeight}
          startFrame={startFrame}
          frame={frame}
          fps={fps}
          relFrame={relFrame}
        />
      ))}
    </div>
  );
};

// ── Word-level kinetic animation ────────────────────────────────────────────

const KineticWord: React.FC<{
  word: string;
  index: number;
  total: number;
  kineticStyle: KineticStyle;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: number;
  startFrame: number;
  frame: number;
  fps: number;
  relFrame: number;
}> = ({ word, index, total, kineticStyle, fontSize, color, fontFamily, fontWeight, startFrame, frame, fps, relFrame }) => {
  const delay = index * 8;
  const wordFrame = Math.max(0, relFrame - delay);

  const s = spring({
    frame: wordFrame,
    fps,
    config: { damping: 10, stiffness: 120 },
  });

  const fadeIn = interpolate(frame, [startFrame + delay, startFrame + delay + 10], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  let transform = '';
  let currentFontSize = fontSize;

  switch (kineticStyle) {
    case 'grow':
      currentFontSize = fontSize * (0.3 + s * 0.7);
      break;
    case 'wave': {
      const wave = Math.sin(frame * 0.08 + index * 0.8) * 15;
      transform = `translateY(${wave}px)`;
      break;
    }
    case 'stagger-scale': {
      const sc = spring({
        frame: wordFrame,
        fps,
        config: { damping: 8, stiffness: 150 },
      });
      transform = `scale(${0.2 + sc * 0.8})`;
      break;
    }
    case 'rotate-in': {
      const rot = interpolate(s, [0, 1], [-90, 0]);
      transform = `rotate(${rot}deg) scale(${s})`;
      break;
    }
    case 'elastic': {
      const elasticS = spring({
        frame: wordFrame,
        fps,
        config: { damping: 5, stiffness: 200, mass: 0.8 },
      });
      transform = `scale(${elasticS}) translateY(${interpolate(elasticS, [0, 1], [60, 0])}px)`;
      break;
    }
    case 'slam': {
      const slamS = spring({
        frame: wordFrame,
        fps,
        config: { damping: 8, stiffness: 300 },
      });
      const slamScale = interpolate(slamS, [0, 0.5, 1], [3, 0.9, 1]);
      transform = `scale(${slamScale})`;
      break;
    }
  }

  return (
    <span style={{
      display: 'inline-block',
      fontSize: currentFontSize,
      fontFamily,
      fontWeight,
      color,
      opacity: fadeIn,
      transform,
      textShadow: '0 4px 24px rgba(0,0,0,0.6)',
      lineHeight: 1.15,
    }}>
      {word}
    </span>
  );
};
