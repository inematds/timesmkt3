#!/usr/bin/env node

/**
 * render-video-remotion.js
 *
 * Adapts a Video Pro scene plan to Remotion format and renders via CLI.
 *
 * Usage:
 *   node pipeline/render-video-remotion.js <scene_plan.json> <output.mp4>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REMOTION_DIR = path.join(PROJECT_ROOT, 'remotion-ad');
const PUBLIC_DIR = path.join(REMOTION_DIR, 'public');
const FPS = 30;

// Motion type normalization
const MOTION_MAP = {
  'zoom_in': 'ken-burns-in',
  'zoom_out': 'ken-burns-out',
  'pan_right': 'pan-right',
  'pan_left': 'pan-left',
  'pan_up': 'pan-up',
  'pan_down': 'pan-down',
  'push-in': 'push-in',
  'pull-out': 'pull-out',
  'drift': 'drift',
  'parallax-zoom': 'parallax-zoom',
  'parallax': 'parallax-zoom',
  'tilt-shift': 'tilt-shift',
  'breathe': 'breathe',
  'ken-burns-in': 'ken-burns-in',
  'ken-burns-out': 'ken-burns-out',
  'zoom-out': 'ken-burns-out',
  'zoom-in': 'ken-burns-in',
};

// Scene type to Remotion tipo
const TYPE_MAP = {
  'hook': 'hook',
  'intro': 'hook',
  'middle': 'produto_em_acao',
  'benefit': 'benefit',
  'cta': 'cta',
  'social_proof': 'conexao_emocional',
  'tension': 'conexao_emocional',
  'solution': 'benefit',
};

// Text animation mapping
const ANIM_MAP = {
  'blur-in': 'blur-in',
  'slide-up': 'slide-up',
  'slide-down': 'slide-down',
  'per-word': 'per-word',
  'punch-in': 'punch-in',
  'bounce-in': 'bounce-in',
  'typewriter': 'typewriter',
  'scale-up': 'scale-up',
  'fade': 'fade',
};

// Font family normalization — scene plan can use short names
const FONT_MAP = {
  'inter': 'Inter, sans-serif',
  'montserrat': 'Montserrat, sans-serif',
  'playfair': 'Playfair Display, serif',
  'playfair display': 'Playfair Display, serif',
  'oswald': 'Oswald, sans-serif',
  'space grotesk': 'Space Grotesk, sans-serif',
  'space_grotesk': 'Space Grotesk, sans-serif',
  'poppins': 'Poppins, sans-serif',
  'raleway': 'Raleway, sans-serif',
  'bebas': 'Bebas Neue, sans-serif',
  'bebas neue': 'Bebas Neue, sans-serif',
};

// Transition type normalization
const TRANSITION_MAP = {
  'crossfade': 'crossfade',
  'fade': 'crossfade',
  'fade_black': 'fade_black',
  'fade_to_black': 'fade_black',
  'slide_left': 'slide_left',
  'slide_right': 'slide_right',
  'wipe': 'wipe',
  'rack-focus': 'rack-focus',
  'rack_focus': 'rack-focus',
  'whip-blur': 'whip-blur',
  'whip_blur': 'whip-blur',
  'defocus-refocus': 'defocus-refocus',
  'defocus_refocus': 'defocus-refocus',
  'chromatic-glitch': 'chromatic-glitch',
  'chromatic_glitch': 'chromatic-glitch',
  'glitch': 'chromatic-glitch',
  'none': 'none',
  'cut': 'none',
};

// Resolve text position — NEVER bottom (social media UI covers that area)
// Only "top" and "center" are safe positions
function resolveTextPosition(rawPos, sceneType) {
  // RULE: bottom is FORBIDDEN — social media UI (buttons, swipe, handles) covers it
  if (rawPos === 'bottom') return 'top';
  // top is always good
  if (rawPos === 'top') return 'top';
  // center is OK for CTA, impact words, short text
  if (rawPos === 'center') {
    if (sceneType === 'cta') return 'center';
    // For other types, prefer top unless it's a single-word impact scene
    return 'top';
  }
  // Default: top (magazine cover style)
  return 'top';
}

// Default font size by scene type — magazine cover style (large, impactful)
function getDefaultFontSize(sceneType) {
  const sizes = {
    'hook': 96,
    'intro': 88,
    'problem': 80,
    'tension': 80,
    'middle': 72,
    'benefit': 80,
    'solution': 88,
    'social_proof': 72,
    'cta': 80,
  };
  return sizes[sceneType] || 76;
}

// Default animation by scene type
const DEFAULT_ANIM = {
  'hook': 'blur-in',
  'intro': 'fade',
  'middle': 'slide-up',
  'benefit': 'per-word',
  'cta': 'bounce-in',
  'social_proof': 'per-word',
  'tension': 'fade',
  'solution': 'slide-up',
};

/**
 * Copies a file to Remotion's public/ directory and returns the relative path.
 */
function copyToPublic(absPath, subdir = 'assets') {
  if (!absPath || !fs.existsSync(absPath)) return null;
  const destDir = path.join(PUBLIC_DIR, subdir);
  fs.mkdirSync(destDir, { recursive: true });
  const filename = path.basename(absPath);
  const destPath = path.join(destDir, filename);
  if (!fs.existsSync(destPath)) {
    fs.copyFileSync(absPath, destPath);
  }
  return `${subdir}/${filename}`;
}

/**
 * Converts a Video Pro scene plan to Remotion DynamicAd props.
 */
function adaptScenePlan(plan) {
  let frameOffset = 0;
  const scenes = [];

  for (let i = 0; i < plan.scenes.length; i++) {
    const s = plan.scenes[i];
    const durationSec = s.duration || 3;
    const durationFrames = Math.round(durationSec * FPS);

    // Copy image to public/
    let backgroundImage = null;
    if (s.image && fs.existsSync(s.image)) {
      backgroundImage = copyToPublic(s.image, 'assets');
    }

    // Determine camera effect
    const motionType = s.motion?.type || s.camera_effect || 'ken-burns-in';
    const cameraEffect = MOTION_MAP[motionType] || motionType;

    // Text animation
    const textAnim = s.text_animation
      ? (ANIM_MAP[s.text_animation] || s.text_animation)
      : (DEFAULT_ANIM[s.type] || 'fade');

    scenes.push({
      scene_id: i + 1,
      tipo: TYPE_MAP[s.type] || 'benefit',
      nome: s.id || s.type || `Scene ${i + 1}`,
      frame_inicio: frameOffset,
      frame_fim: frameOffset + durationFrames,
      duracao_frames: durationFrames,
      descricao_visual: s.image_prompt || '',
      background_image: backgroundImage,
      camera_effect: cameraEffect,
      // Motion spring config + easing + speed ramp passthrough
      motion: {
        type: motionType,
        spring_config: s.motion?.spring_config || null,
        easing: s.motion?.easing || null,
        speed_ramp_stages: s.motion?.speed_ramp_stages || s.speed_ramp_stages || null,
      },
      // HUD text mode for tech/futuristic style
      hud_text: s.hud_text || null,
      // Lens transition override
      lens_transition: s.lens_transition || null,
      lens_transition_frames: s.lens_transition_frames || null,
      text_overlay: s.text_overlay ? {
        texto: s.text_overlay,
        animacao: textAnim,
        cor: s.text_color || s.text_layout?.color || '#FFFFFF',
        // Magazine style: "center" from old plans is treated as unset → default to "top"
        posicao: resolveTextPosition(s.text_position || s.text_layout?.position, s.type),
        tamanho: s.text_layout?.font_size || getDefaultFontSize(s.type),
        peso: s.text_layout?.font_weight || 900,
        line_height: s.text_layout?.line_height || 1.0,
        font_family: s.text_layout?.font_family
          ? (FONT_MAP[(s.text_layout.font_family || '').toLowerCase()] || s.text_layout.font_family)
          : 'Montserrat, sans-serif',
      } : null,
      overlay: s.overlay || 'dark',
      overlay_opacity: s.overlay_opacity || 0.45,
      transition: TRANSITION_MAP[s.transition] || (i > 0 ? 'crossfade' : 'none'),
      transition_duration: s.transition_duration || 10,
      color_grading: s.color_grading || null,
      // Film grain (0-1)
      grain: s.grain || 0,
      // Auto text_band for scenes with text overlay (magazine readability)
      text_band: s.text_band || (s.text_overlay ? {
        style: 'gradient',
        color: '#000000',
        opacity: 0.5,
        height: '45%',
      } : null),
      lower_third: s.lower_third || null,
      subtitles: s.subtitles || null,
      subtitle_style: s.subtitle_style || null,
      cta_style: s.cta_style || 'solid',
      // Sound design tokens (future: map to actual SFX files)
      sound_event: s.sound_event || null,
      // Glow pulse for CTA scenes
      ...(s.type === 'cta' && plan.glow_pulse ? { glow_pulse: plan.glow_pulse } : {}),
    });

    frameOffset += durationFrames;
  }

  // Add 2s padding at the end so narration never gets cut off
  const END_PADDING_FRAMES = FPS * 2; // 60 frames = 2 seconds
  if (scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    lastScene.duracao_frames += END_PADDING_FRAMES;
    lastScene.frame_fim += END_PADDING_FRAMES;
    frameOffset += END_PADDING_FRAMES;
  }

  // Copy audio files
  const narrationFile = plan.audio || plan.narration_file;
  const narrationPublic = narrationFile
    ? copyToPublic(path.resolve(PROJECT_ROOT, narrationFile), 'audio')
    : null;

  // Music: try multiple fields and resolve path
  let musicFile = plan.music || plan.background_music || null;
  let musicPublic = null;
  if (musicFile) {
    // Try as-is (relative to PROJECT_ROOT)
    let absMusic = path.resolve(PROJECT_ROOT, musicFile);
    if (!fs.existsSync(absMusic)) {
      // Try just the filename in common music dirs
      const basename = path.basename(musicFile);
      const searchDirs = ['assets/music', 'assets/audio', 'assets'];
      for (const dir of searchDirs) {
        const candidate = path.resolve(PROJECT_ROOT, dir, basename);
        if (fs.existsSync(candidate)) { absMusic = candidate; break; }
      }
    }
    musicPublic = fs.existsSync(absMusic)
      ? copyToPublic(absMusic, 'audio')
      : null;
    if (!musicPublic) {
      console.log(`Warning: music file not found: ${musicFile}`);
    }
  }

  return {
    titulo: plan.titulo || 'Video',
    total_frames: frameOffset,
    scenes,
    paleta_cores: {
      coffee_dark: '#0D0D0D',
      coffee_mid: '#1A1A2E',
      cold_blue: '#0099FF',
      amber: '#00FF88',
      off_white: '#FFFFFF',
    },
    narration_file: narrationPublic,
    narration_volume: plan.narration_volume || 1,
    background_music: musicPublic,
    background_music_volume: plan.music_volume || 0.15,
    cta_final: plan.scenes.find(s => s.type === 'cta')?.text_overlay || '',
    // Global color grading — uniform LUT effect across all scenes
    color_grading: plan.color_grading || null,
    // Digital overlay for tech/futuristic themes
    digital_overlay: plan.digital_overlay || null,
    // Film grain — "same camera, same day" unity layer
    film_grain: plan.film_grain || null,
    // Organic camera shake — subtle hand-held feel
    organic_shake: plan.organic_shake || null,
    // Sound design tokens (logged for future SFX integration)
    sound_design: plan.sound_design || null,
  };

  // Log sound design events for future SFX integration
  if (plan.sound_design) {
    console.log(`Sound design tokens: ${JSON.stringify(plan.sound_design)}`);
  }
  const soundEvents = scenes.filter(s => s.sound_event).map(s => `Scene ${s.scene_id}: ${s.sound_event}`);
  if (soundEvents.length > 0) {
    console.log(`Sound events: ${soundEvents.join(', ')}`);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
const [,, scenePlanArg, outputArg] = process.argv;

if (!scenePlanArg || !outputArg) {
  console.error('Usage: node pipeline/render-video-remotion.js <scene_plan.json> <output.mp4>');
  process.exit(1);
}

const scenePlanPath = path.resolve(PROJECT_ROOT, scenePlanArg);
if (!fs.existsSync(scenePlanPath)) {
  console.error(`Scene plan not found: ${scenePlanPath}`);
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(scenePlanPath, 'utf-8'));
console.log(`Adapting scene plan: ${plan.scenes.length} scenes, ${plan.titulo || 'untitled'}`);

const props = adaptScenePlan(plan);
console.log(`Adapted: ${props.scenes.length} scenes, ${props.total_frames} frames (${(props.total_frames / FPS).toFixed(1)}s)`);
console.log(`Audio: narration=${props.narration_file || 'none'}, music=${props.background_music || 'none'}`);

// Write props to temp file
const propsPath = path.join(REMOTION_DIR, 'temp_render_props.json');
fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

// Determine format
const width = plan.width || 1080;
const height = plan.height || 1920;
const compositionId = height > width ? 'DynamicAd' : 'DynamicAdSquare';

const outputPath = path.resolve(PROJECT_ROOT, outputArg);

console.log(`Rendering ${compositionId} (${width}x${height}) → ${outputPath}`);

try {
  const remotionBin = path.join(REMOTION_DIR, 'node_modules', '.bin', 'remotion');
  const { spawnSync } = require('child_process');
  const result = spawnSync(remotionBin, [
    'render',
    compositionId,
    outputPath,
    `--props=${propsPath}`,
  ], {
    cwd: REMOTION_DIR,
    stdio: 'inherit',
    timeout: 600000,
    env: { ...process.env, NODE_PATH: '' },
  });
  if (result.status !== 0) throw new Error(`Exit code ${result.status}`);

  console.log(`\n✅ Remotion render complete: ${outputPath}`);
} catch (err) {
  console.error(`\n❌ Remotion render failed: ${err.message}`);
  process.exit(1);
} finally {
  // Cleanup temp props
  if (fs.existsSync(propsPath)) fs.unlinkSync(propsPath);
}
