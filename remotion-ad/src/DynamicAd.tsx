import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, staticFile } from 'remotion';
import { DynamicScene, SceneData } from './scenes/DynamicScene';
import { Subtitles, SubtitleSegment } from './components/Subtitles';
import { ProgressBar, ProgressBarStyle } from './components/ProgressBar';

export interface ScenePlanProps {
  [key: string]: unknown;
  titulo?: string;
  campaign?: string;
  campanha?: string;
  video_length?: number;
  total_frames?: number;
  paleta_cores?: Record<string, string>;
  color_palette?: Record<string, string>;
  cta_final?: string;
  cta_acao?: string;
  scenes: SceneData[];
  scene_images?: Record<string, string>;
  // Audio — continuous narration + background music
  narration_file?: string;
  narration_volume?: number;
  background_music?: string;
  background_music_volume?: number;
  // Global subtitles (synced to narration)
  subtitles?: SubtitleSegment[];
  subtitle_style?: 'default' | 'bold' | 'karaoke' | 'minimal';
  // Progress bar
  progress_bar?: ProgressBarStyle | false;
  progress_bar_color?: string;
}

// ── Transition wrapper ──────────────────────────────────────────────────────

type TransitionType = 'crossfade' | 'fade_black' | 'slide_left' | 'slide_right' | 'wipe' | 'none';

const SceneWithTransition: React.FC<{
  children: React.ReactNode;
  transition?: TransitionType;
  transitionDuration?: number; // frames for fade-in at start
  sceneDuration: number;
}> = ({ children, transition = 'none', transitionDuration = 0, sceneDuration }) => {
  const frame = useCurrentFrame();

  if (transition === 'none' || transitionDuration === 0) {
    return <AbsoluteFill>{children}</AbsoluteFill>;
  }

  // Fade in at start of scene (overlap region)
  const fadeIn = interpolate(frame, [0, transitionDuration], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });

  if (transition === 'crossfade') {
    return <AbsoluteFill style={{ opacity: fadeIn }}>{children}</AbsoluteFill>;
  }

  if (transition === 'fade_black') {
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: '#000' }} />
        <AbsoluteFill style={{ opacity: fadeIn }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    );
  }

  if (transition === 'slide_left') {
    const slideX = interpolate(fadeIn, [0, 1], [100, 0]);
    return (
      <AbsoluteFill style={{ transform: `translateX(${slideX}%)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (transition === 'slide_right') {
    const slideX = interpolate(fadeIn, [0, 1], [-100, 0]);
    return (
      <AbsoluteFill style={{ transform: `translateX(${slideX}%)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  if (transition === 'wipe') {
    const clipX = interpolate(fadeIn, [0, 1], [0, 100]);
    return (
      <AbsoluteFill style={{ clipPath: `inset(0 ${100 - clipX}% 0 0)` }}>
        {children}
      </AbsoluteFill>
    );
  }

  return <AbsoluteFill>{children}</AbsoluteFill>;
};

export const DynamicAd: React.FC<ScenePlanProps> = (props) => {
  const {
    scenes = [],
    paleta_cores,
    color_palette,
    cta_final,
    cta_acao,
    scene_images,
    narration_file,
    narration_volume = 1,
    background_music,
    background_music_volume = 0.25,
    subtitles: globalSubtitles,
    subtitle_style: globalSubtitleStyle,
    progress_bar: progressBarStyle,
    progress_bar_color: progressBarColor,
  } = props;

  const palette: Record<string, string> = {
    ...color_palette,
    ...paleta_cores,
  };

  if (!palette.coffee_dark && !palette.fundo_principal) {
    palette.coffee_dark = '#2C1A0E';
    palette.coffee_mid = '#4B2E1A';
    palette.cold_blue = '#BFD9E8';
    palette.amber = '#F5A623';
    palette.off_white = '#F9F5F0';
  }

  const bgColor = palette.coffee_dark || palette.fundo_principal || '#2C1A0E';

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Background music — plays for full video duration */}
      {background_music && (
        <Audio
          src={staticFile(background_music)}
          volume={background_music_volume}
        />
      )}

      {/* Continuous narration — single fluid audio over all scenes */}
      {narration_file && (
        <Audio
          src={staticFile(narration_file)}
          volume={narration_volume}
        />
      )}

      {/* Visual scenes with transitions */}
      {scenes.map((scene, index) => {
        const startFrame = scene.frame_inicio || 0;
        const duration = scene.duracao_frames || 90;
        const isLast = index === scenes.length - 1;

        // Transition: visual overlap only — content starts at exact frame_inicio
        // to keep text synchronized with narration audio
        const transition = scene.transition || (index > 0 ? 'crossfade' : 'none');
        const transitionDuration = scene.transition_duration || (transition !== 'none' ? 10 : 0);

        return (
          <Sequence
            key={scene.scene_id || index}
            from={startFrame}
            durationInFrames={duration}
            name={scene.nome || scene.tipo || `Scene ${index + 1}`}
          >
            <SceneWithTransition
              transition={transition as TransitionType}
              transitionDuration={transitionDuration}
              sceneDuration={duration}
            >
              <DynamicScene
                scene={scene}
                palette={palette}
                ctaText={cta_final}
                ctaAction={cta_acao}
                isLastScene={isLast}
                sceneImages={scene_images as Record<string, string>}
              />
            </SceneWithTransition>
          </Sequence>
        );
      })}

      {/* Global subtitles (synced to narration, rendered above all scenes) */}
      {globalSubtitles && globalSubtitles.length > 0 && (
        <AbsoluteFill style={{ zIndex: 50 }}>
          <Subtitles
            segments={globalSubtitles}
            style={globalSubtitleStyle || 'default'}
          />
        </AbsoluteFill>
      )}

      {/* Progress bar (stories style) */}
      {progressBarStyle !== false && progressBarStyle && (
        <AbsoluteFill style={{ zIndex: 55, pointerEvents: 'none' }}>
          <ProgressBar
            segments={scenes.length}
            segmentDurations={scenes.map(s => s.duracao_frames || 90)}
            style={progressBarStyle}
            color={progressBarColor || '#FFFFFF'}
          />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
