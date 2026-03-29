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
      text_overlay: s.text_overlay ? {
        texto: s.text_overlay,
        animacao: textAnim,
        cor: s.text_color || '#FFFFFF',
        posicao: s.text_position || s.text_layout?.position || 'center',
      } : null,
      overlay: s.overlay || 'dark',
      overlay_opacity: s.overlay_opacity || 0.4,
    });

    frameOffset += durationFrames;
  }

  // Copy audio files
  const narrationFile = plan.audio || plan.narration_file;
  const narrationPublic = narrationFile
    ? copyToPublic(path.resolve(PROJECT_ROOT, narrationFile), 'audio')
    : null;

  const musicFile = plan.music;
  const musicPublic = musicFile
    ? copyToPublic(path.resolve(PROJECT_ROOT, musicFile), 'audio')
    : null;

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
  };
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
