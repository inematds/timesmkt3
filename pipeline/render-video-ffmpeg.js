/**
 * FFmpeg Video Renderer
 *
 * Composites brand images + narration audio into an MP4 using ffmpeg.
 * Each scene = one image held for its duration, with text overlay.
 *
 * Usage:
 *   node pipeline/render-video-ffmpeg.js <scene_plan.json> <output.mp4>
 *
 * Scene plan format:
 * {
 *   "video_length": 20,
 *   "format": "1080x1920",
 *   "audio": "path/to/narration.mp3",        // optional
 *   "scenes": [
 *     {
 *       "duration": 4,
 *       "image": "path/to/image.jpg",         // brand image (absolute or relative to cwd)
 *       "text_overlay": "Headline text here",
 *       "text_style": "bold"                  // optional: bold, light
 *     }
 *   ]
 * }
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Get audio duration in seconds using ffprobe.
 * Returns null if audio file doesn't exist or ffprobe fails.
 */
function getAudioDuration(audioPath) {
  try {
    const result = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      audioPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const info = JSON.parse(result.toString());
    const stream = info.streams && info.streams[0];
    return stream ? parseFloat(stream.duration) : null;
  } catch {
    return null;
  }
}

/**
 * Distribute total duration across scenes proportionally, respecting their
 * original weights. Last scene always gets +3s hold at the end.
 */
function distributeSceneDurations(scenes, totalAudioDuration, holdLastSecs = 3) {
  const n = scenes.length;
  if (n === 0) return [];

  // Use scene.duration as weights; default weight = 1
  const weights = scenes.map(s => s.duration || s.time_seconds || 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // Reserve holdLastSecs for the last scene's hold
  const speakingTime = Math.max(totalAudioDuration, weightSum);
  const scale = speakingTime / weightSum;

  return weights.map((w, i) => {
    const base = Math.round(w * scale * 10) / 10;
    return i === n - 1 ? base + holdLastSecs : base;
  });
}

function renderVideo(scenePlanPath, outputPath) {
  const absScenePlan = path.resolve(PROJECT_ROOT, scenePlanPath);
  const absOutput = path.resolve(PROJECT_ROOT, outputPath);

  if (!fs.existsSync(absScenePlan)) {
    throw new Error(`Scene plan not found: ${absScenePlan}`);
  }

  const plan = JSON.parse(fs.readFileSync(absScenePlan, 'utf-8'));
  const scenes = plan.scenes || [];

  if (scenes.length === 0) {
    throw new Error('Scene plan has no scenes');
  }

  // Parse dimensions
  const fmt = plan.format || '1080x1920';
  const [vidW, vidH] = fmt.split('x').map(Number);

  const audioPath = plan.audio ? path.resolve(PROJECT_ROOT, plan.audio) : null;

  // Determine scene durations based on audio length
  let sceneDurations;
  if (audioPath && fs.existsSync(audioPath)) {
    const audioDuration = getAudioDuration(audioPath);
    if (audioDuration && audioDuration > 0) {
      console.log(`Audio duration: ${audioDuration.toFixed(1)}s — redistributing scene timings`);
      sceneDurations = distributeSceneDurations(scenes, audioDuration, 3);
    }
  }
  if (!sceneDurations) {
    // No audio or ffprobe failed — use scene durations as-is, add 3s hold to last scene
    sceneDurations = scenes.map((s, i) => {
      const d = s.duration || s.time_seconds || 3;
      return i === scenes.length - 1 ? d + 3 : d;
    });
  }

  fs.mkdirSync(path.dirname(absOutput), { recursive: true });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-render-'));

  try {
    // Step 1: For each scene, create a scaled/padded image clip
    const segmentFiles = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const duration = sceneDurations[i];
      const imgSrc = scene.image
        ? path.resolve(PROJECT_ROOT, scene.image)
        : null;

      const segOut = path.join(tmpDir, `seg_${String(i).padStart(2, '0')}.mp4`);
      segmentFiles.push(segOut);

      // Build ffmpeg filter for text overlay
      const textOverlay = scene.text_overlay || '';
      const escapedText = textOverlay
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]');

      // ── Motion config — from motion director or fallback defaults ────────────
      const motionConfig = scene.motion || {};
      const motionTypes = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'];
      const motionType = motionConfig.type || motionTypes[i % motionTypes.length];
      const zoomStart = motionConfig.zoom_start ?? 1.0;
      const zoomEnd   = motionConfig.zoom_end   ?? 1.08;

      // ── Text layout config — from motion director or fallback defaults ────────
      const textLayout = scene.text_layout || {};
      const fontSize     = textLayout.font_size         || (textOverlay.length > 60 ? 52 : textOverlay.length > 30 ? 64 : 80);
      const textPosition = textLayout.position          || 'bottom';
      const safeMargin   = textLayout.safe_margin       || 120;
      const bgType       = textLayout.background        || 'gradient';
      const bgOpacity    = textLayout.background_opacity ?? 0.60;
      const maxWidthPct  = textLayout.max_width_pct     || 85;

      // ── image_type ────────────────────────────────────────────────────────────
      const imageType = scene.image_type || 'raw';
      const isBanner = imageType === 'banner';

      const fps = 30;
      const totalFrames = Math.round(duration * fps);

      // ── Ken Burns zoompan filter ──────────────────────────────────────────────
      let kbFilter = '';
      if (motionType === 'zoom_in') {
        kbFilter = `zoompan=z='${zoomStart}+(${zoomEnd}-${zoomStart})*on/${totalFrames}':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'zoom_out') {
        kbFilter = `zoompan=z='${zoomEnd}-(${zoomEnd}-${zoomStart})*on/${totalFrames}':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'pan_right') {
        kbFilter = `zoompan=z='${zoomEnd}':` +
          `x='(iw-(iw/zoom))*on/${totalFrames}':y='ih/2-(ih/zoom/2)':` +
          `d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'pan_left') {
        kbFilter = `zoompan=z='${zoomEnd}':` +
          `x='(iw-(iw/zoom))*(1-on/${totalFrames})':y='ih/2-(ih/zoom/2)':` +
          `d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else {
        // static — minimal zoom to avoid pure freeze
        kbFilter = `zoompan=z='${zoomStart}':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      }

      // ── Fade in/out ───────────────────────────────────────────────────────────
      const fadeDur = Math.min(0.4, duration / 4);
      const fadeOut = duration - fadeDur;
      const fadeFilter = `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${fadeOut.toFixed(2)}:d=${fadeDur}`;

      // ── Text fade-in alpha ────────────────────────────────────────────────────
      const textFadeFrames = Math.round(0.5 * fps);
      const alphaExpr = `if(lt(n,${textFadeFrames}),n/${textFadeFrames},1)`;

      // ── Text Y position (drawtext supports expressions) ───────────────────────
      let textY;
      if (textPosition === 'top') {
        textY = String(safeMargin);
      } else if (textPosition === 'center') {
        textY = `(h/2-${Math.round(fontSize / 2)})`;
      } else {
        // bottom — safe margin from edge
        textY = `h-${safeMargin + fontSize}`;
      }

      let vfParts = [];

      if (imgSrc && fs.existsSync(imgSrc)) {
        if (isBanner || imageType === 'clip') {
          vfParts.push(
            `scale=${vidW}:${vidH}:force_original_aspect_ratio=decrease,` +
            `pad=${vidW}:${vidH}:(ow-iw)/2:(oh-ih)/2:color=black`
          );
        } else {
          vfParts.push(`scale=${vidW * 2}:${vidH * 2}:force_original_aspect_ratio=increase`);
          vfParts.push(kbFilter);
        }
      } else {
        vfParts.push(`scale=${vidW}:${vidH}`);
      }

      vfParts.push(fadeFilter);

      if (escapedText) {
        // ── Background behind text ──────────────────────────────────────────────
        if (bgType === 'dark_box') {
          // Caixa semi-transparente atrás do texto
          const boxW = Math.round(vidW * maxWidthPct / 100);
          const boxH = Math.round(fontSize * 1.8);
          const boxX = Math.round((vidW - boxW) / 2);
          let boxY;
          if (textPosition === 'top') {
            boxY = Math.max(0, safeMargin - Math.round(fontSize * 0.4));
          } else if (textPosition === 'center') {
            boxY = Math.round(vidH / 2) - Math.round(fontSize * 0.9);
          } else {
            boxY = vidH - safeMargin - Math.round(fontSize * 1.5);
          }
          vfParts.push(
            `drawbox=x=${boxX}:y=${boxY}:w=${boxW}:h=${boxH}:color=black@${bgOpacity}:t=fill`
          );
        } else if (bgType === 'gradient' || bgType !== 'none') {
          // Gradiente escuro cobrindo a região relevante da tela
          if (textPosition === 'top') {
            vfParts.push(`drawbox=x=0:y=0:w=iw:h=ih*0.40:color=black@${bgOpacity}:t=fill`);
          } else {
            vfParts.push(`drawbox=x=0:y=ih*0.55:w=iw:h=ih*0.45:color=black@${bgOpacity}:t=fill`);
          }
        }
        // bgType === 'none' → sem fundo, só shadow no texto

        // ── drawtext ──────────────────────────────────────────────────────────────
        vfParts.push(
          `drawtext=text='${escapedText}':fontsize=${fontSize}:` +
          `fontcolor=white@1:alpha='${alphaExpr}':` +
          `x=(w-text_w)/2:y=${textY}:` +
          `fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
          `shadowcolor=black@0.9:shadowx=3:shadowy=3`
        );
      }

      const vf = vfParts.join(',');

      let ffArgs;
      if (imageType === 'clip' && imgSrc && fs.existsSync(imgSrc)) {
        // Video clip: use as direct video input — trim to scene duration, scale to fit, add fade/text
        ffArgs = [
          '-i', imgSrc,
          '-t', String(duration),
          '-vf', vf,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-r', String(fps),
          '-an',
          '-y', segOut,
        ];
      } else if (imgSrc && fs.existsSync(imgSrc)) {
        // Static image (raw or banner): loop for duration
        ffArgs = [
          '-loop', '1',
          '-i', imgSrc,
          '-t', String(duration),
          '-vf', vf,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-r', String(fps),
          '-an',
          '-y', segOut,
        ];
      } else {
        // No image — solid dark background
        ffArgs = [
          '-f', 'lavfi',
          '-i', `color=c=0x0D0D0D:size=${vidW}x${vidH}:rate=${fps}`,
          '-t', String(duration),
          '-vf', vf,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-an',
          '-y', segOut,
        ];
      }

      execFileSync('ffmpeg', ffArgs, { stdio: 'pipe' });
    }

    // Step 2: Concatenate all segments
    const concatList = path.join(tmpDir, 'concat.txt');
    fs.writeFileSync(concatList,
      segmentFiles.map(f => `file '${f}'`).join('\n')
    );

    const silentVideo = path.join(tmpDir, 'silent.mp4');
    execFileSync('ffmpeg', [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y', silentVideo,
    ], { stdio: 'pipe' });

    // Step 3: Add audio if available
    if (audioPath && fs.existsSync(audioPath)) {
      execFileSync('ffmpeg', [
        '-i', silentVideo,
        '-i', audioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-y', absOutput,
      ], { stdio: 'pipe' });
    } else {
      // Add silent audio track so the file is valid
      execFileSync('ffmpeg', [
        '-i', silentVideo,
        '-f', 'lavfi',
        '-i', 'anullsrc=r=44100:cl=stereo',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-y', absOutput,
      ], { stdio: 'pipe' });
    }

    console.log(`✅ Video rendered: ${absOutput}`);
    return absOutput;

  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

// CLI mode
if (require.main === module) {
  const [,, scenePlanArg, outputArg] = process.argv;
  if (!scenePlanArg || !outputArg) {
    console.error('Usage: node pipeline/render-video-ffmpeg.js <scene_plan.json> <output.mp4>');
    process.exit(1);
  }
  try {
    renderVideo(scenePlanArg, outputArg);
  } catch (e) {
    console.error(`❌ Render failed: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { renderVideo };
