import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

interface OrganicShakeProps {
  /** Shake amplitude in pixels (1-3 for premium, 5-8 for UGC) */
  amplitude?: number;
  /** Frequency multiplier (lower = more elegant, higher = more energy) */
  frequency?: number;
  /** Include subtle rotation */
  rotation?: boolean;
  /** Rotation amplitude in degrees */
  rotationAmplitude?: number;
  children: React.ReactNode;
}

/**
 * Simple Perlin-like noise using sine combinations.
 * Not true Perlin, but produces smooth organic motion.
 */
function pseudoNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.3 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.1 + seed * 0.3) * 0.2
  );
}

/**
 * OrganicShake — Smooth camera shake using pseudo-Perlin noise.
 * Simulates human hand-held camera feel.
 * NOT random jitter — smooth, organic, continuous.
 */
export const OrganicShake: React.FC<OrganicShakeProps> = ({
  amplitude = 2,
  frequency = 1,
  rotation = true,
  rotationAmplitude = 0.3,
  children,
}) => {
  const frame = useCurrentFrame();
  const t = frame * 0.04 * frequency;

  const shakeX = pseudoNoise(t, 0) * amplitude;
  const shakeY = pseudoNoise(t, 42) * amplitude;
  const rot = rotation ? pseudoNoise(t, 99) * rotationAmplitude : 0;

  return (
    <AbsoluteFill style={{
      transform: `translate(${shakeX}px, ${shakeY}px) rotate(${rot}deg)`,
    }}>
      {children}
    </AbsoluteFill>
  );
};
