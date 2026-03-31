import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame, staticFile } from 'remotion';
import { DynamicScene, SceneData } from './scenes/DynamicScene';
import { Subtitles, SubtitleSegment } from './components/Subtitles';
import { ProgressBar, ProgressBarStyle } from './components/ProgressBar';
import { FilmGrain } from './components/FilmGrain';
import { OrganicShake } from './components/OrganicShake';
import { LensTransition, LensTransitionType } from './components/LensTransition';

export interface GlobalColorGrading {
  gamma?: number;
  saturate?: number;
  contrast?: number;
  hueRotate?: number;
}

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
  // Global color grading — applied to ALL scenes uniformly
  color_grading?: GlobalColorGrading;
  // Film grain — applied across ALL scenes for "same camera" unity
  film_grain?: {
    intensity?: number;
    monochromatic?: boolean;
    lightLeak?: boolean;
    lightLeakColor?: string;
    lightLeakOpacity?: number;
  };
  // Organic camera shake — subtle hand-held feel
  organic_shake?: {
    amplitude?: number;
    frequency?: number;
    rotation?: boolean;
  };
}

// ── Transition wrapper ──────────────────────────────────────────────────────

type TransitionType = 'crossfade' | 'fade_black' | 'slide_left' | 'slide_right' | 'wipe' | 'rack-focus' | 'whip-blur' | 'defocus-refocus' | 'chromatic-glitch' | 'none';

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

  // Lens transitions (rack-focus, whip-blur, defocus-refocus, chromatic-glitch)
  if (['rack-focus', 'whip-blur', 'defocus-refocus', 'chromatic-glitch'].includes(transition)) {
    return (
      <LensTransition
        type={transition as LensTransitionType}
        durationFrames={transitionDuration || 6}
      >
        {children}
      </LensTransition>
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
    color_grading: globalColorGrading,
    film_grain: filmGrainConfig,
    organic_shake: organicShakeConfig,
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

  // Build global color grading CSS filter
  const gradingFilterParts: string[] = [];
  if (globalColorGrading) {
    if (globalColorGrading.gamma != null && globalColorGrading.gamma !== 1) {
      gradingFilterParts.push(`brightness(${globalColorGrading.gamma})`);
    }
    if (globalColorGrading.saturate != null && globalColorGrading.saturate !== 1) {
      gradingFilterParts.push(`saturate(${globalColorGrading.saturate})`);
    }
    if (globalColorGrading.contrast != null && globalColorGrading.contrast !== 1) {
      gradingFilterParts.push(`contrast(${globalColorGrading.contrast})`);
    }
    if (globalColorGrading.hueRotate != null && globalColorGrading.hueRotate !== 0) {
      gradingFilterParts.push(`hue-rotate(${globalColorGrading.hueRotate}deg)`);
    }
  }
  const gradingFilter = gradingFilterParts.length > 0 ? gradingFilterParts.join(' ') : undefined;

  const innerContent = (children: React.ReactNode) => {
    if (organicShakeConfig) {
      return (
        <OrganicShake
          amplitude={organicShakeConfig.amplitude || 2}
          frequency={organicShakeConfig.frequency || 1}
          rotation={organicShakeConfig.rotation !== false}
        >
          {children}
        </OrganicShake>
      );
    }
    return <>{children}</>;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      {/* Global color grading wrapper — unifies look across all scenes */}
      <div style={{
        position: 'absolute',
        inset: 0,
        filter: gradingFilter,
      }}>
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

        {/* Visual scenes with transitions — wrapped in OrganicShake if configured */}
        {innerContent(scenes.map((scene, index) => {
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
        }))}

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

        {/* Film grain — "same camera, same day" unity layer */}
        {filmGrainConfig && (
          <FilmGrain
            intensity={filmGrainConfig.intensity || 0.03}
            monochromatic={filmGrainConfig.monochromatic !== false}
            lightLeak={filmGrainConfig.lightLeak || false}
            lightLeakColor={filmGrainConfig.lightLeakColor}
            lightLeakOpacity={filmGrainConfig.lightLeakOpacity}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
