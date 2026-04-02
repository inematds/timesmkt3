const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');

function createWorkerVideoHandlers({
  projectRoot,
  imageProviderName,
  defaultModel,
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
  async function handleVideoQuick(job) {
    const {
      task_name, task_date, output_dir, project_dir,
      language, campaign_brief,
      video_count = 1,
    } = job.data;
    const absVideoDir = path.resolve(projectRoot, output_dir, 'video');
    fs.mkdirSync(absVideoDir, { recursive: true });

    if (job.data.skip_completed) {
      const videoDir = path.resolve(projectRoot, output_dir, 'video');
      const hasQuick = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some(f => f.startsWith(`${task_name}_quick_`) && f.endsWith('.mp4'));
      const legacyVideo = path.resolve(projectRoot, output_dir, 'video', `${task_name}_video_01.mp4`);
      if (hasQuick || fs.existsSync(legacyVideo)) {
        log(output_dir, 'video_quick', 'Skipping — video already exists');
        return { status: 'skipped', reason: 'already completed' };
      }
    }

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: All text overlays MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const adsDir = path.resolve(projectRoot, output_dir, 'ads');
    const adImages = fs.existsSync(adsDir)
      ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).map(f => path.join(adsDir, f))
      : [];
    const adImageList = adImages.length > 0
      ? adImages.map(f => `  - ${f}`).join('\n')
      : '  (no images found in ads/)';

    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
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

    const audioInstructions = hasElevenLabs ? `
NARRATION (optional — ElevenLabs available):
- Read narrative.json → video_narration field
- Write a SHORT narration script — MAXIMUM 15-20 SECONDS of speech (~40-50 words for pt-BR)
- This is a QUICK video (10-20s total) — the narration must be brief, punchy, and fit within the video duration
- Do NOT reuse the pro narration script (it's 60s) — write a NEW shorter script
- Generate audio: node pipeline/generate-audio.js ${output_dir}/audio/${task_name}_quick_narration.mp3 "<short_script>" ${job.data.narrator || 'rachel'}
- IMPORTANT: Use the SAME voice as the pro video (${job.data.narrator || 'rachel'}) — consistency matters
- Set "narration_file" in the scene plan to the generated path
- The video_length MUST match the narration duration (10-20s)` : `
NARRATION: ElevenLabs not configured. Generate silent video — text overlays only.`;

    const musicInstructions = musicFiles.length > 0 ? `
BACKGROUND MUSIC (available):
${musicFiles.map(f => `  - ${f}`).join('\n')}
- Set "music" in scene plan, "music_volume": 0.15` : `
BACKGROUND MUSIC: No music files found. Set "music": null.`;

    const prompt = `You are the Video Quick Agent. Follow the skill defined in skills/video-quick/SKILL.md.

You create SHORT, SIMPLE slideshow videos (10-20s) using the ad images already produced by the Designer.

Task: Create ${video_count} quick video(s) for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

STEP 1 — Read inputs:
- ${output_dir}/copy/narrative.json — campaign narrative, emotional_arc, headlines, key_phrases
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction, approved CTAs
- ${project_dir}/knowledge/brand_identity.md — brand colors, tone
- skills/typography-on-image/SKILL.md — CRITICAL: rules for text positioning, font size, contrast, and legibility over images
- skills/video-art-direction/SKILL.md — visual style presets (colors, typography, transitions)

STEP 2 — Available images from Designer (use these, do NOT generate new ones):
${adImageList}

${audioInstructions}
${musicInstructions}

STEP 3 — Create scene plan for EACH video. Save to ${output_dir}/video/${task_name}_video_0N_scene_plan.json:
{
  "titulo": "short title",
  "video_length": 15,
  "format": "9:16",
  "width": 1080,
  "height": 1920,
  "voice": "${job.data.narrator || 'rachel'}",
  "narration_file": "path or null",
  "narration_volume": 1,
  "music": "path or null",
  "music_volume": 0.15,
  "scenes": [
    {
      "id": "hook",
      "type": "hook",
      "duration": 3,
      "image": "/absolute/path/to/carousel_01.png",
      "image_type": "raw",
      "narration": "exact transcript segment spoken during this scene",
      "text_overlay": "KEYWORD FROM NARRATION",
      "text_color": "#FFFFFF",
      "text_position": "top",
      "overlay_opacity": 0.5,
      "font_family": "Lora",
      "font_size": 88,
      "font_weight": "900",
      "text_shadow": "0 4px 12px rgba(0,0,0,0.8)",
      "motion": { "type": "push-in", "intensity": "moderate" }
    }
  ]
}

RULES:
- Use ONLY images from ads/ listed above — never generate or download new images
- 4-6 scenes, 2-4 seconds each, totaling 10-20 seconds MAX
- video_length MUST be 10-20 seconds — NEVER longer
- These carousel/ad images may have text in the center/body area
- Last scene MUST be the CTA image from the ads
- Each scene uses a DIFFERENT image
- Motion: alternate between push-in, ken-burns-in, drift, breathe (never same 2x in a row)
- Format: 9:16 (1080x1920) for Reels/Shorts/Stories
- Every scene MUST have "narration" field with the exact transcript being spoken (or "" for silent)

TYPOGRAPHY — MAGAZINE HEADLINE AT TOP (CRITICAL):
- text_position: "top" default. Use "center" only when image has face at top. NEVER "bottom"
- text_overlay = the KEY WORD or SHORT PHRASE from what the narrator is saying at that moment
- The text must FILL the upper portion of the screen — big, bold, magazine cover style
- font_size: 96-120px — LARGE, dominating the top third of the screen. NEVER below 88px
- font_weight: 900 (black) — maximum visual weight
- font_family: "Lora" or "DM Serif Display" (DEFAULT — editorial serif magazine style). "Bebas Neue" only for hook scene
- text_color: "#FFFFFF" with strong text_shadow: "0 4px 12px rgba(0,0,0,0.8)"
- overlay_opacity: 0.45-0.55 (dark overlay behind text for legibility)
- Max 4-5 words per text_overlay — shorter is better, one impactful phrase
- text_overlay must SYNC with narration — extract the key word/phrase the narrator is saying at that moment
- Do NOT write generic text — each overlay reflects the specific narration segment of that scene

After saving scene plans, print exactly: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;

    await runClaude(prompt, 'video_quick', output_dir, 600000);

    const approvalPath = path.resolve(projectRoot, output_dir, 'video', 'approved.json');
    const rejectedPath = path.resolve(projectRoot, output_dir, 'video', 'rejected.json');

    log(output_dir, 'video_quick', '[VIDEO_APPROVAL_NEEDED] Waiting for approval (30 min timeout)...');
    process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
    fs.writeFileSync(path.resolve(projectRoot, output_dir, 'video', 'approval_needed.json'),
      JSON.stringify({ type: 'video', agent: 'video_quick', output_dir, ts: Date.now() }));

    const approved = await waitForFile(approvalPath, 1800000);
    if (!approved) {
      if (fs.existsSync(rejectedPath)) {
        log(output_dir, 'video_quick', 'User rejected. Skipping render.');
        return { status: 'skipped', reason: 'rejected' };
      }
      log(output_dir, 'video_quick', 'Approval timeout. Skipping.');
      return { status: 'skipped', reason: 'approval timeout' };
    }

    log(output_dir, 'video_quick', 'Rendering video(s)...');

    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      let planPath = path.resolve(projectRoot, output_dir, 'video', `${task_name}_video_${idx}_scene_plan.json`);
      if (!fs.existsSync(planPath)) planPath = path.resolve(projectRoot, output_dir, 'video', `video_${idx}_scene_plan.json`);
      if (!fs.existsSync(planPath)) {
        log(output_dir, 'video_quick', `Scene plan not found: video_${idx}, skipping.`);
        continue;
      }

      const ts = videoTimestamp();
      const videoOutput = path.resolve(projectRoot, output_dir, 'video', `${task_name}_quick_${idx}_${ts}.mp4`);
      backupIfExists(videoOutput);

      if (job.data.image_bg_mode) {
        try {
          const planData = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
          planData.image_bg_mode = job.data.image_bg_mode;
          fs.writeFileSync(planPath, JSON.stringify(planData, null, 2));
        } catch {}
      }

      log(output_dir, 'video_quick', `Rendering video ${i}/${video_count}...`);

      try {
        const renderScript = path.resolve(projectRoot, 'pipeline', 'render-video-ffmpeg.js');
        execFileSync('node', [renderScript, planPath, videoOutput], {
          cwd: projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 300000,
        });
        log(output_dir, 'video_quick', `Video ${i} rendered: ${videoOutput}`);
      } catch (renderErr) {
        log(output_dir, 'video_quick', `Render failed: ${renderErr.message.slice(0, 200)}`);
      }
    }

    return { status: 'complete', output: `${output_dir}/video/` };
  }

  async function handleVideoAdSpecialist(job) {
    const {
      task_name, task_date, output_dir, project_dir, platform_targets,
      language, campaign_brief,
      video_count = 1, video_briefs = [],
      image_source: rawImageSource = 'brand',
      image_folder = null,
    } = job.data;
    const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
    const absVideoDir = path.resolve(projectRoot, output_dir, 'video');
    fs.mkdirSync(absVideoDir, { recursive: true });

    const lang = language || 'en';
    const langInstruction = lang === 'pt-BR'
      ? 'IMPORTANT: All text overlays and copy in the videos MUST be in Brazilian Portuguese (pt-BR).'
      : '';
    const briefInstruction = campaign_brief
      ? `\nCampaign Brief: ${campaign_brief}`
      : '';

    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

    const videoBriefsText = video_briefs.length > 0
      ? video_briefs.map((b, i) => `  ${i + 1}. ${b}`).join('\n')
      : Array.from({ length: video_count }, (_, i) =>
          `  ${i + 1}. Video ${i + 1} — 20 seconds, unique angle on the campaign theme`
        ).join('\n');

    const musicDirs = [
      path.resolve(projectRoot, project_dir, 'assets', 'music'),
      path.resolve(projectRoot, project_dir, 'assets', 'audio'),
      path.resolve(projectRoot, project_dir, 'assets'),
    ];
    let musicFiles = [];
    for (const musicDir of musicDirs) {
      if (fs.existsSync(musicDir)) {
        const found = fs.readdirSync(musicDir).filter(f => /\.(mp3|wav|aac|m4a)$/i.test(f) && !f.includes('narration'));
        if (found.length > 0) {
          musicFiles = found.map(f => path.relative(projectRoot, path.join(musicDir, f)));
          break;
        }
      }
    }
    const musicInstructions = musicFiles.length > 0 ? `
BACKGROUND MUSIC (available files):
${musicFiles.map(f => `  - ${f}`).join('\n')}
- Set "music" in the scene plan to the chosen file path
- Set "music_volume" to 0.10–0.20 (default 0.15 — must not overpower narration)
- Choose the file that best matches the campaign energy and BPM of the video
- If no music file fits, set "music": null
` : `
BACKGROUND MUSIC: No music files found in ${project_dir}/assets/music/.
- Set "music": null in the scene plan
- User can add .mp3 files to ${project_dir}/assets/music/ and re-run
`;

    const audioInstructions = hasElevenLabs ? `
AUDIO NARRATION (ElevenLabs available):
- Write a narration script for each video (20-30 seconds of natural speech)
- Generate narration audio using: node pipeline/generate-audio.js <output.mp3> "<script>" [rachel|bella|domi|antoni|josh|arnold]
- Save audio as: ${output_dir}/audio/${task_name}_video_01_narration.mp3, ${task_name}_video_02_narration.mp3, etc.
- Include the narration text in the scene plan under "narration_script"
- Include the audio path in the scene plan under "audio": "${output_dir}/audio/${task_name}_video_0N_narration.mp3"
- Recommended voices: rachel (warm/emotional), bella (clear/friendly), domi (confident), antoni (professional), josh (deep/warm), arnold (bold/energetic)
${musicInstructions}` : `
AUDIO: ElevenLabs not configured. Generate silent videos. Narration scripts only in scene plan.
${musicInstructions}`;

    const providerNameVideo = job.data.image_provider || imageProviderName;
    let imageSourceSection = '';
    if (image_source === 'api') {
      imageSourceSection = `
STEP 2 — Image source: ${providerNameVideo} API (images will be generated AFTER you write the scene plan)
- Set "image": null for all scenes in the JSON
- For EACH scene, add an "image_prompt" field: a concise English visual description (max 200 chars)
  of exactly what should be shown visually in that scene — derived from the scene's narration and purpose
  Example: "tired person sitting on bed at sunrise, exhausted expression, warm muted light, cinematic"
- The pipeline will generate one image per scene using your image_prompt + brand colors
- Do NOT use generic descriptions — each image_prompt must match what is being said/shown in that scene`;
    } else if (image_source === 'free') {
      const freeProvider = getFreeImageProvider();
      if (freeProvider) {
        const authNote = freeProvider.authHeader
          ? `Header: ${freeProvider.authHeader}: ${freeProvider.key}`
          : `Parameter: key=${freeProvider.key}`;
        imageSourceSection = `
STEP 2 — Image source: ${freeProvider.name.toUpperCase()} (free stock photos)
- Search: GET ${freeProvider.searchUrl}?query=<theme>&per_page=10&orientation=portrait
  ${authNote}
- Download the best matching photo for each scene to ${output_dir}/imgs/scene_0N.jpg
- Use the downloaded absolute path as the scene "image" field
- Set "image_type": "raw" for clean stock photos (no text visible)
- If a stock photo has visible text/watermarks, set "image_type": "banner" — renderer will letterbox
- Choose photos that match the scene's emotional context (hook=dramatic, cta=warm/inviting)`;
      } else {
        imageSourceSection = `
STEP 2 — Image source: no free provider configured (set PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, or PIXABAY_API_KEY in .env)
- Use CSS-only backgrounds in the scene plan`;
      }
    } else if (image_source === 'folder') {
      const folderAssets = imageFolder ? getFolderAssets(imageFolder) : [];
      const folderList = formatAssetList(folderAssets);
      if (folderAssets.length > 0) {
        imageSourceSection = `
STEP 2 — Images from user-specified folder (study dimensions before assigning):
${folderList}

IMAGE ANALYSIS RULES (mandatory before building scene plan):
- Read each image's orientation: portrait images work best for 1080x1920 video
- Choose images whose visual content matches the scene's emotional type
- Never assign the same image to two scenes
- BANNER images (marked [banner]): set "image_type": "banner" — letterbox only
- VIDEO CLIPS (marked [clip]): set "image_type": "clip" — use as video source
- Raw photos (marked [raw]): set "image_type": "raw" — Ken Burns effects applied`;
      } else {
        imageSourceSection = `
STEP 2 — Image source: folder "${imageFolder || '(not specified)'}" — no images found
- Use CSS-only backgrounds in the scene plan`;
      }
    } else if (image_source === 'screenshot') {
      const briefPath = path.resolve(projectRoot, output_dir, 'creative', 'creative_brief.json');
      const researchPath = path.resolve(projectRoot, output_dir, 'research_results.json');
      const productPath = path.resolve(projectRoot, project_dir, 'knowledge', 'product_campaign.md');
      const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
      const explicitUrls = job.data.screenshot_urls || [];
      const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
      log(output_dir, 'video_quick', `Capturing screenshots from ${allUrls.length} URLs...`);
      const screenshotAssets = await captureScreenshots(allUrls, path.resolve(projectRoot, output_dir));
      const brandAssets = getProjectAssets(project_dir);
      const combinedAssets = [...screenshotAssets, ...brandAssets];
      const assetList = formatAssetList(combinedAssets);
      imageSourceSection = `
STEP 2 — Screenshots + brand images (${screenshotAssets.length} screenshots + ${brandAssets.length} brand):
${assetList}

IMAGE ANALYSIS RULES:
- Screenshots show the real product interface — prioritize them
- Combine with brand photos for variety
- Read orientation: portrait images best for 1080x1920
- Never assign the same image to two scenes
- BANNER images (marked [banner]): set "image_type": "banner"`;
    } else {
      const brandAssets = getProjectAssets(project_dir);
      const assetList = formatAssetList(brandAssets);
      imageSourceSection = `
STEP 2 — Available brand images (with dimensions — study before assigning to scenes):
${assetList}

IMAGE ANALYSIS RULES (mandatory before building scene plan):
- Read each image's orientation: portrait images work best for 1080x1920 video (less crop needed)
- For landscape images in portrait video: the renderer will center-crop — plan text_overlay to avoid important image areas at the edges
- Choose images whose visual content matches the scene's emotional type:
  • hook scene → most dramatic/striking image
  • tension/problem → images showing effort, challenge, aspiration
  • solution/benefit → product, community, positive outcome images
  • cta → clearest, most inviting image — brand logo visible if possible
- Never assign the same image to two scenes
- Prefer portrait-oriented images for 1080x1920 format (they need less cropping)
- BANNER images (marked [banner] above): set "image_type": "banner" in the scene — renderer will only resize/letterbox, never crop or apply Ken Burns motion
- VIDEO CLIPS (marked [clip] above): set "image_type": "clip" in the scene — renderer uses clip directly as video input, no static image processing
- Raw photos (marked [raw]): set "image_type": "raw" — renderer will apply Ken Burns zoom/pan effects`;
    }

    const prompt = `You are the Video Ad Specialist. Follow the skill defined in skills/video-ad-specialist/SKILL.md for guidelines.

Task: Create scene plans for ${video_count} short-form video ads — "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

STEP 1 — Read brand knowledge:
- ${project_dir}/knowledge/brand_identity.md
- ${project_dir}/knowledge/product_campaign.md
- ${output_dir}/research_results.json (winning angles, hooks, audience insights)
${imageSourceSection}

STEP 3 — Video briefs:
${videoBriefsText}
${audioInstructions}
STEP 4 — For EACH video, create a scene plan JSON and save to ${output_dir}/video/${task_name}_video_0N_scene_plan.json:
{
  "titulo": "...",
  "video_length": 25,
  "format": "1080x1920",
  "audio": "${output_dir}/audio/${task_name}_video_0N_narration.mp3",
  "music": "${project_dir}/assets/music/background.mp3",
  "music_volume": 0.15,
  "narration_script": "full narration text (20-30 seconds of natural speech)...",
  "voice": "${job.data.narrator || 'rachel'}",
  "scenes": [
    {
      "id": "hook",
      "duration": 3,
      "type": "hook",
      "image": "<absolute path or null — use null when image_source is api>",
      "image_type": "raw",
      "image_crop_focus": "center-top",
      "image_prompt": "concise English visual description for this scene (max 200 chars) — only when image_source is api",
      "text_overlay": "Max 6 words here",
      "narration": "This scene's narration line"
    }
  ]
}

image_type: "raw" (default — can crop/zoom with Ken Burns) | "banner" (has embedded text — only resize, never crop) | "clip" (video file — use as video source)
image_crop_focus options: "center", "center-top", "center-bottom", "left", "right"
Use image_type from the asset list (shown as [banner], [clip], or [raw]). Never crop banners.
Use image_crop_focus to anchor the crop when image_type is "raw" and cropping is needed.

SCENE DESIGN RULES:
- text_overlay: MAX 6 words — short, punchy
- Scene flow: hook → tension → solution → social_proof → cta
- Each scene duration: hook 3s, middle 4-5s, CTA 4s
- Also generate the ElevenLabs audio BEFORE saving the scene plan so the "audio" path is valid

IMPORTANT: ONLY generate scene plans and audio. Do NOT run render-video-ffmpeg.js yet.
After saving all scene plans, print exactly: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;

    await runClaude(prompt, 'video_ad_specialist', output_dir, 900000);

    if (image_source === 'api') {
      const jobProvider = job.data.image_provider || imageProviderName;
      const imageProvider = getImageProvider(jobProvider);
      const genImage = imageProvider.generateImage;
      const model = job.data.image_model || process.env.KIE_DEFAULT_MODEL || defaultModel;
      const useBrand = job.data.use_brand_overlay !== false;
      const brand = useBrand ? readBrandContext(project_dir) : null;
      if (brand) log(output_dir, 'video_ad_specialist', `Brand context: ${brand.brandName} | provider: ${jobProvider}`);

      for (let i = 1; i <= video_count; i++) {
        const idx = String(i).padStart(2, '0');
        const planPath = path.resolve(projectRoot, output_dir, 'video', `video_${idx}_scene_plan.json`);
        if (!fs.existsSync(planPath)) continue;

        let plan;
        try { plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')); }
        catch (e) { log(output_dir, 'video_ad_specialist', `Could not parse scene plan ${idx}: ${e.message}`); continue; }

        const absImgsDir = path.resolve(projectRoot, output_dir, 'imgs');
        fs.mkdirSync(absImgsDir, { recursive: true });

        let planChanged = false;
        const total = plan.scenes.length;

        for (let s = 0; s < total; s++) {
          const scene = plan.scenes[s];
          if (!scene.image_prompt) continue;
          if (scene.image && fs.existsSync(scene.image)) continue;

          const filename = `${task_name}_video_${idx}_scene_${String(s + 1).padStart(2, '0')}_${scene.type || 'scene'}.jpg`;
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
          const rawPrompt = `${scene.image_prompt}. ${mood}. vertical 9:16.${colorHint} Cinematic lighting, photorealistic. No text, no words, no watermark, no logo.`;
          const finalPrompt = rawPrompt.length > 490 ? rawPrompt.slice(0, 487) + '...' : rawPrompt;

          log(output_dir, 'video_ad_specialist', `Generating image for video_${idx} scene ${s + 1}/${total} [${sceneType}]: ${scene.image_prompt.slice(0, 80)}`);
          try {
            await genImage(outputPath, finalPrompt, model, '9:16');
            scene.image = outputPath;
            scene.image_type = scene.image_type || 'raw';
            planChanged = true;
            process.stdout.write(`[STAGE2_IMAGE_READY] ${output_dir} ${outputPath}\n`);
            const promptTxt = outputPath.replace(/\.[^.]+$/, '_prompt.txt');
            fs.writeFileSync(promptTxt, finalPrompt, 'utf-8');
          } catch (err) {
            log(output_dir, 'video_ad_specialist', `Failed scene image ${s + 1}: ${err.message}`);
          }
        }

        if (planChanged) {
          fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
          log(output_dir, 'video_ad_specialist', `Updated scene plan with generated image paths: video_${idx}_scene_plan.json`);

          const promptsLog = plan.scenes
            .filter(sc => sc.image_prompt && sc.image)
            .map(sc => ({ prompt: sc.image_prompt, image: path.basename(sc.image) }));
          if (promptsLog.length > 0) {
            const promptsPath = path.join(absImgsDir, `${task_name}_video_${idx}_prompts.json`);
            fs.writeFileSync(promptsPath, JSON.stringify(promptsLog, null, 2), 'utf-8');
          }
        }
      }
    }

    const approvalPath = path.resolve(projectRoot, output_dir, 'video', 'approved.json');
    const rejectedPath = path.resolve(projectRoot, output_dir, 'video', 'rejected.json');

    log(output_dir, 'video_ad_specialist', '[VIDEO_APPROVAL_NEEDED] Waiting for user approval of scene plans (30 min timeout)...');
    process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
    fs.writeFileSync(path.resolve(projectRoot, output_dir, 'video', 'approval_needed.json'),
      JSON.stringify({ type: 'video', output_dir, ts: Date.now() }));

    const approved = await waitForFile(approvalPath, 1800000);
    if (!approved) {
      if (fs.existsSync(rejectedPath)) {
        log(output_dir, 'video_ad_specialist', 'User rejected the video plan. Skipping render.');
        return { status: 'skipped', reason: 'rejected by user' };
      }
      log(output_dir, 'video_ad_specialist', 'Approval timeout. Skipping video render.');
      return { status: 'skipped', reason: 'approval timeout' };
    }

    log(output_dir, 'video_ad_specialist', 'Running Motion Director to enrich scene plans...');
    await handleMotionDirector(output_dir, project_dir, video_count);

    log(output_dir, 'video_ad_specialist', 'Starting video render...');

    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const videoOutput = path.resolve(projectRoot, `${output_dir}/video/video_${idx}.mp4`);
      const scenePlan = `${output_dir}/video/video_${idx}_scene_plan.json`;
      const motionPlan = `${output_dir}/video/video_${idx}_scene_plan_motion.json`;
      const planToRender = fs.existsSync(path.resolve(projectRoot, motionPlan)) ? motionPlan : scenePlan;
      const absScenePlan = path.resolve(projectRoot, planToRender);

      if (!fs.existsSync(absScenePlan)) {
        log(output_dir, 'video_ad_specialist', `Scene plan not found for video ${i}, skipping render: ${absScenePlan}`);
        continue;
      }

      log(output_dir, 'video_ad_specialist', `Rendering video ${i}/${video_count} using: ${path.basename(planToRender)}`);
      try {
        execFileSync('node', [
          path.resolve(projectRoot, 'pipeline/render-video-ffmpeg.js'),
          planToRender,
          `${output_dir}/video/video_${idx}.mp4`,
        ], {
          cwd: projectRoot,
          stdio: 'pipe',
          timeout: 300000,
        });
        log(output_dir, 'video_ad_specialist', `Video ${i} rendered: ${videoOutput}`);
      } catch (renderErr) {
        log(output_dir, 'video_ad_specialist', `ffmpeg render ${i} failed: ${renderErr.message.slice(0, 200)}`);
      }
    }

    return { status: 'complete', output: `${output_dir}/video/` };
  }

  async function handleMotionDirector(outputDir, projectDir, videoCount) {
    const scenePlans = [];
    for (let i = 1; i <= videoCount; i++) {
      const idx = String(i).padStart(2, '0');
      const planPath = path.resolve(projectRoot, outputDir, 'video', `video_${idx}_scene_plan.json`);
      if (fs.existsSync(planPath)) scenePlans.push(`${outputDir}/video/video_${idx}_scene_plan.json`);
    }

    if (scenePlans.length === 0) {
      log(outputDir, 'motion_director', 'No scene plans found, skipping.');
      return;
    }

    const prompt = `You are the Motion Director. Follow the skill defined in skills/motion-director/SKILL.md exactly.

Project: ${projectDir}
Output dir: ${outputDir}

Scene plans to enrich:
${scenePlans.map((scenePlan, i) => `  ${i + 1}. ${scenePlan}`).join('\n')}

For each scene plan:
1. Read all reference files: skills/motion-director/cinematography-rules.md, layout-typography.md, pacing-by-mood.md, scene-type-presets.md
2. Read the scene plan JSON
3. Use the Read tool to view each image listed in the scenes
4. Read ${projectDir}/knowledge/brand_identity.md for brand mood and visual style
5. Produce the enriched scene plan with motion, text_layout and transition_out per scene
6. Save as video_0N_scene_plan_motion.json in the same folder

After saving all files, print exactly: [MOTION_PLAN_DONE] ${outputDir}`;

    await runClaude(prompt, 'motion_director', outputDir, 300000);
  }

  return {
    handleVideoQuick,
    handleVideoAdSpecialist,
    handleMotionDirector,
  };
}

module.exports = { createWorkerVideoHandlers };
