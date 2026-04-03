const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');
const { getEnv, hasEnv } = require('../config/env');
const { writeVideoApprovalTimeout } = require('../telegram/approval-utils');

function createWorkerVideoProHandler({
  projectRoot,
  imageProviderName,
  defaultModel,
  renderFfmpeg,
  renderRemotion,
  getVideoRenderer,
  log,
  runClaude,
  waitForFile,
  resolveImageSource,
  getFreeImageProvider,
  getFolderAssets,
  getImageDimensions,
  getProjectAssets,
  formatAssetList,
  getImageProvider,
  readBrandContext,
  videoTimestamp,
  backupIfExists,
}) {
  return async function handleVideoPro(job) {
    const {
      task_name, task_date, output_dir, project_dir, platform_targets,
      language, campaign_brief,
      video_count = 1, video_briefs = [],
      image_source: rawImageSource = 'brand',
      image_folder = null,
    } = job.data;
    const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
    const absVideoDir = path.resolve(projectRoot, output_dir, 'video');

    const vf = (idx, suffix) => `${task_name}_video_${idx}${suffix}`;
    const vfFind = (idx, suffix) => {
      const prefixed = path.resolve(projectRoot, output_dir, 'video', vf(idx, suffix));
      if (fs.existsSync(prefixed)) return prefixed;
      const legacy = path.resolve(projectRoot, output_dir, 'video', `video_${idx}${suffix}`);
      if (fs.existsSync(legacy)) return legacy;
      return prefixed;
    };
    fs.mkdirSync(absVideoDir, { recursive: true });

    if (job.data.skip_completed) {
      const hasPro = fs.existsSync(absVideoDir) && fs.readdirSync(absVideoDir).some(f => f.startsWith(`${task_name}_pro_`) && f.endsWith('.mp4'));
      if (hasPro) {
        log(output_dir, 'video_pro', 'Skipping — final video already exists');
        return { status: 'skipped', reason: 'already completed' };
      }
    }

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: All text overlays, narration and copy MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const hasElevenLabs = hasEnv('ELEVENLABS_API_KEY');
    const videoBriefsText = video_briefs.length > 0
      ? video_briefs.map((b, i) => `  ${i + 1}. ${b}`).join('\n')
      : Array.from({ length: video_count }, (_, i) =>
          `  ${i + 1}. Video ${i + 1} — 60 seconds, professional edit with 30-50 rapid cuts`
        ).join('\n');

    const musicDirs = [
      path.resolve(projectRoot, project_dir, 'assets', 'music'),
      path.resolve(projectRoot, project_dir, 'assets', 'audio'),
      path.resolve(projectRoot, project_dir, 'assets'),
    ];
    let musicFiles = [];
    for (const musicDir of musicDirs) {
      if (fs.existsSync(musicDir)) {
        const files = fs.readdirSync(musicDir).filter(f => /\.(mp3|wav|aac|m4a)$/i.test(f) && !f.includes('narration'));
        if (files.length > 0) {
          musicFiles = files.map(f => path.relative(projectRoot, path.join(musicDir, f)));
          break;
        }
      }
    }
    if (musicFiles.length === 0 && hasEnv('FREESOUND_API_KEY')) {
      log(output_dir, 'video_pro', 'No local music found — searching Freesound...');
      try {
        const { searchMusic, downloadPreview } = require('./search-music-freesound');
        const briefText = job.data.campaign_brief || task_name;
        const moodKeywords = briefText.includes('tech') || briefText.includes('ia') ? 'ambient electronic' : 'corporate background';
        const sound = await searchMusic(moodKeywords, '', 30, 120);
        if (sound) {
          const audioDir = path.resolve(projectRoot, output_dir, 'audio');
          const musicPath = await downloadPreview(sound, audioDir);
          if (musicPath) {
            musicFiles = [path.relative(projectRoot, musicPath)];
            log(output_dir, 'video_pro', `Freesound music downloaded: ${path.basename(musicPath)} (${sound.duration.toFixed(1)}s)`);
          }
        } else {
          log(output_dir, 'video_pro', 'No suitable music found on Freesound.');
        }
      } catch (e) {
        log(output_dir, 'video_pro', `Freesound search error: ${e.message}`);
      }
    }

    const musicInstructions = musicFiles.length > 0 ? `
BACKGROUND MUSIC (available files):
${musicFiles.map(f => `  - ${f}`).join('\n')}
- Set "music" in the scene plan to the chosen file path
- Set "music_volume" to 0.10–0.20 (default 0.15)
` : `
BACKGROUND MUSIC: No music files found. Set "music": null in the scene plan.
`;

    const audioInstructions = hasElevenLabs ? `
AUDIO NARRATION (ElevenLabs available):
- Write a narration script (${Math.round((job.data.video_duration || 60) * 0.85)}-${Math.round((job.data.video_duration || 60) * 0.95)} seconds of natural speech for ${job.data.video_duration || 60}s video)
- Generate narration: node pipeline/generate-audio.js <output.mp3> "<script>" [rachel|bella|domi|antoni|josh|arnold]
- Save as: ${output_dir}/audio/${task_name}_video_0N_narration.mp3
- Recommended voices: rachel (warm/emotional), bella (clear/friendly), domi (confident), antoni (professional), josh (deep/warm), arnold (bold/energetic)
${musicInstructions}` : `
AUDIO: ElevenLabs not configured. Generate silent videos. Narration scripts only.
${musicInstructions}`;

    const providerNameEditor = job.data.image_provider || imageProviderName;
    let imageSourceSection = '';
    if (image_source === 'api') {
      imageSourceSection = `
IMAGE SOURCE: ${providerNameEditor} API (images will be generated AFTER you write the scene plan)
- Set "image": null for all scenes
- Add "image_prompt" field per scene: concise English description (max 200 chars)
- The pipeline generates one image per UNIQUE prompt, then maps it to multiple cuts
- Output a "unique_images" field listing distinct prompts (max 15)
- Multiple cuts can share the same generated image with different crop_focus and motion`;
    } else if (image_source === 'free') {
      const freeProvider = getFreeImageProvider();
      if (freeProvider) {
        const authNote = freeProvider.authHeader
          ? `Header: ${freeProvider.authHeader}: ${freeProvider.key}`
          : `Parameter: key=${freeProvider.key}`;
        imageSourceSection = `
IMAGE SOURCE: ${freeProvider.name.toUpperCase()} (free stock photos)
- Search: GET ${freeProvider.searchUrl}?query=<theme>&per_page=10&orientation=portrait
  ${authNote}
- Download 10-15 unique photos to ${output_dir}/imgs/
- Map multiple cuts to the same photo with different crop_focus and motion`;
      } else {
        imageSourceSection = `
IMAGE SOURCE: no free provider configured (set PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, or PIXABAY_API_KEY in .env)`;
      }
    } else if (image_source === 'folder') {
      const folderAssets = imageFolder ? getFolderAssets(imageFolder) : [];
      const folderList = formatAssetList(folderAssets);
      if (folderAssets.length > 0) {
        imageSourceSection = `
FOLDER IMAGES (study dimensions — reuse creatively across 30-50 cuts):
${folderList}

REUSE STRATEGY (with ${folderAssets.length} images for 30-50 cuts):
- Same image + different crop_focus = visually distinct
- Same image + different motion = feels new
- Same image + different overlay = different mood
- Maximum 5 uses per image
- Never assign same image to 2 CONSECUTIVE cuts`;
      } else {
        imageSourceSection = `
IMAGE SOURCE: folder "${imageFolder || '(not specified)'}" — no images found`;
      }
    } else if (image_source === 'screenshot') {
      const briefPath = path.resolve(projectRoot, output_dir, 'creative', 'creative_brief.json');
      const researchPath = path.resolve(projectRoot, output_dir, 'research_results.json');
      const productPath = path.resolve(projectRoot, project_dir, 'knowledge', 'product_campaign.md');
      const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
      const explicitUrls = job.data.screenshot_urls || [];
      const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
      log(output_dir, 'video_pro', `Capturing screenshots from ${allUrls.length} URLs: ${allUrls.join(', ')}`);
      const screenshotAssets = await captureScreenshots(allUrls, path.resolve(projectRoot, output_dir));
      const brandAssets = getProjectAssets(project_dir);
      const combinedAssets = [...screenshotAssets, ...brandAssets];
      const assetList = formatAssetList(combinedAssets);
      imageSourceSection = `
SCREENSHOT + BRAND IMAGES (${screenshotAssets.length} screenshots + ${brandAssets.length} brand assets):
${assetList}

Screenshots are real captures of the brand's website/product. Prioritize them for:
- Showing the actual product interface
- Social proof (real content, real community)
- Visual reference for brand style
Combine with brand photos (Nei, logos, banners) for variety.

REUSE STRATEGY (with ${combinedAssets.length} images for 30-50 cuts):
- Same image + different crop_focus = visually distinct
- Same image + different motion = feels new
- Same image + different overlay = different mood
- Maximum 5 uses per image
- Never assign same image to 2 CONSECUTIVE cuts`;
      log(output_dir, 'video_pro', `Screenshots captured: ${screenshotAssets.length}, brand: ${brandAssets.length}`);
    } else {
      const brandAssets = getProjectAssets(project_dir);
      const assetList = formatAssetList(brandAssets);
      imageSourceSection = `
BRAND IMAGES (study dimensions — reuse creatively across 30-50 cuts):
${assetList}

REUSE STRATEGY (with ${brandAssets.length} images for 30-50 cuts):
- Same image + different crop_focus = visually distinct (center-top vs center-bottom vs left)
- Same image + different motion = feels new (zoom_in intimate vs pan_right discovery)
- Same image + different overlay = different mood (dark vs warm vs cool)
- Maximum 5 uses per image
- Never assign same image to 2 CONSECUTIVE cuts`;
    }

    const absAudioDir = path.resolve(projectRoot, output_dir, 'audio');
    fs.mkdirSync(absAudioDir, { recursive: true });
    let narrationExists = false;
    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const narPath = path.resolve(absAudioDir, `${task_name}_video_${idx}_narration.mp3`);
      if (fs.existsSync(narPath)) { narrationExists = true; break; }
    }

    if (!narrationExists && hasElevenLabs) {
      log(output_dir, 'video_pro', 'Phase 1: Generating narration (Sonnet)...');
      const narrationPrompt = `You are a professional copywriter creating narration for a video ad.

Read these files to understand the campaign:
- ${project_dir}/knowledge/brand_identity.md
- ${output_dir}/creative/creative_brief.json
${langInstruction}${briefInstruction}

For each of the ${video_count} video(s), write a narration script.
Target duration: ${job.data.video_duration || 60} seconds (${Math.round((job.data.video_duration || 60) * 2.5)} words for pt-BR at ~2.5 words/sec).
Then generate the audio using: node pipeline/generate-audio.js <output.mp3> "<script>" ${job.data.narrator || 'rachel'}
Save narration to: ${output_dir}/audio/${task_name}_video_0N_narration.mp3
Voice: ${job.data.narrator || 'rachel'} — use this EXACT voice (must match quick video for consistency)

IMPORTANT: ONLY generate narration audio files. Do NOT create scene plans or any other files.
After generating all narrations, print: [NARRATION_DONE]`;

      await runClaude(narrationPrompt, 'video_pro', output_dir, 300000, { model: 'sonnet' });
      log(output_dir, 'video_pro', 'Narration generated.');
    } else {
      log(output_dir, 'video_pro', 'Narration already exists, skipping.');
    }

    log(output_dir, 'video_pro', 'Phase 1.5: Analyzing narration audio timing...');

    const narrationFiles = [];
    const narrationTimings = [];
    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const narPath = `${output_dir}/audio/${task_name}_video_${idx}_narration.mp3`;
      const absNarPath = path.resolve(projectRoot, narPath);
      if (!fs.existsSync(absNarPath)) continue;
      narrationFiles.push(narPath);

      let audioDuration = 0;
      try {
        const probe = execFileSync('ffprobe', [
          '-v', 'quiet', '-show_entries', 'format=duration',
          '-of', 'csv=p=0', absNarPath,
        ], { encoding: 'utf-8', timeout: 10000 }).trim();
        audioDuration = parseFloat(probe) || 0;
        log(output_dir, 'video_pro', `Audio ${idx} duration: ${audioDuration.toFixed(1)}s`);
      } catch (e) {
        log(output_dir, 'video_pro', `ffprobe failed for ${narPath}: ${e.message.slice(0, 100)}`);
      }

      const timingPath = path.resolve(projectRoot, output_dir, 'audio', `${task_name}_video_${idx}_timing.json`);
      if (fs.existsSync(timingPath) && audioDuration > 0) {
        try {
          const saved = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
          if (saved.segments && saved.segments.length > 0) {
            narrationTimings.push({ video: idx, audioDuration, totalWords: saved.totalWords, segments: saved.segments });
            log(output_dir, 'video_pro', `Audio timing loaded from file: ${saved.segments.length} segments, ${saved.totalWords} words in ${audioDuration.toFixed(1)}s`);
            continue;
          }
        } catch {}
      }

      let narrationScript = '';
      try {
        const proLog = fs.readFileSync(path.resolve(projectRoot, output_dir, 'logs', 'video_pro.log'), 'utf-8');
        const scriptMatch = proLog.match(/Script utilizado.*?\n\n?>\s*\*?"?([\s\S]*?)\*?"?\n\n/);
        if (scriptMatch) narrationScript = scriptMatch[1].replace(/\*/g, '').trim();
      } catch {}

      if (audioDuration > 0 && narrationScript) {
        const sentences = narrationScript.split(/(?<=[.?!])\s+/).filter(s => s.trim());
        const totalWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
        let currentTime = 0;
        const segments = sentences.map(sentence => {
          const wordCount = sentence.split(/\s+/).length;
          const duration = (wordCount / totalWords) * audioDuration;
          const segment = {
            text: sentence.trim(),
            start: parseFloat(currentTime.toFixed(2)),
            end: parseFloat((currentTime + duration).toFixed(2)),
            duration: parseFloat(duration.toFixed(2)),
            words: wordCount,
          };
          currentTime += duration;
          return segment;
        });

        narrationTimings.push({ video: idx, audioDuration, totalWords, segments });
        fs.writeFileSync(timingPath, JSON.stringify({ audioDuration, totalWords, segments }, null, 2));
        log(output_dir, 'video_pro', `Audio timing: ${segments.length} segments, ${totalWords} words in ${audioDuration.toFixed(1)}s`);
      } else if (audioDuration > 0) {
        narrationTimings.push({ video: idx, audioDuration, totalWords: 0, segments: [] });
        log(output_dir, 'video_pro', `Audio timing (duration only, no script): ${audioDuration.toFixed(1)}s`);
      }
    }

    let narrationNote = '';
    if (narrationFiles.length > 0 && narrationTimings.length > 0) {
      const t = narrationTimings[0];
      const timingTable = t.segments.map(s =>
        `  ${s.start.toFixed(1)}s-${s.end.toFixed(1)}s (${s.duration.toFixed(1)}s): "${s.text.slice(0, 80)}${s.text.length > 80 ? '...' : ''}"`
      ).join('\n');
      narrationNote = `Narration audio already generated:
${narrationFiles.map(f => `  - ${f}`).join('\n')}

CRITICAL — EXACT AUDIO TIMING (from ffprobe analysis):
Total audio duration: ${t.audioDuration.toFixed(1)}s
video_length MUST be ${Math.ceil(t.audioDuration) + 3}s (audio + 3s breathing room at end — NEVER shorter than audio)

Sentence-by-sentence timing (your scene cuts MUST align with these):
${timingTable}

RULES:
- The sum of all scene durations MUST equal ${Math.ceil(t.audioDuration) + 3}s (audio + 3s)
- The last 3s should be a silent closing shot (CTA visual, logo, or URL)
- Each scene MUST have a "narration" field with the EXACT transcript segment spoken during that scene
- Scene transitions must happen at sentence boundaries (±0.3s tolerance)
- text_overlay must reinforce the sentence being spoken at that moment — NOT generic text
- Scenes during silent portions (intro flash, closing): narration = ""
- Do NOT invent text_overlay that contradicts or ignores what the narrator is saying`;
    } else if (narrationFiles.length > 0) {
      narrationNote = `Narration audio already generated:\n${narrationFiles.map(f => `  - ${f}`).join('\n')}\nDo NOT regenerate narration. Use it as timing reference.`;
    } else {
      narrationNote = 'No narration audio available.';
    }

    const photoQuality = job.data.photo_quality || 'simples';
    const photoplanPath = path.resolve(projectRoot, output_dir, 'video', 'photography_plan.json');
    if (!fs.existsSync(photoplanPath)) {
      const photoModel = photoQuality === 'premium' ? 'opus' : 'sonnet';
      const photoLabel = photoQuality === 'premium' ? 'Premium/Opus' : 'Simples/Sonnet';
      log(output_dir, 'video_pro', `Phase 1.6: Photography Director (${photoLabel})...`);
      process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} photography_director\n`);

      const absImgsDir2 = path.resolve(projectRoot, output_dir, 'imgs');
      const absAssetsDir = path.resolve(projectRoot, project_dir, 'assets');
      const proImageDir = job.data.pro_image_dir ? path.resolve(projectRoot, job.data.pro_image_dir) : null;
      const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
      const listImages = (dir, label) => {
        if (!fs.existsSync(dir)) return [];
        return fs.readdirSync(dir)
          .filter(f => imgExts.includes(path.extname(f).toLowerCase()))
          .map(f => `  - ${path.relative(projectRoot, path.join(dir, f))} [${label}]`);
      };
      const campaignImages = [
        ...listImages(absImgsDir2, 'CAMPANHA/imgs — PRIORIDADE 1'),
        ...(proImageDir ? listImages(proImageDir, 'DIRETÓRIO CUSTOMIZADO — PRIORIDADE 1') : []),
      ];
      const brandImages = listImages(absAssetsDir, 'MARCA/assets — PRIORIDADE 2');
      const imageListForPhoto = `
PRIORITY 1 — Campaign images (USE THESE FIRST):
${campaignImages.length > 0 ? campaignImages.join('\n') : '  (nenhuma imagem da campanha disponível)'}

PRIORITY 2 — Brand assets (use only if campaign images are insufficient):
${brandImages.length > 0 ? brandImages.join('\n') : '  (nenhum asset da marca)'}

NOTE: ads/ (carousel/static ad images) are NOT included — video pro uses raw images, not pre-composed ads.

CRITICAL RULES:
- ALWAYS prioritize campaign images (imgs/) over brand assets
- Classify EACH image as "clean" (no embedded text) or "has_text" (has text/logo)
- NEVER put text_overlay on images classified as "has_text"
- Images with _post, _stories, oficial_, logo_, instagram, facebook in name → likely has_text
- If using a brand asset instead of campaign image, explain WHY in "image_reason"`;

      let photoDirPrompt;
      if (photoQuality === 'premium') {
        photoDirPrompt = `You are the Photography Director (Diretor de Fotografia). Follow the skill defined in skills/photography-director/SKILL.md exactly.

You think like a CINEMATOGRAPHER. You define the complete visual language BEFORE the editor creates the scene plan.

Task: Create the photography plan for ${video_count} video(s) — "${task_name}" campaign.
Platforms: ${platform_targets.join(', ')}
${langInstruction}

STEP 1 — Read ALL these files:
- ${project_dir}/knowledge/brand_identity.md
- ${output_dir}/creative/creative_brief.json
- skills/photography-director/SKILL.md
- skills/video-engineering/style-dictionary.json — CRITICAL: exact spring/easing/color values per style
- skills/video-engineering/SKILL.md — engineering manual
- skills/video-art-direction/SKILL.md
- skills/typography-on-image/SKILL.md
- skills/image-generation/model-profiles.json — prompt guidelines per image model (when image_source=api)

STEP 2 — Audio timing:
${narrationNote}

STEP 3 — Available images (READ THE PRIORITY RULES):
${imageListForPhoto}

STEP 4 — Create the photography plan following SKILL.md exactly.
Save to: ${output_dir}/video/photography_plan.json

The plan must define: style_preset, formats (based on platforms), color_palette, typography, sections with mood/framing/motion, and individual shots covering 100% of the narration timing.

For EACH shot, you MUST specify:
- Which specific image file to use (full path)
- Whether the image has embedded text (image_has_text: true/false)
- If image_has_text is true, set text_overlay to null (no text on this shot)
- The typography (font, size, weight, position) — the Scene Plan MUST follow these exactly

CONTENT FILTER (MANDATORY):
- REJECT images containing: weapons, violence, nudity, drugs, controversial symbols
- Context: Brazilian professionals 25-45 years old
- Images must reflect Brazilian diversity
- When using image_source=api, include in prompts: "Brazilian professionals, diverse, modern, technology"
- Avoid clearly American/European settings without Brazilian context
- Classify unsuitable images as "unsuitable" — never use them

IMPORTANT: Output ONLY the photography_plan.json file. Do NOT create scene plans or render anything.`;
      } else {
        const readFileCompact = (filePath) => {
          const abs = path.resolve(projectRoot, filePath);
          if (!fs.existsSync(abs)) return '(arquivo não encontrado)';
          return fs.readFileSync(abs, 'utf-8').slice(0, 4000);
        };
        const brandIdentity = readFileCompact(`${project_dir}/knowledge/brand_identity.md`);
        const creativeBrief = readFileCompact(`${output_dir}/creative/creative_brief.json`);
        let styleDict = '';
        try {
          const sd = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'skills/video-engineering/style-dictionary.json'), 'utf-8'));
          const compact = Object.fromEntries(Object.entries(sd).map(([k, v]) => [k, { color: v.color, motion: v.motion, typography: v.typography }]));
          styleDict = JSON.stringify(compact, null, 1);
        } catch { styleDict = readFileCompact('skills/video-engineering/style-dictionary.json'); }

        photoDirPrompt = `You are the Photography Director. Create the photography plan for ${video_count} video(s) — "${task_name}" campaign.
Platforms: ${platform_targets.join(', ')}. ${langInstruction}

═══ BRAND IDENTITY ═══
${brandIdentity}

═══ CREATIVE BRIEF ═══
${creativeBrief}

═══ STYLE DICTIONARY (color/motion/typography per preset) ═══
${styleDict}

═══ AUDIO TIMING ═══
${narrationNote}

═══ AVAILABLE IMAGES ═══
${imageListForPhoto}

═══ PHOTOGRAPHY PLAN RULES ═══
1. Choose 1 of 12 style presets: neon_futurista, warm_lifestyle, corporate_clean, bold_pop, minimal_zen, dark_cinematic, pastel_soft, retro_vintage, nature_organic, urban_street, luxury_gold, editorial_documentary
2. Define formats based on platforms (9:16 for Reels/TikTok/Shorts, 1:1 for Feed, 16:9 for YouTube)
3. For each shot define: framing (extreme-close-up/close-up/medium-shot/wide-shot/detail-shot/overhead), motion (push-in/pull-out/pan-right/drift/ken-burns-in/zoom-in/breathe/parallax-zoom), mood, image file, text_overlay (max 6 words)
4. Classify each image: "clean" (no text) or "has_text" (has text/logo) or "unsuitable"
5. image_has_text:true → text_overlay:null. NEVER text on images with embedded text
6. Never same framing 3x in row. Never same motion 2x in row
7. FACE DETECTION — for each shot, analyze the image and set "face_position": "top" | "center" | "bottom" | "none". Then set text_position to AVOID the face:
   - face_position: "top" → text_position: "center" (text below the face)
   - face_position: "center" → text_position: "top" (text above the face)
   - face_position: "bottom" → text_position: "top"
   - face_position: "none" → text_position: "top" (default)
   - NEVER "bottom" for text — mobile UI covers bottom area
8. First shot ≤1.5s. Last shot ≥3s. Cover 100% of narration timing
9. Typography: Oswald 96-140px for hooks, Montserrat 72-96px for body, Playfair 64-80px for editorial
10. Energy curve: Hook(5)→Problem(3)→Solution(4-5)→Proof(4)→CTA(3)

Save to: ${output_dir}/video/photography_plan.json
Output ONLY the JSON file. Do NOT create scene plans or render anything.`;
      }

      const photoTimeout = photoQuality === 'premium' ? 600000 : 300000;
      await runClaude(photoDirPrompt, 'video_pro', output_dir, photoTimeout, { model: photoModel });
      log(output_dir, 'video_pro', `Photography plan created (${photoLabel}).`);
    } else {
      log(output_dir, 'video_pro', 'Photography plan already exists, skipping.');
    }

    await job.extendLock(job.token, 900000).catch(() => {});

    let photographyNote = '';
    if (fs.existsSync(photoplanPath)) {
      try {
        const photoPlan = JSON.parse(fs.readFileSync(photoplanPath, 'utf-8'));
        photographyNote = `
PHOTOGRAPHY PLAN (from Photography Director — FOLLOW THESE DECISIONS):
Style: ${photoPlan.style_preset || 'not set'}
Formats: ${(photoPlan.formats || ['9:16']).join(', ')}
Colors: ${JSON.stringify(photoPlan.color_palette || {})}
Typography: headline=${photoPlan.typography?.headline_font || 'Montserrat'}, body=${photoPlan.typography?.body_font || 'Inter'}

Sections:
${(photoPlan.sections || []).map(s => `  ${s.name} (${s.start_s || '?'}s-${s.end_s || '?'}s): mood=${s.mood || '?'}, framing=${s.default_framing || '?'}, motion=${s.default_motion || '?'}, overlay=${s.overlay || 'dark'} ${s.overlay_opacity || 0.45}`).join('\n')}

Shots (${(photoPlan.shots || photoPlan.scenes || []).length} defined):
${(photoPlan.shots || photoPlan.scenes || []).slice(0, 10).map(s => `  ${s.timing || s.start_s + 's'}: ${s.framing} + ${s.motion} | face:${s.face_position || '?'} → text:${s.text_position || '?'} | "${(s.text_overlay || '').slice(0, 30)}" | img: ${(s.image || s.image_prompt || '').split('/').pop().slice(0, 40)}`).join('\n')}
${(photoPlan.shots || photoPlan.scenes || []).length > 10 ? `  ... (${(photoPlan.shots || photoPlan.scenes).length} total — read the full file)` : ''}

CRITICAL: You MUST follow the Photography Director's decisions. Do NOT override style, framing, motion, or color choices. Your job is ONLY to create the edit timeline (scene plan) using these visual decisions.
Read the full photography_plan.json for all shots.`;
      } catch (e) {
        log(output_dir, 'video_pro', `Could not parse photography_plan.json: ${e.message}`);
      }
    }

    const sceneQuality = job.data.scene_quality || 'simples';
    const sceneModel = sceneQuality === 'premium' ? 'opus' : 'sonnet';
    const sceneLabel = sceneQuality === 'premium' ? 'Premium/Opus' : 'Simples/Sonnet';
    log(output_dir, 'video_pro', `Phase 2: Creating scene plan (${sceneLabel})...`);

    let photoPlanContent = '';
    const photoPlanPath2 = path.resolve(projectRoot, output_dir, 'video', 'photography_plan.json');
    if (fs.existsSync(photoPlanPath2)) {
      try {
        const fullPlan = JSON.parse(fs.readFileSync(photoPlanPath2, 'utf-8'));
        const compact = {
          style_preset: fullPlan.style_preset,
          color_palette: fullPlan.color_palette,
          video_length: fullPlan.video_length || job.data.video_duration || 60,
          typography: fullPlan.typography,
          shots: (fullPlan.shots || fullPlan.scenes || []).map(s => ({
            timing: s.timing || `${s.start_s || s.start_time || 0}s`,
            start_s: s.start_s || s.start_time || 0,
            end_s: s.end_s || s.end_time || ((s.start_s || s.start_time || 0) + (s.duration_s || s.duration || 0)),
            dur: s.duration_s || s.duration || 0,
            image: s.image || s.image_file,
            has_text: s.image_has_text || false,
            face_position: s.face_position || 'none',
            framing: s.framing,
            motion: s.motion,
            text: s.text_overlay,
            text_position: s.text_position,
            section: s.section || s.label,
          })),
        };
        photoPlanContent = JSON.stringify(compact, null, 2);
      } catch {
        photoPlanContent = fs.readFileSync(photoPlanPath2, 'utf-8');
      }
    }

    let videoDur = job.data.video_duration || 60;
    if (narrationTimings.length > 0 && narrationTimings[0].audioDuration) {
      const audioDur = narrationTimings[0].audioDuration;
      const audioBasedDur = Math.ceil(audioDur) + 3;
      if (audioBasedDur > videoDur) {
        log(output_dir, 'video_pro', `Adjusting video_length: ${videoDur}s → ${audioBasedDur}s (audio ${audioDur.toFixed(1)}s + 3s)`);
        videoDur = audioBasedDur;
      }
    }

    let scenePlanPrompt;
    if (sceneQuality === 'premium') {
      scenePlanPrompt = `You are the Video Editor Agent (Diretor de Edição). Follow the skill defined in skills/video-editor-agent/SKILL.md exactly.

You think like a PROFESSIONAL VIDEO EDITOR. You create 30-50 rapid cuts — NOT a 5-scene slideshow.
The Photography Director has already defined the visual language. Your job is to create the EDIT TIMELINE following those decisions.

STRICT RULES — DO NOT OVERRIDE THE PHOTOGRAPHY PLAN:
- Use EXACTLY the images specified by the Photography Director for each shot
- Use EXACTLY the fonts, sizes, and positions defined in the photography plan
- Use EXACTLY the transitions defined between sections (NOT 100% cut)
- If a shot has "image_has_text": true, do NOT add text_overlay (set it to null/empty)
- If you need to split a shot into multiple cuts, keep the same image/font/motion
- You decide TIMING only — the Photography Director decided everything else

TIMESTAMP ANCHORING (CRITICAL):
- Each shot in the photography plan has start_time → end_time. You MUST respect these windows.
- When splitting a shot into multiple cuts, all cuts MUST fit within the shot's time window.
- text_overlay for each cut must match what the NARRATOR is saying during that time.
- Every scene MUST include a "narration" field with the EXACT transcript segment spoken during that scene (or "" for silent scenes).
- The last 3s of the video should be a silent closing shot (narration: "", text_overlay: URL/logo).
- Sum of all scene durations MUST equal video_length (${videoDur}s).

Task: Create professional edit plans for ${video_count} videos — "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
${langInstruction}${briefInstruction}

STEP 1 — Read these knowledge files:
- ${project_dir}/knowledge/brand_identity.md
- ${project_dir}/knowledge/product_campaign.md
- ${output_dir}/creative/creative_brief.json
- ${output_dir}/video/photography_plan.json — CRITICAL: the Photography Director's visual decisions
- skills/video-editor-agent/SKILL.md
- skills/typography-on-image/SKILL.md

STEP 2 — Image assets:
${imageSourceSection}

STEP 3 — Video briefs:
${videoBriefsText}
${photographyNote}

STEP 4 — Audio:
${narrationNote}
${musicInstructions}

STEP 5 — Create the scene plan JSON following the Photography Director's visual decisions:

Phase A: Analyze inputs, select narrative framework
Phase B: Create Edit Decision List with 30-50 cuts (MANDATORY minimum 25 cuts for 60s)
Phase C: Assign images to cuts (reuse creatively — same image, different treatment)
Phase D: Assign motion, text animation, transitions per cut

CRITICAL RULES (enforced — plan will be rejected if violated):
- MINIMUM 25 cuts for a 60s video (target 30-50)
- NEVER same motion.type on 2 consecutive cuts
- NEVER same text_layout.position on 3 consecutive cuts
- First cut duration ≤ 1.5s (hook must be fast)
- Last cut duration ≥ 3s (CTA needs reading time)
- Cuts < 0.8s: NO text_overlay (too fast to read)
- Cuts with text_overlay ≥ 1.2s (minimum reading time)
- Max 6 words per text_overlay
- Text overlay COMPLEMENTS narration, never repeats it
- Sum of all durations must equal video_length (tolerance ±2s)

AUDIO-VISUAL SYNC (CRITICAL):
- Each scene's "narration" field must contain the EXACT transcript segment spoken during that scene
- Scene timing MUST match narration pacing — if narrator says 3 words in 1.5s, that scene is 1.5s
- text_overlay must REINFORCE what narrator is saying (visual keyword, not the full sentence)
- If narration file exists, estimate word timing (~2.5 words/second for pt-BR) and distribute scenes accordingly
- Hook scene text appears BEFORE narrator speaks (visual lead)
- CTA scene text stays visible AFTER narrator finishes (reading time)

CAROUSEL/BANNER BAN (CRITICAL):
- NEVER use images from ads/ (carousel, banner, static ad images) in video pro
- Video pro is CINEMATIC — use ONLY raw photographic images (imgs/, assets/, API-generated)
- If photography_plan references an ads/ image, SKIP it and use a photographic alternative
- Only exception: payload contains "carousel_in_video": true explicitly

TYPOGRAPHY — MAGAZINE EDITORIAL STYLE:
- text_layout.position: "top" is the DEFAULT. Use "center" ONLY when face_position is "top" (to avoid covering the face). NEVER "bottom"
- text_layout.font_size: hook 120-140px, headlines 96-120px, body 80-96px. NEVER below 80px
- text_layout.font_weight: 900 for headlines, 700 for body
- text_layout.font_family: "Lora" or "DM Serif Display" (DEFAULT — editorial serif), "Oswald" or "Bebas Neue" ONLY for hooks (max 2-3 scenes), "Montserrat" for data/numbers
- text_layout.line_height: 1.0 for tight headlines, 1.15 for body
- text_layout.color: "#FFFFFF" on dark overlays, "#0D0D0D" on light — NEVER gray
- Every scene with text MUST have text_layout with ALL fields (font_size, font_weight, font_family, position, color, line_height)

GLOBAL VIDEO SETTINGS — include these top-level fields in the scene plan JSON:
- "color_grading": { "gamma": 1.05, "saturate": 1.1, "contrast": 1.15, "hueRotate": 10 } — unified color across ALL scenes ("same camera, same day")
- "film_grain": { "intensity": 0, "monochromatic": true, "lightLeak": false } — cinematic grain + light leaks
- "organic_shake": { "amplitude": 2, "frequency": 1 } — subtle hand-held feel (set amplitude 1-2 for premium, 3-5 for UGC)
- Adjust values based on style_preset from Photography Director. For tech/futuristic: higher contrast, bluer hue. For warm/lifestyle: lower contrast, warmer grain.

ADVANCED SCENE FIELDS (per scene):
- "hud_text": { "brackets": true, "scanLine": true, "dataPoints": true, "accentColor": "#0099FF" } — for tech/futuristic scenes (hook, data, CTA)
- "motion.speed_ramp_stages": [0, 0.8, 0.2, 1.0] — speed ramp (input%, output% pairs)
- "lens_transition": "chromatic-glitch" — types: rack-focus, whip-blur, defocus-refocus, chromatic-glitch

Save each plan to: ${output_dir}/video/${task_name}_video_0N_scene_plan_motion.json

The JSON schema is defined in SKILL.md — follow it exactly.

IMPORTANT: ONLY generate scene plan JSON files. Do NOT generate audio or run any render scripts.
After saving all plans, print exactly: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;
    } else {
      scenePlanPrompt = `Create a scene plan JSON for a ${videoDur}s video ad.

Campaign: "${task_name}". Format: 9:16 (1080x1920). ${langInstruction}

PHOTOGRAPHY PLAN (follow exactly — each shot has start_s/end_s timestamps you MUST respect):
${photoPlanContent || photographyNote}

CRITICAL — TIMESTAMP ANCHORING:
The photography plan defines WHEN each shot appears (start_s → end_s). When you split a shot into multiple cuts:
- All cuts from that shot MUST fit within its start_s → end_s window
- Use the shot's image for all cuts within that window
- text_overlay must match what the narrator is saying during that time window
- Do NOT rearrange shots or move content between time windows

AUDIO: ${narrationNote}
${musicInstructions}

Generate a JSON file with this structure:
{
  "titulo": "...", "video_length": ${videoDur}, "format": "9:16",
  "width": 1080, "height": 1920,
  "voice": "${job.data.narrator || 'rachel'}",
  "narration_file": "path or null", "music": "path or null", "music_volume": 0.15,
  "color_grading": { "gamma": 1.05, "saturate": 1.1, "contrast": 1.15, "hueRotate": 10 },
  "film_grain": { "intensity": 0, "monochromatic": true, "lightLeak": false },
  "organic_shake": { "amplitude": 2, "frequency": 1 },
  "scenes": [
    { "id": "hook_01", "type": "hook", "duration": 1.5,
      "image": "/absolute/path.png", "image_has_text": true,
      "narration": "exact transcript segment spoken during this scene",
      "text_overlay": "", "motion": { "type": "breathe" },
      "text_layout": { "font_size": 96, "font_weight": 900, "font_family": "Lora", "position": "top", "color": "#FFFFFF", "line_height": 1.0 },
      "overlay": "dark", "overlay_opacity": 0.45,
      "transition": "crossfade"
    }
  ]
}

RULES:
- NEVER use images from ads/ (carousel/banner) — video pro uses ONLY raw photographic images
- 25-40 cuts. First ≤1.5s, last ≥3s. Sum MUST equal ${videoDur}s exactly
- Every scene MUST have "narration" field with the exact transcript being spoken (or "" for silent scenes)
- text_overlay must reinforce what narrator says at that moment — NOT generic/unrelated text
- image_has_text:true → text_overlay:"", motion:"breathe"
- image_has_text:false → text_overlay with max 6 words
- position "top" is DEFAULT. Use "center" only when image has face at top. NEVER "bottom"
- font_family: "Lora"/"DM Serif Display" default. "Oswald"/"Bebas Neue" only for hooks (max 2-3)
- Never same motion 2x in row. font_size ≥60px
- Last 3s = silent closing shot with URL/logo (narration: "")

Save to: ${output_dir}/video/${task_name}_video_0N_scene_plan_motion.json
Then print: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;
    }

    const sceneTimeout = sceneQuality === 'premium' ? 900000 : 600000;
    await runClaude(scenePlanPrompt, 'video_pro', output_dir, sceneTimeout, { model: sceneModel });
    await job.extendLock(job.token, 900000).catch(() => {});

    process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} plan_ready\n`);
    const wantDraft = job.data.video_draft === true;
    if (wantDraft) {
      log(output_dir, 'video_pro', 'Rendering draft video(s) with placeholder backgrounds...');
      for (let i = 1; i <= video_count; i++) {
        const idx = String(i).padStart(2, '0');
        const planPath = vfFind(idx, '_scene_plan_motion.json');
        if (!fs.existsSync(planPath)) continue;

        try {
          const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
          const draftPlan = JSON.parse(JSON.stringify(plan));
          const brandColors = ['#1a1a2e', '#16213e', '#0f3460', '#533483', '#e94560'];
          draftPlan.scenes.forEach((scene, si) => {
            if (!scene.image || !fs.existsSync(scene.image)) {
              scene.image = null;
              scene.background_color = brandColors[si % brandColors.length];
            }
          });
          const draftPlanPath = path.resolve(projectRoot, output_dir, 'video', vf(idx, '_draft.json'));
          fs.writeFileSync(draftPlanPath, JSON.stringify(draftPlan, null, 2));

          const draftOutput = path.resolve(projectRoot, output_dir, 'video', vf(idx, '_draft.mp4'));
          try {
            execFileSync('node', [
              renderFfmpeg,
              `${output_dir}/video/${vf(idx, '_draft.json')}`,
              `${output_dir}/video/${vf(idx, '_draft.mp4')}`,
            ], { cwd: projectRoot, stdio: 'pipe', timeout: 300000 });
            log(output_dir, 'video_pro', `Draft ${idx} rendered: ${draftOutput}`);
            process.stdout.write(`[STAGE3_DRAFT_READY] ${output_dir} ${draftOutput}\n`);
          } catch (draftErr) {
            log(output_dir, 'video_pro', `Draft render failed: ${draftErr.message.slice(0, 200)}`);
          }
        } catch (e) {
          log(output_dir, 'video_pro', `Draft prep failed for video ${idx}: ${e.message}`);
        }
      }
    } else {
      log(output_dir, 'video_pro', 'Draft skipped (default). Use video_draft:true to enable.');
    }

    await job.extendLock(job.token, 900000).catch(() => {});
    process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} images_start\n`);
    if (image_source === 'api') {
      const jobProvider = job.data.image_provider || imageProviderName;
      const imageProvider = getImageProvider(jobProvider);
      const genImage = imageProvider.generateImage;
      const model = job.data.image_model || getEnv('KIE_DEFAULT_MODEL', defaultModel);
      const useBrand = job.data.use_brand_overlay !== false;
      const brand = useBrand ? readBrandContext(project_dir) : null;
      if (brand) log(output_dir, 'video_pro', `Brand context: ${brand.brandName} | provider: ${jobProvider}`);

      for (let i = 1; i <= video_count; i++) {
        const idx = String(i).padStart(2, '0');
        const planPath = vfFind(idx, '_scene_plan_motion.json');
        if (!fs.existsSync(planPath)) continue;

        let plan;
        try { plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')); }
        catch (e) { log(output_dir, 'video_pro', `Could not parse scene plan ${idx}: ${e.message}`); continue; }

        const absImgsDir = path.resolve(projectRoot, output_dir, 'imgs');
        fs.mkdirSync(absImgsDir, { recursive: true });
        const promptMap = new Map();
        let planChanged = false;

        for (let s = 0; s < plan.scenes.length; s++) {
          const scene = plan.scenes[s];
          if (!scene.image_prompt) continue;
          if (scene.image && fs.existsSync(scene.image)) continue;

          if (promptMap.has(scene.image_prompt)) {
            scene.image = promptMap.get(scene.image_prompt);
            planChanged = true;
            continue;
          }

          const filename = `${task_name}_video_${idx}_img_${String(promptMap.size + 1).padStart(2, '0')}.jpg`;
          const outputPath = path.join(absImgsDir, filename);
          const sceneType = scene.type || scene.id || 'solution';
          const colorHint = brand?.colors?.length ? ` Colors: ${brand.colors.slice(0, 2).join(', ')}.` : '';
          const moodMap = {
            hook: 'dramatic tension, high contrast, strong impact',
            tension: 'emotional challenge, aspiration, desire to change',
            solution: 'transformation, empowerment, positive energy',
            social_proof: 'community, people achieving, belonging',
            cta: 'optimistic, inviting, forward momentum',
          };
          const mood = moodMap[sceneType] || moodMap.solution;
          const rawPrompt = `${scene.image_prompt}. ${mood}. vertical 9:16.${colorHint} Cinematic lighting, photorealistic. No text, no words, no watermark.`;
          const finalPrompt = rawPrompt.length > 490 ? rawPrompt.slice(0, 487) + '...' : rawPrompt;

          log(output_dir, 'video_pro', `Generating image ${promptMap.size + 1} for video_${idx}: ${scene.image_prompt.slice(0, 80)}`);
          try {
            await genImage(outputPath, finalPrompt, model, '9:16');
            scene.image = outputPath;
            promptMap.set(scene.image_prompt, outputPath);
            planChanged = true;
            const promptTxtPath = outputPath.replace(/\.[^.]+$/, '_prompt.txt');
            fs.writeFileSync(promptTxtPath, finalPrompt, 'utf-8');
          } catch (err) {
            log(output_dir, 'video_pro', `Failed image gen: ${err.message}`);
          }
        }

        if (planChanged) {
          for (const scene of plan.scenes) {
            if (scene.image_prompt && !scene.image && promptMap.has(scene.image_prompt)) {
              scene.image = promptMap.get(scene.image_prompt);
            }
          }
          fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
          log(output_dir, 'video_pro', `Updated plan with ${promptMap.size} unique images for ${plan.scenes.length} cuts`);

          const promptsLog = [];
          for (const [prompt, imgPath] of promptMap.entries()) {
            promptsLog.push({ prompt, image: path.basename(imgPath) });
          }
          const promptsPath = path.resolve(absImgsDir, `${task_name}_video_${idx}_prompts.json`);
          fs.writeFileSync(promptsPath, JSON.stringify(promptsLog, null, 2), 'utf-8');
          log(output_dir, 'video_pro', `Saved ${promptsLog.length} image prompts to ${promptsPath}`);
        }
      }
    }

    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const planPath = vfFind(idx, '_scene_plan_motion.json');
      if (!fs.existsSync(planPath)) continue;

      try {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        let fixes = 0;
        const motionTypes = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'];
        const positions = ['top', 'center', 'bottom'];

        if (!job.data.carousel_in_video) {
          for (let s = 0; s < plan.scenes.length; s++) {
            const imgPath = plan.scenes[s].image || '';
            if (/\/ads\/|carousel_|_carousel|banner_/i.test(imgPath)) {
              const absImgsDirFix = path.resolve(projectRoot, output_dir, 'imgs');
              const absAssetsDirFix = path.resolve(projectRoot, project_dir, 'assets');
              const imgExts2 = ['.jpg', '.jpeg', '.png', '.webp'];
              const findReplacement = (dir) => {
                if (!fs.existsSync(dir)) return null;
                const imgs = fs.readdirSync(dir).filter(f => imgExts2.includes(path.extname(f).toLowerCase()));
                return imgs.length > 0 ? path.join(dir, imgs[s % imgs.length]) : null;
              };
              const replacement = findReplacement(absImgsDirFix) || findReplacement(absAssetsDirFix);
              if (replacement) {
                log(output_dir, 'video_pro', `Auto-fix: replaced carousel image "${path.basename(imgPath)}" → "${path.basename(replacement)}" in scene ${plan.scenes[s].id}`);
                plan.scenes[s].image = replacement;
                plan.scenes[s].image_has_text = false;
                if (!plan.scenes[s].text_overlay) plan.scenes[s].text_overlay = plan.scenes[s].id.replace(/_/g, ' ').toUpperCase();
                fixes++;
              }
            }
          }
        }

        for (let s = 1; s < plan.scenes.length; s++) {
          const prev = plan.scenes[s - 1].motion?.type;
          const curr = plan.scenes[s].motion?.type;
          if (prev && curr && prev === curr) {
            const alts = motionTypes.filter(m => m !== curr);
            plan.scenes[s].motion.type = alts[s % alts.length];
            fixes++;
          }
        }

        for (let s = 2; s < plan.scenes.length; s++) {
          const p1 = plan.scenes[s - 2].text_layout?.position;
          const p2 = plan.scenes[s - 1].text_layout?.position;
          const p3 = plan.scenes[s].text_layout?.position;
          if (p1 && p2 && p3 && p1 === p2 && p2 === p3) {
            const alts = positions.filter(p => p !== p3);
            plan.scenes[s].text_layout.position = alts[s % alts.length];
            fixes++;
          }
        }

        const totalSceneDur = plan.scenes.reduce((sum, scene) => sum + scene.duration, 0);
        if (plan.video_length && plan.video_length < videoDur) {
          log(output_dir, 'video_pro', `Auto-fix: video_length ${plan.video_length}s → ${videoDur}s (audio + 3s)`);
          plan.video_length = videoDur;
          fixes++;
        }

        if (totalSceneDur < videoDur - 1) {
          const deficit = videoDur - totalSceneDur;
          const lastScene = plan.scenes[plan.scenes.length - 1];
          log(output_dir, 'video_pro', `Auto-fix: scene total ${totalSceneDur.toFixed(1)}s < ${videoDur}s — extending last scene "${lastScene.id}" by ${deficit.toFixed(1)}s`);
          lastScene.duration += deficit;
          fixes++;
        }

        let missingNarration = 0;
        for (let s = 0; s < plan.scenes.length; s++) {
          if (plan.scenes[s].narration === undefined) {
            plan.scenes[s].narration = '';
            missingNarration++;
          }
        }
        if (missingNarration > 0) {
          log(output_dir, 'video_pro', `Auto-fix: added missing "narration" field to ${missingNarration} scenes`);
          fixes += missingNarration;
        }

        if (fixes > 0) {
          fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
          log(output_dir, 'video_pro', `Auto-fixed ${fixes} rule violations in video ${idx}`);
        }

        const finalDur = plan.scenes.reduce((sum, scene) => sum + scene.duration, 0);
        log(output_dir, 'video_pro', `Video ${idx}: ${plan.scenes.length} cuts, ${finalDur.toFixed(1)}s total (target: ${videoDur}s)`);
      } catch (e) {
        log(output_dir, 'video_pro', `Validation error video ${idx}: ${e.message}`);
      }
    }

    log(output_dir, 'video_pro', 'Phase 2.5: Typography validation...');
    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const planPath = vfFind(idx, '_scene_plan_motion.json');
      if (!fs.existsSync(planPath)) continue;

      try {
        const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        let typoFixes = 0;

        for (let s = 0; s < plan.scenes.length; s++) {
          const scene = plan.scenes[s];

          if (scene.text_overlay && scene.text_layout) {
            const minSize = scene.type === 'hook' ? 120 : scene.type === 'cta' ? 96 : 80;
            if (scene.text_layout.font_size && scene.text_layout.font_size < minSize) {
              scene.text_layout.font_size = minSize;
              typoFixes++;
            }
            if (scene.text_layout.font_weight && scene.text_layout.font_weight < 700) {
              scene.text_layout.font_weight = 700;
              typoFixes++;
            }
          }

          const imgPath = scene.image || '';
          if (!scene.image_has_text && imgPath &&
              /(_post|_stories|carousel_|oficial_|logo_|instagram|facebook|_ad\.|banner|calendar)/i.test(imgPath)) {
            scene.image_has_text = true;
            typoFixes++;
          }
          if (scene.image_has_text === true) {
            if (scene.text_overlay) {
              scene.text_overlay = '';
              typoFixes++;
            }
            if (scene.motion) {
              const mt = typeof scene.motion === 'object' ? scene.motion.type : scene.motion;
              if (mt && !['breathe', 'static', 'none'].includes(mt)) {
                if (typeof scene.motion === 'object') scene.motion.type = 'breathe';
                else scene.motion = { type: 'breathe' };
                typoFixes++;
              }
            }
          }

          if (scene.text_layout?.position === 'bottom') {
            scene.text_layout.position = 'top';
            typoFixes++;
          }
          if (scene.text_position === 'bottom') {
            scene.text_position = 'top';
            typoFixes++;
          }

          if (scene.text_overlay) {
            const words = scene.text_overlay.trim().split(/\s+/);
            if (words.length > 6) {
              scene.text_overlay = words.slice(0, 6).join(' ');
              typoFixes++;
            }
          }

          if (scene.text_overlay && !scene.overlay) {
            scene.overlay = 'dark';
            scene.overlay_opacity = 0.45;
            typoFixes++;
          }

          if ((plan.format === '9:16' || plan.height > plan.width) && scene.image_has_text) {
            const imgPath2 = scene.image || '';
            if (imgPath2 && fs.existsSync(imgPath2)) {
              try {
                const dims = getImageDimensions(imgPath2);
                if (dims && dims.width && dims.height) {
                  const ratio = dims.width / dims.height;
                  if (ratio > 1.2) {
                    const absImgsDirFix = path.resolve(projectRoot, output_dir, 'imgs');
                    const absAssetsDirFix = path.resolve(projectRoot, project_dir, 'assets');
                    const imgExts3 = ['.jpg', '.jpeg', '.png', '.webp'];
                    const findPortrait = (dir) => {
                      if (!fs.existsSync(dir)) return null;
                      const imgs = fs.readdirSync(dir)
                        .filter(f => imgExts3.includes(path.extname(f).toLowerCase()))
                        .map(f => ({ name: f, path: path.join(dir, f) }))
                        .filter(f => {
                          const d = getImageDimensions(f.path);
                          return d && d.height >= d.width;
                        });
                      return imgs.length > 0 ? imgs[s % imgs.length].path : null;
                    };
                    const replacement = findPortrait(absImgsDirFix) || findPortrait(absAssetsDirFix);
                    if (replacement) {
                      log(output_dir, 'video_pro', `Auto-fix: replaced landscape has_text image "${path.basename(imgPath2)}" (${dims.width}x${dims.height}) → "${path.basename(replacement)}" in scene ${scene.id}`);
                      scene.image = replacement;
                      typoFixes++;
                    } else {
                      log(output_dir, 'video_pro', `WARN: scene ${scene.id} uses landscape has_text image — no portrait replacement found`);
                    }
                  }
                }
              } catch {}
            }
          }
        }

        if (typoFixes > 0) {
          fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
          log(output_dir, 'video_pro', `Typography: fixed ${typoFixes} violations in video ${idx}`);
        } else {
          log(output_dir, 'video_pro', `Typography: all checks passed for video ${idx}`);
        }
      } catch (e) {
        log(output_dir, 'video_pro', `Typography validation error: ${e.message}`);
      }
    }

    const approvalPath = path.resolve(projectRoot, output_dir, 'video', 'approved.json');
    const rejectedPath = path.resolve(projectRoot, output_dir, 'video', 'rejected.json');

    log(output_dir, 'video_pro', '[VIDEO_APPROVAL_NEEDED] Waiting for approval (30 min timeout)...');
    process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
    fs.writeFileSync(path.resolve(projectRoot, output_dir, 'video', 'approval_needed.json'),
      JSON.stringify({ type: 'video_editor', output_dir, ts: Date.now() }));

    const approved = await waitForFile(approvalPath, 1800000);
    if (!approved) {
      if (fs.existsSync(rejectedPath)) {
        log(output_dir, 'video_pro', 'User rejected the video plan. Skipping render.');
        return { status: 'skipped', reason: 'rejected by user' };
      }
      writeVideoApprovalTimeout(projectRoot, output_dir);
      log(output_dir, 'video_pro', 'Approval timeout. Skipping video render.');
      return { status: 'skipped', reason: 'approval timeout' };
    }

    await job.extendLock(job.token, 900000).catch(() => {});
    process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} render_start\n`);
    log(output_dir, 'video_pro', 'Starting video render...');

    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const ts = videoTimestamp();
      const proFilename = `${task_name}_pro_${idx}_${ts}.mp4`;
      const videoOutput = path.resolve(projectRoot, output_dir, 'video', proFilename);
      backupIfExists(videoOutput);
      const absScenePlan = vfFind(idx, '_scene_plan_motion.json');
      const planToRender = path.relative(projectRoot, absScenePlan);

      if (!fs.existsSync(absScenePlan)) {
        log(output_dir, 'video_pro', `Scene plan not found for video ${i}, skipping: ${absScenePlan}`);
        continue;
      }

      const renderer = getVideoRenderer('pro');
      const rendererName = renderer === renderRemotion ? 'Remotion' : 'ffmpeg';
      log(output_dir, 'video_pro', `Rendering video ${i}/${video_count} via ${rendererName}...`);
      try {
        execFileSync('node', [
          renderer,
          planToRender,
          `${output_dir}/video/${proFilename}`,
        ], {
          cwd: projectRoot,
          stdio: 'pipe',
          timeout: 600000,
        });
        log(output_dir, 'video_pro', `Video ${i} rendered via ${rendererName}: ${videoOutput}`);
      } catch (renderErr) {
        if (renderer === renderRemotion) {
          log(output_dir, 'video_pro', `Remotion render ${i} failed, falling back to ffmpeg: ${renderErr.message.slice(0, 150)}`);
          try {
            execFileSync('node', [renderFfmpeg, planToRender, `${output_dir}/video/${proFilename}`], {
              cwd: projectRoot, stdio: 'pipe', timeout: 300000,
            });
            log(output_dir, 'video_pro', `Video ${i} rendered via ffmpeg (fallback): ${videoOutput}`);
          } catch (fbErr) {
            log(output_dir, 'video_pro', `ffmpeg fallback ${i} also failed: ${fbErr.message.slice(0, 200)}`);
          }
        } else {
          log(output_dir, 'video_pro', `ffmpeg render ${i} failed: ${renderErr.message.slice(0, 200)}`);
        }
      }
    }

    return { status: 'complete', output: `${output_dir}/video/` };
  };
}

module.exports = { createWorkerVideoProHandler };
