import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export type LensTransitionType = 'rack-focus' | 'whip-blur' | 'defocus-refocus' | 'chromatic-glitch';

interface LensTransitionProps {
  type?: LensTransitionType;
  /** Duration in frames (default 6) */
  durationFrames?: number;
  /** Color for chromatic aberration (default cyan) */
  accentColor?: string;
  children: React.ReactNode;
}

/**
 * LensTransition — Simulates physical camera lens movements between scenes.
 * Replaces plain cuts/crossfades with cinematic blur transitions.
 *
 * Types:
 * - rack-focus: blur→sharp (entering scene)
 * - whip-blur: horizontal blur sweep
 * - defocus-refocus: sharp→blur→sharp
 * - chromatic-glitch: RGB split + zoom (HUD protocol)
 */
export const LensTransition: React.FC<LensTransitionProps> = ({
  type = 'rack-focus',
  durationFrames = 6,
  accentColor = '#0099FF',
  children,
}) => {
  const frame = useCurrentFrame();

  if (frame >= durationFrames) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  const progress = frame / durationFrames; // 0→1

  switch (type) {
    case 'rack-focus': {
      // Blur starts high, resolves to sharp
      const blur = interpolate(progress, [0, 1], [20, 0]);
      const brightness = interpolate(progress, [0, 0.3, 1], [1.3, 1.1, 1]);
      return (
        <AbsoluteFill style={{ filter: `blur(${blur}px) brightness(${brightness})` }}>
          {children}
        </AbsoluteFill>
      );
    }

    case 'whip-blur': {
      // Horizontal motion blur + slight translate
      const blur = interpolate(progress, [0, 0.5, 1], [0, 25, 0]);
      const translateX = interpolate(progress, [0, 0.5, 1], [-5, 0, 0]);
      return (
        <AbsoluteFill style={{
          filter: `blur(${blur}px)`,
          transform: `translateX(${translateX}%)`,
        }}>
          {children}
        </AbsoluteFill>
      );
    }

    case 'defocus-refocus': {
      // Sharp → blur → sharp
      const blur = interpolate(progress, [0, 0.4, 1], [0, 18, 0]);
      return (
        <AbsoluteFill style={{ filter: `blur(${blur}px)` }}>
          {children}
        </AbsoluteFill>
      );
    }

    case 'chromatic-glitch': {
      // RGB split + zoom punch — HUD protocol glitch transition
      const glitchIntensity = interpolate(progress, [0, 0.5, 1], [0, 1, 0]);
      const rgbShift = glitchIntensity * 4;
      const zoom = 1 + glitchIntensity * 0.1;
      const brightness = 1 + glitchIntensity * 0.2;

      return (
        <AbsoluteFill>
          {/* Red channel shifted */}
          <AbsoluteFill style={{
            filter: `brightness(${brightness})`,
            transform: `scale(${zoom}) translateX(${rgbShift}px)`,
            mixBlendMode: 'screen',
            opacity: glitchIntensity > 0.1 ? 0.3 : 0,
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#FF000030',
              mixBlendMode: 'multiply',
            }} />
            {children}
          </AbsoluteFill>
          {/* Blue channel shifted */}
          <AbsoluteFill style={{
            filter: `brightness(${brightness})`,
            transform: `scale(${zoom}) translateX(${-rgbShift}px)`,
            mixBlendMode: 'screen',
            opacity: glitchIntensity > 0.1 ? 0.3 : 0,
          }}>
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: '#0000FF30',
              mixBlendMode: 'multiply',
            }} />
            {children}
          </AbsoluteFill>
          {/* Main content */}
          <AbsoluteFill style={{
            filter: `brightness(${brightness})`,
            transform: `scale(${zoom})`,
          }}>
            {children}
          </AbsoluteFill>
        </AbsoluteFill>
      );
    }

    default:
      return <AbsoluteFill>{children}</AbsoluteFill>;
  }
};
