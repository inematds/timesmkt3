import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';

interface HUDTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  accentColor?: string;
  fontFamily?: string;
  fontWeight?: number;
  position?: 'top' | 'center';
  startFrame?: number;
  /** Show animated brackets around text */
  brackets?: boolean;
  /** Show scan line before text reveal */
  scanLine?: boolean;
  /** Show binary/hex data in corners */
  dataPoints?: boolean;
  /** Show coordinates overlay */
  coordinates?: boolean;
}

/**
 * HUDText — Interface-style text that looks like a tech HUD overlay.
 * Features: animated brackets, scan line reveal, binary data corners, coordinates.
 */
export const HUDText: React.FC<HUDTextProps> = ({
  text,
  fontSize = 80,
  color = '#FFFFFF',
  accentColor = '#0099FF',
  fontFamily = 'Oswald, sans-serif',
  fontWeight = 900,
  position = 'top',
  startFrame = 10,
  brackets = true,
  scanLine = true,
  dataPoints = true,
  coordinates = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = frame - startFrame;

  if (relFrame < 0) return null;

  // Phase 1: Scan line sweeps (0-8 frames)
  const scanProgress = interpolate(relFrame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });

  // Phase 2: Text reveals (after scan, spring pop)
  const textSpring = spring({
    frame: Math.max(0, relFrame - 6),
    fps,
    config: { mass: 0.5, stiffness: 200, damping: 10 },
  });

  // Phase 3: Brackets animate in (slightly after text)
  const bracketSpring = spring({
    frame: Math.max(0, relFrame - 4),
    fps,
    config: { mass: 0.3, stiffness: 300, damping: 12 },
  });

  // Data points flicker
  const dataFlicker = Math.sin(frame * 0.3) > -0.3 ? 1 : 0.3;

  const positionStyle: React.CSSProperties = position === 'top'
    ? { top: '15%', left: '50%', transform: 'translateX(-50%)' }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  const displayText = brackets ? `[ ${text} ]` : text;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Scan line */}
      {scanLine && scanProgress < 1 && (
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${scanProgress * 100}%`,
          height: 2,
          background: `linear-gradient(90deg, transparent 0%, ${accentColor} 30%, ${accentColor} 70%, transparent 100%)`,
          opacity: 0.6,
          boxShadow: `0 0 20px ${accentColor}, 0 0 40px ${accentColor}`,
          zIndex: 60,
        }} />
      )}

      {/* Main text */}
      <div style={{
        position: 'absolute',
        ...positionStyle,
        zIndex: 61,
        textAlign: 'center',
        maxWidth: '85%',
      }}>
        {/* Bracket glow border box */}
        {brackets && (
          <div style={{
            position: 'absolute',
            inset: -16,
            border: `1px solid ${accentColor}40`,
            opacity: bracketSpring,
            boxShadow: `inset 0 0 30px ${accentColor}10, 0 0 15px ${accentColor}20`,
          }}>
            {/* Corner accents */}
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => {
              const isTop = corner.includes('top');
              const isLeft = corner.includes('left');
              return (
                <div key={corner} style={{
                  position: 'absolute',
                  [isTop ? 'top' : 'bottom']: -1,
                  [isLeft ? 'left' : 'right']: -1,
                  width: 16,
                  height: 16,
                  borderTop: isTop ? `2px solid ${accentColor}` : 'none',
                  borderBottom: !isTop ? `2px solid ${accentColor}` : 'none',
                  borderLeft: isLeft ? `2px solid ${accentColor}` : 'none',
                  borderRight: !isLeft ? `2px solid ${accentColor}` : 'none',
                }} />
              );
            })}
          </div>
        )}

        <div style={{
          fontFamily,
          fontWeight,
          fontSize,
          color,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          textShadow: `0 0 20px ${accentColor}80, 0 2px 10px rgba(0,0,0,0.8)`,
          opacity: textSpring,
          transform: `scale(${0.9 + textSpring * 0.1})`,
          lineHeight: 1.1,
        }}>
          {displayText}
        </div>

        {/* Sub-label (monospace technical) */}
        {coordinates && (
          <div style={{
            fontFamily: 'Space Grotesk, monospace',
            fontSize: 14,
            color: accentColor,
            opacity: textSpring * 0.6,
            marginTop: 8,
            letterSpacing: '0.15em',
          }}>
            X:1080 Y:1920 | F:{String(frame).padStart(4, '0')} | 30FPS
          </div>
        )}
      </div>

      {/* Data points in corners */}
      {dataPoints && (
        <>
          {/* Top-left */}
          <div style={{
            position: 'absolute',
            top: 40,
            left: 30,
            fontFamily: 'monospace',
            fontSize: 10,
            color: accentColor,
            opacity: 0.2 * dataFlicker * textSpring,
            lineHeight: 1.4,
            zIndex: 59,
          }}>
            {'0x4F 0x2E\n0xA1 0x7C\nSYS:ACTIVE'}
          </div>
          {/* Top-right */}
          <div style={{
            position: 'absolute',
            top: 40,
            right: 30,
            fontFamily: 'monospace',
            fontSize: 10,
            color: accentColor,
            opacity: 0.2 * dataFlicker * textSpring,
            textAlign: 'right',
            lineHeight: 1.4,
            zIndex: 59,
          }}>
            {`T:${(frame / fps).toFixed(1)}s\nF:${String(frame).padStart(4, '0')}\nRDY`}
          </div>
          {/* Bottom-left */}
          <div style={{
            position: 'absolute',
            bottom: 140,
            left: 30,
            fontFamily: 'monospace',
            fontSize: 10,
            color: accentColor,
            opacity: 0.15 * dataFlicker * textSpring,
            zIndex: 59,
          }}>
            {'10110010 01001101'}
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
