import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export type TextAnimation =
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'per-word'
  | 'punch-in'
  | 'typewriter'
  | 'blur-in'
  | 'scale-up'
  | 'bounce-in'
  | 'split-lines';

interface TextOverlayProps {
  text: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  position?: 'top' | 'center' | 'bottom';
  positionPercent?: number;
  animation?: TextAnimation;
  startFrame?: number;
  italic?: boolean;
  shadow?: boolean;
  uppercase?: boolean;
  letterSpacing?: string;
  lineHeight?: number;
  maxWidth?: string;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  fontSize = 60,
  color = '#F9F5F0',
  fontFamily = 'Inter, sans-serif',
  fontWeight = 800,
  position = 'center',
  positionPercent,
  animation = 'slide-up',
  startFrame = 10,
  italic = false,
  shadow = true,
  uppercase = false,
  letterSpacing = '-0.02em',
  lineHeight = 1.15,
  maxWidth = '90%',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const posStyle = getPositionStyle(position, positionPercent, maxWidth);
  const shadowStr = shadow ? '0 4px 24px rgba(0,0,0,0.6)' : 'none';

  const baseStyle: React.CSSProperties = {
    color,
    fontFamily,
    fontSize,
    fontWeight,
    fontStyle: italic ? 'italic' : 'normal',
    lineHeight,
    textShadow: shadowStr,
    letterSpacing,
    textTransform: uppercase ? 'uppercase' : 'none',
    textAlign: 'center' as const,
  };

  // Per-word animations
  if (animation === 'per-word' || animation === 'punch-in' || animation === 'bounce-in' || animation === 'split-lines') {
    return (
      <div style={{ ...posStyle, textAlign: 'center', zIndex: 20 }}>
        <WordAnimation
          text={text}
          style={baseStyle}
          animation={animation}
          startFrame={startFrame}
          fps={fps}
          frame={frame}
        />
      </div>
    );
  }

  // Typewriter
  if (animation === 'typewriter') {
    const charsVisible = Math.floor(
      interpolate(frame, [startFrame, startFrame + text.length * 2], [0, text.length], {
        extrapolateRight: 'clamp',
        extrapolateLeft: 'clamp',
      })
    );
    return (
      <div style={{ ...posStyle, textAlign: 'center', zIndex: 20 }}>
        <div style={baseStyle}>
          {text.substring(0, charsVisible)}
          <span style={{ opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0 }}>|</span>
        </div>
      </div>
    );
  }

  // Single-block animations
  let opacity = 1;
  let translateX = 0;
  let translateY = 0;
  let scale = 1;
  let blur = 0;

  const relFrame = Math.max(0, frame - startFrame);
  const springVal = spring({ frame: relFrame, fps, config: { damping: 14 } });
  const fadeIn = interpolate(frame, [startFrame, startFrame + 20], [0, 1], {
    extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
  });

  switch (animation) {
    case 'fade':
      opacity = fadeIn;
      break;
    case 'slide-up':
      opacity = fadeIn;
      translateY = interpolate(springVal, [0, 1], [50, 0]);
      break;
    case 'slide-down':
      opacity = fadeIn;
      translateY = interpolate(springVal, [0, 1], [-50, 0]);
      break;
    case 'slide-left':
      opacity = fadeIn;
      translateX = interpolate(springVal, [0, 1], [80, 0]);
      break;
    case 'slide-right':
      opacity = fadeIn;
      translateX = interpolate(springVal, [0, 1], [-80, 0]);
      break;
    case 'blur-in':
      opacity = fadeIn;
      blur = interpolate(frame, [startFrame, startFrame + 25], [12, 0], {
        extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
      });
      break;
    case 'scale-up':
      opacity = fadeIn;
      scale = interpolate(springVal, [0, 1], [0.5, 1]);
      break;
    default:
      opacity = fadeIn;
  }

  return (
    <div style={{ ...posStyle, textAlign: 'center', zIndex: 20 }}>
      <div style={{
        ...baseStyle,
        opacity,
        transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
        filter: blur > 0 ? `blur(${blur}px)` : 'none',
      }}>
        {text}
      </div>
    </div>
  );
};

// ── Word-level animations ───────────────────────────────────────────────────

const WordAnimation: React.FC<{
  text: string;
  style: React.CSSProperties;
  animation: TextAnimation;
  startFrame: number;
  fps: number;
  frame: number;
}> = ({ text, style, animation, startFrame, fps, frame }) => {
  const isLines = animation === 'split-lines';
  const items = isLines ? text.split('\n').filter(Boolean) : text.split(' ');
  const delayPer = animation === 'punch-in' ? 15 : animation === 'bounce-in' ? 10 : 12;

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: isLines ? '8px' : `${(style.fontSize as number || 60) * 0.3}px`,
      flexDirection: isLines ? 'column' : 'row',
      alignItems: 'center',
    }}>
      {items.map((item, i) => {
        const itemStart = startFrame + i * delayPer;
        const opacity = interpolate(frame, [itemStart, itemStart + 12], [0, 1], {
          extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
        });

        let transform = '';

        if (animation === 'per-word') {
          const slide = spring({
            frame: Math.max(0, frame - itemStart),
            fps,
            config: { damping: 14 },
          });
          transform = `translateY(${interpolate(slide, [0, 1], [30, 0])}px)`;
        } else if (animation === 'punch-in') {
          const sc = spring({
            frame: Math.max(0, frame - itemStart),
            fps,
            config: { damping: 8, stiffness: 150 },
          });
          transform = `scale(${0.3 + sc * 0.7})`;
        } else if (animation === 'bounce-in') {
          const sc = spring({
            frame: Math.max(0, frame - itemStart),
            fps,
            config: { damping: 6, stiffness: 180, mass: 0.8 },
          });
          transform = `scale(${sc}) translateY(${interpolate(sc, [0, 1], [40, 0])}px)`;
        } else if (animation === 'split-lines') {
          const slide = spring({
            frame: Math.max(0, frame - itemStart),
            fps,
            config: { damping: 12 },
          });
          transform = `translateX(${interpolate(slide, [0, 1], [60, 0])}px)`;
        }

        return (
          <span key={i} style={{
            ...style,
            opacity,
            transform,
            display: 'inline-block',
          }}>
            {item}
          </span>
        );
      })}
    </div>
  );
};

// ── Position helpers ────────────────────────────────────────────────────────

function getPositionStyle(
  position: 'top' | 'center' | 'bottom',
  positionPercent: number | undefined,
  maxWidth: string,
): React.CSSProperties {
  if (positionPercent !== undefined) {
    return {
      position: 'absolute', top: `${positionPercent}%`,
      left: '50%', transform: 'translateX(-50%)', width: maxWidth,
    };
  }
  const map: Record<string, React.CSSProperties> = {
    top: { position: 'absolute', top: '8%', left: '50%', transform: 'translateX(-50%)', width: maxWidth },
    center: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: maxWidth },
    bottom: { position: 'absolute', bottom: '8%', left: '50%', transform: 'translateX(-50%)', width: maxWidth },
  };
  return map[position] || map.center;
}

// ── Animation picker based on scene type ────────────────────────────────────

export function getTextAnimationForScene(sceneType: string): TextAnimation {
  if (sceneType.includes('hook')) return 'blur-in';
  if (sceneType.includes('flashback') || sceneType.includes('memoria')) return 'typewriter';
  if (sceneType.includes('conexao') || sceneType.includes('benefit')) return 'per-word';
  if (sceneType.includes('presente') || sceneType.includes('gift')) return 'punch-in';
  if (sceneType.includes('cta')) return 'bounce-in';
  if (sceneType.includes('produto') || sceneType.includes('product')) return 'slide-up';
  if (sceneType.includes('close')) return 'fade';
  return 'slide-up';
}
