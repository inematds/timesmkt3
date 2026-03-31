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
 *   "audio": "path/to/narration.mp3",        // optional — narration voice
 *   "music": "path/to/background.mp3",      // optional — background music (mixed under narration)
 *   "music_volume": 0.15,                   // optional — background music volume (0.0–1.0, default 0.15)
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

/**
 * Generates an ASS subtitle file for professional text overlay.
 * Uses Montserrat Black via libass — full UTF-8 support, word wrap, outline.
 */
function generateASS(scenes, sceneDurations, vidW, vidH) {
  const FONT    = 'Montserrat Black';
  const OUTLINE = 3;

  function tc(secs) {
    const h  = Math.floor(secs / 3600);
    const m  = Math.floor((secs % 3600) / 60);
    const s  = Math.floor(secs % 60);
    const cs = Math.round((secs % 1) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  }

  // ASS alignment: 2=bottom-center, 5=middle-center, 8=top-center
  const anMap = { bottom: 2, center: 5, top: 8 };
  // ASS colour: &HAABBGGRR (alpha inverted: 00=opaque, FF=transparent)
  const alphaHex = (opacity) => Math.round((1 - opacity) * 255).toString(16).padStart(2,'0').toUpperCase();

  const dialogues = [];
  let cumTime = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene      = scenes[i];
    const dur        = sceneDurations[i];
    // Skip text overlay if image already has embedded text
    const imgHasText = scene.image_has_text || scene.has_text ||
      (scene.image && /(_post|_stories|carousel_|oficial_|logo_|_ad\.|banner|calendar)/.test(scene.image));
    const text       = imgHasText ? '' : (scene.text_overlay || '').trim();
    const tl         = scene.text_layout || {};
    const fontSize   = tl.font_size || 80;
    const position   = tl.position  || 'bottom';
    const safeMargin = tl.safe_margin || 120;
    const bgOpacity  = tl.background_opacity ?? 0.60;
    const bgType     = tl.background || 'gradient';

    if (text) {
      const an      = anMap[position] || 2;
      const bgAlpha = bgType === 'none' ? 'FF' : alphaHex(bgOpacity);
      // Per-line override tags: font size, alignment, fade in 400ms/out 200ms
      const tags    = `{\\an${an}\\fs${fontSize}\\fad(400,200)}`;
      // MarginV drives the distance from the edge for top/bottom alignment
      const marginV = safeMargin;
      dialogues.push(
        `Dialogue: 0,${tc(cumTime)},${tc(cumTime + dur - 0.05)},Default,,40,40,${marginV},,${tags}${text}`
      );
    }

    cumTime += dur;
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${vidW}`,
    `PlayResY: ${vidH}`,
    'WrapStyle: 0',       // smart wrap
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // BorderStyle 1 = outline+shadow; PrimaryColour=white; OutlineColour=black; Shadow=0
    `Style: Default,${FONT},80,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,${OUTLINE},0,2,40,40,60,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogues,
  ].join('\n');
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

  // Parse dimensions — accept "1080x1920" or separate width/height fields
  let vidW, vidH;
  if (plan.width && plan.height) {
    vidW = plan.width;
    vidH = plan.height;
  } else {
    const fmt = plan.format || '1080x1920';
    [vidW, vidH] = fmt.includes('x') ? fmt.split('x').map(Number) : [1080, 1920];
  }

  const audioPath = (plan.audio || plan.narration_file) ? path.resolve(PROJECT_ROOT, plan.audio || plan.narration_file) : null;
  // Music: try multiple fields and resolve path
  let musicPath = null;
  const musicField = plan.music || plan.background_music;
  if (musicField) {
    musicPath = path.resolve(PROJECT_ROOT, musicField);
    if (!fs.existsSync(musicPath)) {
      // Try just the filename in common dirs
      const bn = path.basename(musicField);
      for (const dir of ['assets/music', 'assets/audio', 'assets']) {
        const cand = path.resolve(PROJECT_ROOT, dir, bn);
        if (fs.existsSync(cand)) { musicPath = cand; break; }
      }
      if (!fs.existsSync(musicPath)) {
        console.log(`Warning: music file not found: ${musicField}`);
        musicPath = null;
      }
    }
  }
  const musicVolume = typeof plan.music_volume === 'number' ? plan.music_volume : 0.15;

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

      // ── Motion config ─────────────────────────────────────────────────────────
      const motionConfig = scene.motion || {};
      const motionTypes  = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'];
      const motionType   = motionConfig.type || motionTypes[i % motionTypes.length];
      const zoomStart    = motionConfig.zoom_start ?? 1.0;
      const zoomEnd      = motionConfig.zoom_end   ?? 1.08;

      // ── Text layout config (used for background only — text rendered via ASS) ─
      const textOverlay  = scene.text_overlay || '';
      const textLayout   = scene.text_layout || {};
      const fontSize     = textLayout.font_size         || (textOverlay.length > 60 ? 52 : textOverlay.length > 30 ? 64 : 80);
      const textPosition = textLayout.position          || 'bottom';
      const safeMargin   = textLayout.safe_margin       || 120;
      const bgType       = textLayout.background        || 'gradient';
      const bgOpacity    = textLayout.background_opacity ?? 0.60;

      // ── image_type & has_text detection ──────────────────────────────────────
      const imageType = scene.image_type || 'raw';
      const isBanner  = imageType === 'banner';
      const imageHasText = scene.image_has_text || scene.has_text ||
        (imagePath && /(_post|_stories|carousel_|oficial_|logo_|instagram|facebook|_ad\.|banner|calendar)/.test(imagePath)) ||
        isBanner;

      // If image has text: NO text overlay and NO zoom/pan (just static display)
      const effectiveTextOverlay = imageHasText ? '' : textOverlay;

      const fps         = 30;
      const totalFrames = Math.round(duration * fps);

      // ── Ken Burns zoompan filter ──────────────────────────────────────────────
      // Images with embedded text: zoom=1.0 (static) to avoid cropping text
      let kbFilter = '';
      if (imageHasText) {
        kbFilter = `zoompan=z='1.0':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'zoom_in') {
        kbFilter = `zoompan=z='${zoomStart}+(${zoomEnd}-${zoomStart})*on/${totalFrames}':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'zoom_out') {
        kbFilter = `zoompan=z='${zoomEnd}-(${zoomEnd}-${zoomStart})*on/${totalFrames}':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'pan_right') {
        kbFilter = `zoompan=z='${zoomEnd}':x='(iw-(iw/zoom))*on/${totalFrames}':` +
          `y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else if (motionType === 'pan_left') {
        kbFilter = `zoompan=z='${zoomEnd}':x='(iw-(iw/zoom))*(1-on/${totalFrames})':` +
          `y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      } else {
        kbFilter = `zoompan=z='${zoomStart}':x='iw/2-(iw/zoom/2)':` +
          `y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=${vidW}x${vidH}:fps=${fps}`;
      }

      // ── Fade in/out ───────────────────────────────────────────────────────────
      const fadeDur   = Math.min(0.4, duration / 4);
      const fadeOut   = duration - fadeDur;
      const fadeFilter = `fade=t=in:st=0:d=${fadeDur},fade=t=out:st=${fadeOut.toFixed(2)}:d=${fadeDur}`;

      // ── Background band/box (text rendered via ASS subtitles, not drawtext) ───
      let vfParts = [];

      if (imgSrc && fs.existsSync(imgSrc)) {
        if (isBanner || imageType === 'clip' || imageHasText) {
          // Images with text: scale to fit without cropping (pad with black if needed)
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

      // Background band behind where the text will appear (estimated height)
      // Skip if image has embedded text (effectiveTextOverlay is empty)
      if (effectiveTextOverlay && bgType !== 'none') {
        const estLines  = Math.ceil(effectiveTextOverlay.length / 18) + (effectiveTextOverlay.includes('\n') ? 1 : 0);
        const bandH     = Math.round(fontSize * 1.4 * estLines + fontSize * 0.8);
        if (bgType === 'dark_box') {
          const boxW = Math.round(vidW * 0.85);
          const boxX = Math.round((vidW - boxW) / 2);
          let boxY;
          if (textPosition === 'top')         boxY = safeMargin - Math.round(fontSize * 0.3);
          else if (textPosition === 'center') boxY = Math.round((vidH - bandH) / 2);
          else                                boxY = vidH - safeMargin - bandH;
          vfParts.push(`drawbox=x=${boxX}:y=${Math.max(0,boxY)}:w=${boxW}:h=${bandH}:color=black@${bgOpacity}:t=fill`);
        } else {
          // gradient: full-width band
          let bandY;
          if (textPosition === 'top')         bandY = 0;
          else if (textPosition === 'center') bandY = Math.round((vidH - bandH) / 2) - Math.round(fontSize * 0.5);
          else                                bandY = vidH - bandH - Math.round(fontSize * 0.3);
          vfParts.push(`drawbox=x=0:y=${Math.max(0,bandY)}:w=iw:h=${bandH + Math.round(fontSize * 0.5)}:color=black@${bgOpacity}:t=fill`);
        }
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

    const concatVideo = path.join(tmpDir, 'concat.mp4');
    execFileSync('ffmpeg', [
      '-f', 'concat', '-safe', '0', '-i', concatList,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-y', concatVideo,
    ], { stdio: 'pipe' });

    // Step 2.5: Apply ASS subtitles (Montserrat Black, full UTF-8, libass)
    const assFile   = path.join(tmpDir, 'subs.ass');
    const assContent = generateASS(scenes, sceneDurations, vidW, vidH);
    fs.writeFileSync(assFile, assContent, 'utf-8');

    const silentVideo = path.join(tmpDir, 'silent.mp4');
    execFileSync('ffmpeg', [
      '-i', concatVideo,
      '-vf', `ass='${assFile}'`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30',
      '-y', silentVideo,
    ], { stdio: 'pipe' });

    // Step 3: Add audio — narration and/or background music
    const hasNarration = audioPath && fs.existsSync(audioPath);
    const hasMusic     = musicPath && fs.existsSync(musicPath);

    if (hasNarration && hasMusic) {
      // Mix narration (full volume) + background music (lower volume) via amix
      execFileSync('ffmpeg', [
        '-i', silentVideo,
        '-i', audioPath,
        '-i', musicPath,
        '-filter_complex',
          `[1:a]volume=1.0[narr];[2:a]volume=${musicVolume}[mus];[narr][mus]amix=inputs=2:duration=shortest[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-y', absOutput,
      ], { stdio: 'pipe' });
      console.log(`Audio: narration + music (vol ${musicVolume})`);
    } else if (hasNarration) {
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
      console.log('Audio: narration only');
    } else if (hasMusic) {
      // Music only — loop/trim to video length
      execFileSync('ffmpeg', [
        '-i', silentVideo,
        '-stream_loop', '-1',
        '-i', musicPath,
        '-filter_complex', `[1:a]volume=${musicVolume}[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-shortest',
        '-y', absOutput,
      ], { stdio: 'pipe' });
      console.log(`Audio: music only (vol ${musicVolume})`);
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
      console.log('Audio: silent');
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
