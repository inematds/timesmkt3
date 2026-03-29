import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

/**
 * Particle effects: bokeh, dust, digital glitch, sparkle.
 */

export type ParticleType = 'bokeh' | 'dust' | 'sparkle' | 'glitch';

interface ParticleEffectsProps {
  type?: ParticleType;
  count?: number;
  color?: string;
  opacity?: number;
  startFrame?: number;
}

// Deterministic pseudo-random based on seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const ParticleEffects: React.FC<ParticleEffectsProps> = ({
  type = 'bokeh',
  count = 15,
  color = '#FFFFFF',
  opacity = 0.5,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  if (type === 'glitch') {
    return <GlitchEffect frame={frame} startFrame={startFrame} opacity={opacity * fadeIn} />;
  }

  const particles = Array.from({ length: count }, (_, i) => {
    const seed = i + 1;
    const x = seededRandom(seed * 1) * 100;
    const y = seededRandom(seed * 2) * 100;
    const size = type === 'bokeh'
      ? 20 + seededRandom(seed * 3) * 60
      : type === 'dust'
      ? 2 + seededRandom(seed * 3) * 6
      : 4 + seededRandom(seed * 3) * 12;
    const speed = 0.3 + seededRandom(seed * 4) * 0.7;
    const phase = seededRandom(seed * 5) * Math.PI * 2;

    const animX = Math.sin(frame * 0.01 * speed + phase) * 30;
    const animY = type === 'dust'
      ? -frame * 0.3 * speed // dust floats up
      : Math.cos(frame * 0.008 * speed + phase) * 20;

    const particleOpacity = type === 'bokeh'
      ? opacity * (0.3 + seededRandom(seed * 6) * 0.5) * (0.7 + Math.sin(frame * 0.03 + phase) * 0.3)
      : type === 'sparkle'
      ? opacity * Math.max(0, Math.sin(frame * 0.1 * speed + phase))
      : opacity * (0.4 + seededRandom(seed * 6) * 0.4);

    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          borderRadius: type === 'sparkle' ? '2px' : '50%',
          backgroundColor: color,
          opacity: particleOpacity * fadeIn,
          transform: `translate(${animX}px, ${animY}px)${type === 'sparkle' ? ` rotate(${frame * 2 + i * 45}deg)` : ''}`,
          boxShadow: type === 'bokeh' ? `0 0 ${size * 0.5}px ${color}` : 'none',
          filter: type === 'bokeh' ? `blur(${size * 0.15}px)` : 'none',
          pointerEvents: 'none' as const,
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ zIndex: 8, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles}
    </AbsoluteFill>
  );
};

// ── Glitch effect ───────────────────────────────────────────────────────────

const GlitchEffect: React.FC<{
  frame: number;
  startFrame: number;
  opacity: number;
}> = ({ frame, startFrame, opacity }) => {
  // Glitch only triggers on certain frames
  const isGlitching = seededRandom(frame * 0.1) > 0.85;
  if (!isGlitching || frame < startFrame) return null;

  const sliceCount = 3 + Math.floor(seededRandom(frame) * 4);
  const slices = Array.from({ length: sliceCount }, (_, i) => {
    const top = seededRandom(frame * 10 + i * 7) * 100;
    const height = 2 + seededRandom(frame * 20 + i * 3) * 8;
    const shiftX = (seededRandom(frame * 30 + i * 11) - 0.5) * 40;
    const r = Math.floor(seededRandom(frame + i) * 2);

    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          top: `${top}%`,
          left: 0,
          right: 0,
          height: `${height}%`,
          transform: `translateX(${shiftX}px)`,
          backgroundColor: r === 0 ? 'rgba(255,0,0,0.15)' : 'rgba(0,255,255,0.15)',
          opacity,
          mixBlendMode: 'screen',
          pointerEvents: 'none' as const,
        }}
      />
    );
  });

  return (
    <AbsoluteFill style={{ zIndex: 9, pointerEvents: 'none' }}>
      {slices}
    </AbsoluteFill>
  );
};
