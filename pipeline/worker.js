/**
 * AI Content Pipeline Worker
 *
 * Processes jobs from the BullMQ queue. Each job invokes a Claude Code agent
 * via the `claude -p` CLI to execute the corresponding skill.
 *
 * Usage:
 *   node pipeline/worker.js
 */

const { Worker } = require('bullmq');
const { redisConnection } = require('./redis');
const { QUEUE_NAME } = require('./queues');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PROJECT_ROOT = path.resolve(__dirname, '..');
const { generateImage, AVAILABLE_MODELS } = require('./generate-image-kie');

// ── Asset discovery ────────────────────────────────────────────────────────────

/**
 * Returns image dimensions using ffprobe.
 */
function getImageDimensions(imagePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', imagePath,
    ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const info = JSON.parse(out.toString());
    const s = info.streams && info.streams[0];
    if (s && s.width && s.height) {
      const w = s.width, h = s.height;
      const ratio = w / h;
      const orientation = ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';
      return { width: w, height: h, orientation, ratio: ratio.toFixed(2) };
    }
  } catch {}
  return null;
}

/**
 * Returns a list of absolute paths for all brand images in a project.
 * Checks both `imgs/` and `assets/` directories.
 * Returns objects with path + dimensions metadata.
 */
function getProjectAssets(projectDir) {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const dirs = ['imgs', 'assets'];
  const files = [];

  for (const dir of dirs) {
    const fullDir = path.resolve(PROJECT_ROOT, projectDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const found = fs.readdirSync(fullDir)
      .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      .map(f => {
        const absPath = path.resolve(fullDir, f);
        const dims = getImageDimensions(absPath);
        return { path: absPath, ...dims };
      });
    files.push(...found);
  }

  return files;
}

/**
 * Formats asset list for inclusion in agent prompts.
 * Includes dimensions and orientation so the agent can make smart crop/composition decisions.
 */
function formatAssetList(assets) {
  if (!assets || assets.length === 0) return 'No brand assets found.';
  return assets.map(a => {
    const dimInfo = a.width
      ? `  [${a.width}×${a.height}, ${a.orientation}, ratio ${a.ratio}]`
      : '';
    return `  - ${a.path}${dimInfo}`;
  }).join('\n');
}

/**
 * Formats asset list returning only the path strings (backward compat).
 */
function assetPaths(assets) {
  return assets.map(a => a.path || a);
}

/**
 * Generates images via KIE API for use as assets in ad creatives / video.
 * Returns assets array (same format as getProjectAssets) pointing to downloaded files.
 *
 * @param {string} outputDir  - relative output dir (e.g. prj/inema/outputs/task_2026-03-27)
 * @param {string} model      - KIE model id (default: flux-kontext-pro)
 * @param {number} count      - number of images to generate
 * @param {string[]} formats  - ['carousel_1080x1080', 'story_1080x1920']
 * @param {string} brief      - campaign brief used to build prompts
 * @param {string} brandContext - brand identity summary for the prompt
 */
async function generateApiImages(outputDir, model = 'flux-kontext-pro', count = 5, formats = ['carousel_1080x1080'], brief = '', brandContext = '') {
  const absImgsDir = path.resolve(PROJECT_ROOT, outputDir, 'imgs');
  fs.mkdirSync(absImgsDir, { recursive: true });

  // Map format to KIE aspect ratio
  const formatToRatio = {
    'carousel_1080x1080': '1:1',
    'story_1080x1920': '9:16',
    'youtube_thumbnail': '16:9',
  };

  const assets = [];
  let imgIndex = 1;

  // Distribute images across formats
  const formatList = [];
  for (let i = 0; i < count; i++) {
    formatList.push(formats[i % formats.length]);
  }

  for (const fmt of formatList) {
    const ratio = formatToRatio[fmt] || '1:1';
    const ext = 'jpg';
    const filename = `generated_${String(imgIndex).padStart(2, '0')}_${fmt}.${ext}`;
    const outputPath = path.join(absImgsDir, filename);

    if (fs.existsSync(outputPath)) {
      log(outputDir, 'api_image_gen', `Image already exists, skipping: ${filename}`);
    } else {
      // Build a focused prompt from brief + brand context
      const prompt = buildImagePrompt(brief, brandContext, fmt, imgIndex, count);
      log(outputDir, 'api_image_gen', `Generating image ${imgIndex}/${count}: ${filename} (${model}, ${ratio})`);

      try {
        await generateImage(outputPath, prompt, model, ratio);
      } catch (err) {
        log(outputDir, 'api_image_gen', `Image ${imgIndex} generation failed: ${err.message}`);
        imgIndex++;
        continue;
      }
    }

    const dims = getImageDimensions(outputPath);
    assets.push({ path: outputPath, ...dims });
    imgIndex++;
  }

  return assets;
}

/**
 * Builds a descriptive image generation prompt for a marketing ad.
 */
function buildImagePrompt(brief, brandContext, format, index, total) {
  const isStory = format.includes('1920');
  const orientation = isStory ? 'vertical portrait' : 'square';
  const position = index === 1 ? 'opening hook' : index === total ? 'call to action' : `scene ${index} of ${total}`;

  return [
    `Professional marketing advertisement photo, ${orientation} format.`,
    brief ? `Campaign: ${brief.slice(0, 200)}` : '',
    brandContext ? `Brand: ${brandContext.slice(0, 150)}` : '',
    `Scene purpose: ${position}.`,
    'High quality, cinematic lighting, emotional and aspirational tone.',
    'No text, no logos, no watermarks.',
    'Suitable for social media advertising.',
  ].filter(Boolean).join(' ');
}

/**
 * Polls for a file to appear, up to timeoutMs. Returns true if found, false on timeout.
 */
async function waitForFile(filePath, timeoutMs = 1800000, intervalMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

// ── Claude CLI invocation ────────────────────────────────────────────────────

function runClaude(prompt, agentName, outputDir, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', 'sonnet',
    ];

    log(outputDir, agentName, `Invoking Claude CLI...`);

    const child = spawn('claude', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'], // detach stdin
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Claude CLI timed out for ${agentName} after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);

      if (stdout) {
        log(outputDir, agentName, `Claude output:\n${stdout}`);
      }
      if (stderr) {
        log(outputDir, agentName, `Claude stderr:\n${stderr}`);
      }

      if (code !== 0) {
        log(outputDir, agentName, `Claude CLI exited with code ${code}`);
        reject(new Error(`Claude CLI failed for ${agentName} (exit code ${code})`));
      } else {
        resolve(stdout);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      log(outputDir, agentName, `Claude CLI spawn error: ${err.message}`);
      reject(new Error(`Claude CLI spawn failed for ${agentName}: ${err.message}`));
    });
  });
}

// ── Agent Handlers ─────────────────────────────────────────────────────────────

async function handleResearchAgent(job) {
  const { task_name, task_date, output_dir, project_dir, platform_targets, language, campaign_brief, business } = job.data;
  const absOutputDir = path.resolve(PROJECT_ROOT, output_dir);
  fs.mkdirSync(absOutputDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: All output files (JSON values, Markdown, HTML text) MUST be written in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  const prompt = `You are the Marketing Research Agent. Follow the skill defined in skills/marketing-research-agent/SKILL.md exactly.

Task: Run market research for "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Output directory: ${output_dir}/
${langInstruction}${briefInstruction}

Read ${project_dir}/knowledge/brand_identity.md and ${project_dir}/knowledge/product_campaign.md for brand context.
Run the 5 Tavily searches using the tavily-search.js script (read .env for the API key).
Save these files to ${output_dir}/:
- research_results.json (structured JSON)
- research_brief.md (Markdown with Mermaid diagrams)
- interactive_report.html (Chart.js dashboard)

Focus the research on the campaign theme: "${task_name}".${business ? ` This is a ${business} campaign.` : ''}`;

  await runClaude(prompt, 'research_agent', output_dir);
  return { status: 'complete', output: `${output_dir}/research_results.json` };
}

async function handleAdCreativeDesigner(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    image_count = 1, image_formats = ['carousel_1080x1080'],
    image_source = 'brand',
  } = job.data;
  const absAdsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  fs.mkdirSync(absAdsDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: All text in the ads (headlines, subtext, CTAs) MUST be written in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Build image generation instructions
  const hasStories = image_formats.includes('story_1080x1920');
  const hasCarousel = image_formats.includes('carousel_1080x1080');

  let imageInstructions = '';
  if (hasCarousel && hasStories) {
    const carouselCount = Math.ceil(image_count * 0.6);
    const storyCount = image_count - carouselCount;
    imageInstructions = `
Generate ${image_count} total ad images:
- ${carouselCount} CAROUSEL slides (1080x1080) — saved as carousel_01.png, carousel_02.png, etc.
- ${storyCount} STORIES images (1080x1920) — saved as story_01.png, story_02.png, etc.

For EACH image:
1. Create a separate HTML file (carousel_01.html, story_01.html, etc.) with inline CSS
2. Use Playwright to screenshot it at the correct resolution (1080x1080 for carousel, 1080x1920 for stories)

Each slide/story must have a DIFFERENT visual concept and copy. The carousel should tell a progression:
- Slide 1: Hook (attention grabber)
- Slides 2-${carouselCount - 1}: Benefits, emotional moments, product features
- Slide ${carouselCount}: CTA

Stories should be vertical, bold, quick-read — one key message per story with large text.`;
  } else if (hasCarousel) {
    imageInstructions = `
Generate ${image_count} carousel slides (1080x1080) — saved as carousel_01.png through carousel_0${image_count}.png.
For EACH slide, create a separate HTML file and render via Playwright at 1080x1080.
Each slide must have different visual concept and copy, forming a narrative progression.`;
  } else {
    imageInstructions = `
Generate ${image_count} story images (1080x1920) — saved as story_01.png through story_0${image_count}.png.
For EACH story, create a separate HTML file and render via Playwright at 1080x1920.
Each story has one bold key message with large text.`;
  }

  const brandAssets = getProjectAssets(project_dir);
  const assetList = formatAssetList(brandAssets);

  // ── Pre-generate images via API if image_source === 'api' ──────────────────
  let apiGeneratedAssets = [];
  if (image_source === 'api') {
    const model = job.data.image_model || 'flux-kontext-pro';
    log(output_dir, 'ad_creative_designer', `Generating ${image_count} images via KIE API (${model})...`);
    try {
      apiGeneratedAssets = await generateApiImages(
        output_dir, model, image_count, image_formats, campaign_brief,
        '' // brand context will be read by agent from brand_identity.md
      );
      log(output_dir, 'ad_creative_designer', `Generated ${apiGeneratedAssets.length} images via API → ${output_dir}/imgs/`);
    } catch (err) {
      log(output_dir, 'ad_creative_designer', `API image generation failed: ${err.message}. Falling back to CSS-only layouts.`);
    }
  }

  // Build image source instructions based on image_source field
  let imageSourceSection = '';
  if (image_source === 'api') {
    if (apiGeneratedAssets.length > 0) {
      const generatedList = formatAssetList(apiGeneratedAssets);
      imageSourceSection = `
STEP 2 — AI-generated images (generated via KIE API — use these):
${generatedList}

These images were generated specifically for this campaign. Use them as <img src="file://<absolute_path>"> in your HTML.
Apply overlays, gradients, and text — the same way as brand images.`;
    } else {
      imageSourceSection = `
STEP 2 — Image source: CSS-only (API generation failed or unavailable)
- Use CSS gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
    }
  } else if (image_source === 'pexels') {
    const pexelsKey = process.env.PEXELS_API_KEY || '';
    imageSourceSection = `
STEP 2 — Image source: PEXELS STOCK PHOTOS
- Fetch relevant stock photos from Pexels API (key: ${pexelsKey})
- Use: https://api.pexels.com/v1/search?query=<theme>&per_page=5 with header Authorization: ${pexelsKey}
- Download the best photo to ${output_dir}/imgs/ and use as <img src="file://...">
- Choose photos that match the campaign emotional theme`;
  } else {
    // brand (default)
    imageSourceSection = `
STEP 2 — Available brand images (MANDATORY — use these real images):
${assetList}

CRITICAL IMAGE RULES:
- You MUST embed these brand images as <img src="file://<absolute_path>"> in your HTML
- Do NOT use solid colored boxes as backgrounds — use the real brand photos
- Choose the most contextually relevant image for each slide (different image per slide)
- Apply CSS: semi-transparent overlays, gradients, blur effects ON TOP of real images
- Text must be readable — use text-shadow, backdrop-filter blur, or dark overlay bands`;
  }

  const prompt = `You are the Ad Creative Designer. Follow the skill defined in skills/ad-creative-designer/SKILL.md for brand guidelines, but adapt the output format as instructed below.

Task: Create multiple static ad creatives for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

STEP 1 — Read brand knowledge FIRST (before designing anything):
- ${project_dir}/knowledge/brand_identity.md — extract: color palette, typography, tone, approved CTAs
- ${project_dir}/knowledge/product_campaign.md — extract: product features, campaign angles, assets described
- ${project_dir}/knowledge/platform_guidelines.md — extract: format requirements per platform
- ${output_dir}/research_results.json — extract: winning angles, emotional hooks, audience insights
${imageSourceSection}

STEP 3 — Generate ads:
${imageInstructions}

STEP 4 — Save ALL files to ${output_dir}/ads/:
- layout.json (metadata: filename, dimensions, concept, copy, images_used array)
- All HTML source files
- All PNG renders (via Playwright)

CRITICAL RENDER: Use Playwright (chromium) to render EVERY HTML to PNG:
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 }); // 1920 for stories
  await page.goto('file://' + path.resolve(htmlFilePath));
  await page.waitForTimeout(600); // let CSS animations settle
  await page.screenshot({ path: pngOutputPath });
  await browser.close();

━━━ VISUAL DESIGN STANDARDS (mandatory — this is the quality bar) ━━━

COMPOSITION & LAYOUT:
- Use the "Z-pattern" or "F-pattern" reading flow — place the most important element top-left or centered
- Breathing room: minimum 48px margin on all sides — never crowd the edges
- Visual weight: one dominant element per slide (headline OR image OR graphic) — not all at once
- Use the rule of thirds: position subject at intersection points, not dead center
- For carousels: each slide has ONE primary message — no information overload

TYPOGRAPHY (critical):
- Maximum 2 font sizes per slide: one for headline (80–120px), one for subtext (36–52px)
- Headlines: ALL CAPS or Title Case, never sentence case for impact
- Line height: 1.1–1.2 for headlines, 1.4–1.6 for body text
- Letter spacing: +0.02em to +0.08em for headlines — gives premium feel
- Hierarchy rule: headline → subtext → CTA — each 30–40% smaller than the previous
- NEVER use more than 8 words on a headline — if longer, split into headline + subtext

COLOR & CONTRAST:
- Text on image: ALWAYS use at least one of: dark scrim (rgba 0,0,0,0.5+), blur backdrop, gradient overlay, or solid color band
- Contrast ratio minimum: 4.5:1 for body text, 3:1 for large headlines (WCAG AA)
- Use brand accent color SPARINGLY — 1–2 elements max (CTA button, underline, badge)
- Gradient overlays: prefer bottom-to-top (text lives at bottom) or full-bleed subtle vignette

VISUAL EFFECTS (use inline CSS):
- Image treatment: mix of brightness(0.85) + contrast(1.1) + saturate(1.2) for punchy look
- Glassmorphism CTA button: background: rgba(255,255,255,0.15); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3)
- Text pop: text-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3)
- Subtle glow on CTA: box-shadow: 0 4px 24px rgba(<accent-color>, 0.5)
- Overlay gradient: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)

CSS ANIMATION (capture the "first-frame" of the animation for the screenshot):
- Headline: animate fade-up — transform: translateY(20px) → 0; opacity: 0 → 1
- CTA badge: animate scale-in — transform: scale(0.9) → 1; opacity: 0 → 1; delay 0.3s
- Set animation-fill-mode: both and animation-duration: 0.5s — Playwright captures at ~600ms, so they'll be fully visible

SLIDE-SPECIFIC ANGLES (for carousels):
- Slide 1 (Hook): Bold question or statement. Minimum text. Maximum visual impact.
- Middle slides: One benefit per slide. Human/emotional imagery if possible. Short copy.
- Last slide (CTA): Brand logo visible, CTA button prominent, URL/handle clear.

CTA BUTTON DESIGN:
- Pill shape: border-radius: 9999px
- Padding: 18px 48px
- Font: uppercase, letter-spacing: 0.1em, bold
- High contrast: brand accent fill or white fill with dark text
- Never just text — always a visible button container

Design quality bar:
- Each slide uses a DIFFERENT brand image — never repeat the same photo
- Brand color palette from brand_identity.md applied consistently
- Every slide looks like it belongs to the same campaign (visual cohesion)
- Campaign theme + emotional feeling present in every single image`;

  await runClaude(prompt, 'ad_creative_designer', output_dir, 900000); // 15 min for multiple images
  return { status: 'complete', output: `${output_dir}/ads/` };
}

async function handleVideoAdSpecialist(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    video_count = 1, video_briefs = [],
    image_source = 'brand',
  } = job.data;
  const absVideoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
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

  const audioInstructions = hasElevenLabs ? `
AUDIO NARRATION (ElevenLabs available):
- Write a narration script for each video (20-30 seconds of natural speech)
- Generate narration audio using: node pipeline/generate-audio.js <output.mp3> "<script>" [rachel|bella|antoni]
- Save audio as: ${output_dir}/audio/video_01_narration.mp3, video_02_narration.mp3, etc.
- Include the narration text in the scene plan under "narration_script"
- Include the audio path in the scene plan under "audio": "${output_dir}/audio/video_0N_narration.mp3"
- Recommended voices: rachel (warm/emotional), bella (clear/friendly), antoni (professional)
` : `
AUDIO: ElevenLabs not configured. Generate silent videos. Narration scripts only in scene plan.
`;

  // ── Pre-generate images via API if image_source === 'api' ──────────────────
  let apiGeneratedAssetsVideo = [];
  if (image_source === 'api') {
    const model = job.data.image_model || 'flux-kontext-pro';
    const videoImgCount = video_count * 5; // ~5 scenes per video
    log(output_dir, 'video_ad_specialist', `Generating ${videoImgCount} images via KIE API (${model}) for video scenes...`);
    try {
      apiGeneratedAssetsVideo = await generateApiImages(
        output_dir, model, videoImgCount, ['story_1080x1920'], campaign_brief, ''
      );
      log(output_dir, 'video_ad_specialist', `Generated ${apiGeneratedAssetsVideo.length} images → ${output_dir}/imgs/`);
    } catch (err) {
      log(output_dir, 'video_ad_specialist', `API image generation failed: ${err.message}.`);
    }
  }

  // ── Build image source section based on image_source ───────────────────────
  let imageSourceSection = '';
  if (image_source === 'api') {
    if (apiGeneratedAssetsVideo.length > 0) {
      const generatedList = formatAssetList(apiGeneratedAssetsVideo);
      imageSourceSection = `
STEP 2 — AI-generated images for video scenes (generated via KIE API):
${generatedList}

Use these images in scene "image" fields — same rules as brand images.
They were generated in 9:16 portrait format, ideal for 1080×1920 video.`;
    } else {
      imageSourceSection = `
STEP 2 — Image source: null (API generation failed)
- Set "image": null for all scenes
- Renderer will use dark solid background`;
    }
  } else if (image_source === 'pexels') {
    const pexelsKey = process.env.PEXELS_API_KEY || '';
    imageSourceSection = `
STEP 2 — Image source: PEXELS STOCK PHOTOS
- Fetch relevant stock photos from Pexels API before writing scene plans
- API key: ${pexelsKey}
- Search: GET https://api.pexels.com/v1/search?query=<theme>&per_page=10&orientation=portrait
  Header: Authorization: ${pexelsKey}
- Download the best matching photo for each scene to ${output_dir}/imgs/scene_0N.jpg
- Use the downloaded absolute path as the scene "image" field
- Choose photos that match the scene's emotional context (hook=dramatic, cta=warm/inviting)`;
  } else {
    // brand (default) — include metadata so agent can make smart decisions
    const brandAssets = getProjectAssets(project_dir);
    const assetList = formatAssetList(brandAssets);
    imageSourceSection = `
STEP 2 — Available brand images (with dimensions — study before assigning to scenes):
${assetList}

IMAGE ANALYSIS RULES (mandatory before building scene plan):
- Read each image's orientation: portrait images work best for 1080×1920 video (less crop needed)
- For landscape images in portrait video: the renderer will center-crop — plan text_overlay to avoid important image areas at the edges
- Choose images whose visual content matches the scene's emotional type:
  • hook scene → most dramatic/striking image
  • tension/problem → images showing effort, challenge, aspiration
  • solution/benefit → product, community, positive outcome images
  • cta → clearest, most inviting image — brand logo visible if possible
- Never assign the same image to two scenes
- Prefer portrait-oriented images for 1080×1920 format (they need less cropping)`;
  }

  // ── PHASE 1: Generate scene plans only (no rendering yet) ──────────────────
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
STEP 4 — For EACH video, create a scene plan JSON and save to ${output_dir}/video/video_0N_scene_plan.json:
{
  "titulo": "...",
  "video_length": 25,
  "format": "1080x1920",
  "audio": "${output_dir}/audio/video_0N_narration.mp3",
  "narration_script": "full narration text (20-30 seconds of natural speech)...",
  "voice": "rachel",
  "scenes": [
    {
      "id": "hook",
      "duration": 3,
      "type": "hook",
      "image": "<absolute path or null>",
      "image_crop_focus": "center-top",
      "text_overlay": "Max 6 words here",
      "narration": "This scene's narration line"
    }
  ]
}

image_crop_focus options: "center", "center-top", "center-bottom", "left", "right"
Use this to tell the renderer where to anchor the crop when the image needs to be cropped to fit.

SCENE DESIGN RULES:
- text_overlay: MAX 6 words — short, punchy
- Scene flow: hook → tension → solution → social_proof → cta
- Each scene duration: hook 3s, middle 4-5s, CTA 4s
- Also generate the ElevenLabs audio BEFORE saving the scene plan so the "audio" path is valid

IMPORTANT: ONLY generate scene plans and audio. Do NOT run render-video-ffmpeg.js yet.
After saving all scene plans, print exactly: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;

  await runClaude(prompt, 'video_ad_specialist', output_dir, 900000);

  // ── PHASE 2: Wait for user approval via file handshake ─────────────────────
  const approvalPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'approved.json');
  const rejectedPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'rejected.json');

  log(output_dir, 'video_ad_specialist', '[VIDEO_APPROVAL_NEEDED] Waiting for user approval of scene plans (30 min timeout)...');
  process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);

  const approved = await waitForFile(approvalPath, 1800000);
  if (!approved) {
    if (fs.existsSync(rejectedPath)) {
      log(output_dir, 'video_ad_specialist', 'User rejected the video plan. Skipping render.');
      return { status: 'skipped', reason: 'rejected by user' };
    }
    log(output_dir, 'video_ad_specialist', 'Approval timeout. Skipping video render.');
    return { status: 'skipped', reason: 'approval timeout' };
  }

  // ── PHASE 3: Render approved videos ────────────────────────────────────────
  log(output_dir, 'video_ad_specialist', 'User approved. Starting video render...');

  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    const videoOutput = path.resolve(PROJECT_ROOT, `${output_dir}/video/video_${idx}.mp4`);
    const scenePlan = `${output_dir}/video/video_${idx}_scene_plan.json`;
    const absScenePlan = path.resolve(PROJECT_ROOT, scenePlan);

    if (!fs.existsSync(absScenePlan)) {
      log(output_dir, 'video_ad_specialist', `Scene plan not found for video ${i}, skipping render: ${absScenePlan}`);
      continue;
    }

    log(output_dir, 'video_ad_specialist', `Rendering video ${i}/${video_count} with ffmpeg...`);
    try {
      execFileSync('node', [
        path.resolve(PROJECT_ROOT, 'pipeline/render-video-ffmpeg.js'),
        scenePlan,
        `${output_dir}/video/video_${idx}.mp4`,
      ], {
        cwd: PROJECT_ROOT,
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

async function handleCopywriterAgent(job) {
  const { task_name, task_date, output_dir, project_dir, platform_targets, language, campaign_brief } = job.data;
  const absCopyDir = path.resolve(PROJECT_ROOT, output_dir, 'copy');
  fs.mkdirSync(absCopyDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be written in Brazilian Portuguese (pt-BR). Hashtags in Portuguese. CTA in Portuguese.'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  const prompt = `You are the Copywriter Agent. Follow the skill defined in skills/copywriter-agent/SKILL.md exactly.

Task: Write platform-specific marketing copy for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

STEP 1 — Read brand knowledge FIRST:
- ${project_dir}/knowledge/brand_identity.md — extract: approved CTAs, hashtag strategy, brand voice, emojis to avoid
- ${project_dir}/knowledge/product_campaign.md — extract: product features, URLs, pricing, campaign angles
- ${project_dir}/knowledge/platform_guidelines.md — extract: platform-specific rules and format constraints
- ${output_dir}/research_results.json — extract: winning hooks, trending topics, audience language patterns

STEP 2 — Select ONE consistent campaign angle that:
- Aligns with the brand voice from brand_identity.md
- Uses the emotional hooks identified in the research
- Works across all platforms (adapt tone, not message)

STEP 3 — Write copy and save to ${output_dir}/copy/:
- instagram_caption.txt — hook + benefit + CTA + line break + 5-8 hashtags (use brand hashtag strategy)
- threads_post.txt — max 500 chars, brand tone, max 3 hashtags
- youtube_metadata.json — title (60-70 chars, no emojis), description (2-3 sentences + CTA), 6-8 tags
- copy_output.json — structured JSON with all platform copy, campaign_angle, and key_message
- carousel_captions.json — array of captions (one per slide, building a narrative arc)
- story_captions.json — array of short captions (one per story, bold and punchy)

QUALITY RULES:
- Use ONLY approved CTAs from brand_identity.md — do not invent new ones
- Use ONLY brand hashtags from brand_identity.md — no generic hashtags
- Match the exact brand voice (urgent, empowering, community-focused, practical)
- Every caption must have a clear hook in the first line`;

  await runClaude(prompt, 'copywriter_agent', output_dir);
  return { status: 'complete', output: `${output_dir}/copy/` };
}

async function handleDistributionAgent(job) {
  const { task_name, task_date, output_dir, project_dir, platform_targets, language } = job.data;

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: Write the Publish MD file in Brazilian Portuguese (pt-BR).'
    : '';

  const prompt = `You are the Distribution Agent. Follow the skill defined in skills/distribution-agent/SKILL.md exactly.

Task: Prepare distribution package for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Output directory: ${output_dir}/
${langInstruction}

Read ${project_dir}/knowledge/brand_identity.md and ${project_dir}/knowledge/platform_guidelines.md.

Steps:
1. Upload ALL media files (PNG, MP4) from ${output_dir}/ads/ and ${output_dir}/video/ to the Supabase "campaign-uploads" bucket using supabase-upload.js. Use filename convention: ${task_name}_${task_date}_<original_filename>. Save public URLs to ${output_dir}/media_urls.json.
2. Read copy outputs from ${output_dir}/copy/ (threads_post.txt, instagram_caption.txt, youtube_metadata.json, carousel_captions.json, story_captions.json).
3. Generate scheduling recommendations based on the research data.
4. Create the file: ${output_dir}/Publish ${task_name} ${task_date}.md — with:
   - Carousel post instructions (all slides + caption)
   - Stories posting order
   - Video posting metadata for each video
   - Threads post text
   - Scheduling recommendations
   - Publishing checklist

DO NOT publish to any platform. Only generate the Publish MD advisory file.`;

  await runClaude(prompt, 'distribution_agent', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/Publish ${task_name} ${task_date}.md` };
}

// ── Handler registry ────────────────────────────────────────────────────────────

const HANDLERS = {
  research_agent: handleResearchAgent,
  ad_creative_designer: handleAdCreativeDesigner,
  video_ad_specialist: handleVideoAdSpecialist,
  copywriter_agent: handleCopywriterAgent,
  distribution_agent: handleDistributionAgent,
};

// ── Logger ────────────────────────────────────────────────────────────────────

function log(outputDir, agentName, message) {
  const logDir = path.resolve(PROJECT_ROOT, outputDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${agentName}.log`);
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  fs.appendFileSync(logFile, entry);
  // Console log only the first line to keep output clean
  const firstLine = message.split('\n')[0];
  console.log(`  [${agentName}] ${firstLine}`);
}

// ── Dependency gate ──────────────────────────────────────────────────────────

async function waitForDependencies(job) {
  const deps = job.data.dependencies || [];
  if (deps.length === 0) return;

  const { Queue } = require('bullmq');
  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });

  log(job.data.output_dir, job.data.agent, `Waiting for dependencies: ${deps.join(', ')}`);

  const maxWait = 600000; // 10 minutes
  const pollInterval = 5000; // 5 seconds
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const completed = await queue.getCompleted();
    const completedAgents = completed.map(j => j.data.agent);
    const allDone = deps.every(dep => completedAgents.includes(dep));

    if (allDone) {
      log(job.data.output_dir, job.data.agent, 'All dependencies completed.');
      await queue.close();
      return;
    }

    // Check if any dependency failed
    const failed = await queue.getFailed();
    const failedAgents = failed.map(j => j.data.agent);
    const anyFailed = deps.some(dep => failedAgents.includes(dep));

    if (anyFailed) {
      await queue.close();
      throw new Error(`Dependency failed for ${job.data.agent}. Cannot proceed.`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  await queue.close();
  throw new Error(`Timeout waiting for dependencies: ${deps.join(', ')}`);
}

// ── Worker ────────────────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const agentName = job.data.agent;
    const handler = HANDLERS[agentName];

    if (!handler) {
      throw new Error(`No handler registered for agent: ${agentName}`);
    }

    // Wait for dependencies before running
    await waitForDependencies(job);

    await job.updateProgress(0);
    log(job.data.output_dir, agentName, `Starting ${agentName}...`);

    const result = await handler(job);
    await job.updateProgress(100);

    log(job.data.output_dir, agentName, `Completed successfully.`);
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 3,
  }
);

// ── Event listeners ───────────────────────────────────────────────────────────

worker.on('completed', (job, result) => {
  console.log(`\n✅ Job completed: ${job.data.agent} (ID: ${job.id})`);
  console.log(`   Output: ${result?.output || 'n/a'}`);
});

worker.on('failed', (job, err) => {
  console.error(`\n❌ Job failed: ${job?.data?.agent} (ID: ${job?.id})`);
  console.error(`   Error: ${err.message}`);
  if (job?.data?.output_dir) {
    log(job.data.output_dir, job.data.agent, `FAILED: ${err.message}`);
  }
});

worker.on('progress', (job, progress) => {
  console.log(`  ⏳ ${job.data.agent} — ${progress}% complete`);
});

console.log(`\n🔄 Worker started — listening on queue: "${QUEUE_NAME}"`);
console.log('   Agents will be invoked via Claude CLI (claude -p)');
console.log('   Press Ctrl+C to stop.\n');
