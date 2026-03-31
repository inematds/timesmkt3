import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface FilmGrainProps {
  /** Grain intensity 0-1 (default 0.03) */
  intensity?: number;
  /** Monochromatic grain (default true) */
  monochromatic?: boolean;
  /** Enable light leak animation */
  lightLeak?: boolean;
  /** Light leak color (warm by default) */
  lightLeakColor?: string;
  /** Light leak opacity (0-1) */
  lightLeakOpacity?: number;
}

/**
 * FilmGrain — Cinematic grain overlay + animated light leaks.
 * Unifies images from different sources — "same camera, same day" effect.
 * Applied as top-level overlay across ALL scenes.
 */
export const FilmGrain: React.FC<FilmGrainProps> = ({
  intensity = 0.03,
  monochromatic = true,
  lightLeak = false,
  lightLeakColor = '#FF8C00',
  lightLeakOpacity = 0.12,
}) => {
  const frame = useCurrentFrame();

  // Animate grain by shifting background position each frame
  const grainX = (frame * 37) % 256;
  const grainY = (frame * 53) % 256;

  // Light leak: slow radial gradient that drifts across the frame
  const leakX = 50 + Math.sin(frame * 0.02) * 30;
  const leakY = 50 + Math.cos(frame * 0.015) * 20;
  const leakSize = 40 + Math.sin(frame * 0.01) * 15;

  // Light leak opacity pulses gently
  const leakPulse = interpolate(
    Math.sin(frame * 0.03),
    [-1, 1],
    [lightLeakOpacity * 0.5, lightLeakOpacity]
  );

  return (
    <>
      {/* Grain layer — SVG noise with per-frame shift */}
      <AbsoluteFill style={{
        opacity: intensity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
        zIndex: 80,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' seed='${frame % 10}' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '128px 128px',
        backgroundPosition: `${grainX}px ${grainY}px`,
        filter: monochromatic ? 'saturate(0)' : 'none',
      }} />

      {/* Light leak layer */}
      {lightLeak && (
        <AbsoluteFill style={{
          background: `radial-gradient(ellipse ${leakSize}% ${leakSize}% at ${leakX}% ${leakY}%, ${lightLeakColor}, transparent)`,
          opacity: leakPulse,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          zIndex: 81,
        }} />
      )}
    </>
  );
};
