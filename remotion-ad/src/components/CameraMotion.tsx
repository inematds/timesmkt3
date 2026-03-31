import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * Camera motion effects applied to background images.
 * Simulates cinematic camera movements over still photos.
 */

export type CameraEffect =
  | 'ken-burns-in'       // slow zoom in (intimate, emotional)
  | 'ken-burns-out'      // slow zoom out (reveal, establishing)
  | 'pan-left'           // pan from right to left
  | 'pan-right'          // pan from left to right
  | 'pan-up'             // pan from bottom to top (rising, hopeful)
  | 'pan-down'           // pan from top to bottom (settling, calm)
  | 'drift'              // subtle random drift (dreamy)
  | 'parallax-zoom'      // zoom with slight vertical drift (dynamic)
  | 'push-in'            // fast zoom toward subject (dramatic)
  | 'pull-out'           // fast zoom away (reveal)
  | 'tilt-shift'         // zoom with slight rotation (artistic)
  | 'breathe'            // subtle scale pulse (living photo)
  | 'none';              // static

export interface ColorGrading {
  brightness?: number;  // default 1.0
  contrast?: number;    // default 1.0
  saturate?: number;    // default 1.0
  sepia?: number;       // 0-1
  hueRotate?: number;   // degrees
}

export interface SpringConfig {
  mass: number;
  stiffness: number;
  damping: number;
}

interface CameraMotionProps {
  src: string;
  effect?: CameraEffect;
  intensity?: number; // 0.0 - 1.0, controls how much movement
  children?: React.ReactNode;
  overlay?: 'dark' | 'light' | 'warm' | 'cool' | 'sepia' | 'none';
  overlayOpacity?: number;
  blur?: number;
  colorGrading?: ColorGrading;
  spring_config?: SpringConfig;
  easing?: string; // easing function name for non-spring interpolations
  /** Speed ramp stages: array of [inputFrame%, outputProgress%] pairs.
   *  Example: [0, 0.8, 0.2, 1.0] means fast to 80%, slow to 20%, fast to 100% */
  speedRampStages?: number[];
}

export const CameraMotion: React.FC<CameraMotionProps> = ({
  src,
  effect = 'ken-burns-in',
  intensity = 0.5,
  children,
  overlay = 'dark',
  overlayOpacity = 0.4,
  blur = 0,
  colorGrading,
  spring_config,
  easing,
  speedRampStages,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Speed ramp: remap linear progress through multi-stage curve
  let progress: number;
  if (speedRampStages && speedRampStages.length >= 4 && speedRampStages.length % 2 === 0) {
    // Build input/output arrays from pairs: [in0, out0, in1, out1, ...]
    const inputRange: number[] = [];
    const outputRange: number[] = [];
    for (let idx = 0; idx < speedRampStages.length; idx += 2) {
      inputRange.push(speedRampStages[idx]);
      outputRange.push(speedRampStages[idx + 1]);
    }
    const linearProgress = frame / durationInFrames;
    progress = interpolate(linearProgress, inputRange, outputRange, {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else {
    progress = frame / durationInFrames;
  }
  const i = intensity;

  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let rotate = 0;

  switch (effect) {
    case 'ken-burns-in':
      scale = 1 + progress * 0.15 * i;
      translateY = -progress * 20 * i;
      break;

    case 'ken-burns-out':
      scale = 1.15 * i + 1 - progress * 0.15 * i;
      translateY = progress * 15 * i;
      break;

    case 'pan-left':
      scale = 1.1;
      translateX = (0.5 - progress) * 80 * i;
      break;

    case 'pan-right':
      scale = 1.1;
      translateX = (progress - 0.5) * 80 * i;
      break;

    case 'pan-up':
      scale = 1.1;
      translateY = (0.5 - progress) * 60 * i;
      break;

    case 'pan-down':
      scale = 1.1;
      translateY = (progress - 0.5) * 60 * i;
      break;

    case 'drift':
      scale = 1.08;
      translateX = Math.sin(frame * 0.02) * 15 * i;
      translateY = Math.cos(frame * 0.015) * 10 * i;
      break;

    case 'parallax-zoom':
      scale = 1 + progress * 0.12 * i;
      translateY = Math.sin(frame * 0.025) * 12 * i;
      break;

    case 'push-in': {
      const pushSpringCfg = spring_config
        ? { damping: spring_config.damping, stiffness: spring_config.stiffness, mass: spring_config.mass }
        : { damping: 100, stiffness: 20, mass: 2 };
      const pushProgress = spring({
        frame,
        fps,
        config: pushSpringCfg,
      });
      scale = 1 + pushProgress * 0.25 * i;
      break;
    }

    case 'pull-out': {
      const pullSpringCfg = spring_config
        ? { damping: spring_config.damping, stiffness: spring_config.stiffness, mass: spring_config.mass }
        : { damping: 100, stiffness: 20, mass: 2 };
      const pullProgress = spring({
        frame,
        fps,
        config: pullSpringCfg,
      });
      scale = 1.25 * i + 1 - pullProgress * 0.25 * i;
      break;
    }

    case 'tilt-shift':
      scale = 1 + progress * 0.1 * i;
      rotate = interpolate(progress, [0, 1], [-0.5 * i, 0.5 * i]);
      break;

    case 'breathe':
      scale = 1.02 + Math.sin(frame * 0.05) * 0.02 * i;
      break;

    case 'none':
    default:
      // Ken Burns must always be active — minimum 1.06 even for "none"
      scale = 1.06;
      break;
  }

  const overlayColors: Record<string, string> = {
    dark: `rgba(0,0,0,${overlayOpacity})`,
    light: `rgba(255,255,255,${overlayOpacity})`,
    warm: `rgba(75,46,26,${overlayOpacity})`,
    cool: `rgba(100,140,180,${overlayOpacity})`,
    sepia: `rgba(112,66,20,${overlayOpacity * 0.7})`,
    none: 'transparent',
  };

  const filterParts = [
    blur > 0 ? `blur(${blur}px)` : '',
    overlay === 'sepia' ? 'saturate(0.5) sepia(0.3)' : '',
  ];
  if (colorGrading) {
    if (colorGrading.brightness != null && colorGrading.brightness !== 1) filterParts.push(`brightness(${colorGrading.brightness})`);
    if (colorGrading.contrast != null && colorGrading.contrast !== 1) filterParts.push(`contrast(${colorGrading.contrast})`);
    if (colorGrading.saturate != null && colorGrading.saturate !== 1) filterParts.push(`saturate(${colorGrading.saturate})`);
    if (colorGrading.sepia != null && colorGrading.sepia > 0) filterParts.push(`sepia(${colorGrading.sepia})`);
    if (colorGrading.hueRotate != null && colorGrading.hueRotate !== 0) filterParts.push(`hue-rotate(${colorGrading.hueRotate}deg)`);
  }
  const filterStr = filterParts.filter(Boolean).join(' ') || 'none';

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {/* Background image with camera motion — NEVER stretch, always crop */}
      <div style={{
        position: 'absolute',
        inset: '-10%', // overshoot to avoid edges during movement
        transform: `scale(${scale}) translate(${translateX}px, ${translateY}px) rotate(${rotate}deg)`,
        filter: filterStr,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <Img
          src={src.startsWith('/') || src.startsWith('http') ? src : staticFile(src)}
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'cover',
            objectPosition: 'center center',
          }}
        />
      </div>

      {/* Color overlay */}
      {overlay !== 'none' && (
        <AbsoluteFill style={{
          backgroundColor: overlayColors[overlay],
          zIndex: 2,
        }} />
      )}

      {/* Children (text, product, etc.) */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * Choose camera effect based on scene type.
 */
export function getDefaultCameraEffect(sceneType: string): CameraEffect {
  const map: Record<string, CameraEffect> = {
    'hook': 'push-in',
    'produto_em_acao': 'ken-burns-in',
    'product_showcase': 'ken-burns-in',
    'solution': 'pan-right',
    'close_produto': 'ken-burns-in',
    'benefit': 'parallax-zoom',
    'conexao_emocional': 'drift',
    'flashback_infancia': 'ken-burns-out',
    'flashback_adolescencia': 'pan-left',
    'presente': 'push-in',
    'gift': 'push-in',
    'cta': 'breathe',
  };

  for (const [key, effect] of Object.entries(map)) {
    if (sceneType.includes(key)) return effect;
  }
  return 'ken-burns-in';
}

/**
 * Choose overlay based on scene type.
 */
export function getDefaultOverlay(sceneType: string): 'dark' | 'light' | 'warm' | 'cool' | 'sepia' | 'none' {
  if (sceneType.includes('hook')) return 'dark';
  if (sceneType.includes('flashback') || sceneType.includes('memoria')) return 'sepia';
  if (sceneType.includes('cta')) return 'light';
  if (sceneType.includes('conexao') || sceneType.includes('benefit')) return 'warm';
  if (sceneType.includes('produto') || sceneType.includes('product') || sceneType.includes('close')) return 'cool';
  return 'dark';
}
