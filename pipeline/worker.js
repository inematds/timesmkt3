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
const { QUEUE_NAME, pipelineQueue } = require('./queues');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const PROJECT_ROOT = path.resolve(__dirname, '..');
const kieProvider = require('./generate-image-kie');
const pollinationsProvider = require('./generate-image-pollinations');

// Video renderer dispatcher — Remotion for Pro, ffmpeg for Quick (fallback)
const RENDER_FFMPEG = path.resolve(__dirname, 'render-video-ffmpeg.js');
const RENDER_REMOTION = path.resolve(__dirname, 'render-video-remotion.js');

function getVideoRenderer(mode = 'quick') {
  if (mode === 'pro') {
    // Check if Remotion is available
    const remotionDir = path.resolve(PROJECT_ROOT, 'remotion-ad');
    const remotionBin = path.join(remotionDir, 'node_modules', '.bin', 'remotion');
    if (fs.existsSync(remotionBin)) return RENDER_REMOTION;
    // Fallback to ffmpeg if Remotion not installed
    return RENDER_FFMPEG;
  }
  return RENDER_FFMPEG;
}

// Active provider — default KIE, switch to pollinations via IMAGE_PROVIDER env or job.data.image_provider
const IMAGE_PROVIDER = (process.env.IMAGE_PROVIDER || 'kie').toLowerCase();

// Free image provider — default pexels, configurable via FREE_IMAGE_PROVIDER env
const FREE_IMAGE_PROVIDER = (process.env.FREE_IMAGE_PROVIDER || 'pexels').toLowerCase();

function getImageProvider(jobProvider) {
  const p = (jobProvider || IMAGE_PROVIDER || 'kie').toLowerCase();
  if (p === 'pollinations') return pollinationsProvider;
  return kieProvider;
}

/**
 * Normalizes image_source aliases:
 *   marca → brand, pasta → folder, gratis → free
 * Returns { source, folder } where folder is only set for 'folder' source.
 */
function resolveImageSource(imageSource, imageFolder) {
  const aliases = { marca: 'brand', pasta: 'folder', gratis: 'free', captura: 'screenshot', capturas: 'screenshot' };
  const source = aliases[imageSource] || imageSource || 'brand';
  return { source, folder: source === 'folder' ? imageFolder : null };
}

/**
 * Returns the API key and provider name for free image sources.
 * Checks FREE_IMAGE_PROVIDER env, falls back to whatever key is available.
 */
function getFreeImageProvider() {
  const preferred = FREE_IMAGE_PROVIDER;
  const providers = {
    pexels:   { key: process.env.PEXELS_API_KEY,       name: 'Pexels',   searchUrl: 'https://api.pexels.com/v1/search', authHeader: 'Authorization' },
    unsplash: { key: process.env.UNSPLASH_ACCESS_KEY,   name: 'Unsplash', searchUrl: 'https://api.unsplash.com/search/photos', authHeader: 'Authorization' },
    pixabay:  { key: process.env.PIXABAY_API_KEY,       name: 'Pixabay',  searchUrl: 'https://pixabay.com/api/', authHeader: null },
  };

  // Try preferred first
  if (providers[preferred] && providers[preferred].key) return { ...providers[preferred], id: preferred };

  // Fallback: first available key
  for (const [id, p] of Object.entries(providers)) {
    if (p.key) return { ...p, id };
  }

  return null; // No free provider configured
}

/**
 * Loads assets from a user-specified folder path.
 * Supports absolute paths and paths relative to PROJECT_ROOT.
 */
function getFolderAssets(folderPath) {
  const absPath = path.isAbsolute(folderPath) ? folderPath : path.resolve(PROJECT_ROOT, folderPath);
  if (!fs.existsSync(absPath)) return [];

  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const videoExts = ['.mp4', '.mov', '.webm', '.avi'];
  const files = [];

  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // One level of recursion
      const subEntries = fs.readdirSync(path.join(absPath, entry.name), { withFileTypes: true });
      for (const sub of subEntries) {
        if (sub.isFile()) {
          const ext = path.extname(sub.name).toLowerCase();
          const fullPath = path.join(absPath, entry.name, sub.name);
          if (imageExts.includes(ext)) {
            const dims = getImageDimensions(fullPath);
            files.push({ path: fullPath, imageType: detectImageType(fullPath, dims), ...dims });
          } else if (videoExts.includes(ext)) {
            const dims = getImageDimensions(fullPath);
            files.push({ path: fullPath, imageType: 'clip', ...dims });
          }
        }
      }
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      const fullPath = path.join(absPath, entry.name);
      if (imageExts.includes(ext)) {
        const dims = getImageDimensions(fullPath);
        files.push({ path: fullPath, imageType: detectImageType(fullPath, dims), ...dims });
      } else if (videoExts.includes(ext)) {
        const dims = getImageDimensions(fullPath);
        files.push({ path: fullPath, imageType: 'clip', ...dims });
      }
    }
  }

  return files;
}

// Aliases used throughout file (KIE defaults; overridden per-job via getImageProvider)
const { buildImagePrompt, readBrandContext, DEFAULT_MODEL } = kieProvider;
const { generateImage } = kieProvider; // will be shadowed per call when provider differs

// ── Asset discovery ────────────────────────────────────────────────────────────

/**
 * Classifies an image as 'banner' or 'raw'.
 *
 * Banners (ads, posters, logos, flyers) have fixed composition with embedded text
 * and must NEVER be cropped — only resized/letterboxed.
 * Raw photos (product shots, lifestyle, stock photos without text) can be cropped and
 * used with Ken Burns motion effects.
 *
 * Detection strategy:
 *   1. Filename keywords → banner
 *   2. Aspect ratio extremes (very wide or very tall) → likely banner
 *   3. Default → raw
 */
function detectImageType(imagePath, dims) {
  const filename = path.basename(imagePath).toLowerCase();
  const dirParts = imagePath.replace(/\\/g, '/').split('/');

  // Any image inside a folder named "banners" is a banner
  if (dirParts.some(p => p.toLowerCase() === 'banners')) return 'banner';

  // Filename keywords → banner
  const bannerKeywords = ['banner', 'logo', 'promo', 'header', 'cover', 'overlay',
                          'poster', 'flyer', 'ad_', '_ad.', 'anuncio', 'capa', 'topo'];
  if (bannerKeywords.some(k => filename.includes(k))) return 'banner';

  // Very wide images (ratio > 2.5) are almost always banners
  if (dims && dims.ratio > 2.5) return 'banner';

  return 'raw';
}

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
  const videoExts = ['.mp4', '.mov', '.webm', '.avi'];
  // Scan these directories; for each, also recurse one level into subdirectories
  const dirs = ['imgs', 'assets'];
  const files = [];

  const scanDir = (fullDir) => {
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        // One level of recursion (e.g. imgs/banners/, imgs/clips/)
        scanDir(path.join(fullDir, entry.name));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const absPath = path.join(fullDir, entry.name);
        if (imageExts.includes(ext)) {
          const dims = getImageDimensions(absPath);
          const imageType = detectImageType(absPath, dims);
          files.push({ path: absPath, imageType, ...dims });
        } else if (videoExts.includes(ext)) {
          // Video clips — mark as 'clip', no Ken Burns, renderer uses as video source
          const dims = getImageDimensions(absPath); // ffprobe works on video too
          files.push({ path: absPath, imageType: 'clip', ...dims });
        }
      }
    }
  };

  for (const dir of dirs) {
    scanDir(path.resolve(PROJECT_ROOT, projectDir, dir));
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
      ? `  [${a.width}×${a.height}, ${a.orientation}, ratio ${a.ratio}, ${a.imageType || 'raw'}]`
      : `  [${a.imageType || 'raw'}]`;
    let typeNote = '';
    if (a.imageType === 'banner') typeNote = '  ⚠️ BANNER — do not crop, only resize/letterbox';
    else if (a.imageType === 'clip') typeNote = '  🎬 VIDEO CLIP — use directly as video source, no Ken Burns';
    return `  - ${a.path}${dimInfo}${typeNote}`;
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
 * @param {string} outputDir   - relative output dir
 * @param {string} projectDir  - project dir for reading brand_identity.md
 * @param {string} model       - model id (provider-specific)
 * @param {number} count       - number of images to generate
 * @param {string[]} formats   - ['carousel_1080x1080', 'story_1080x1920']
 * @param {string} brief       - campaign brief
 * @param {boolean} useBrandOverlay - whether to include brand visual identity in prompt
 * @param {string[]} scenePurposes  - optional array of scene types per image
 * @param {string[]} sceneDescriptions - optional per-scene visual descriptions (synchronized with script/narration)
 * @param {string} provider    - 'kie' (default) | 'pollinations'
 */
async function generateApiImages(outputDir, projectDir, model = DEFAULT_MODEL, count = 5, formats = ['carousel_1080x1080'], brief = '', useBrandOverlay = true, scenePurposes = [], sceneDescriptions = [], provider = IMAGE_PROVIDER) {
  const imageProvider = getImageProvider(provider);
  const genImage = imageProvider.generateImage;
  const absImgsDir = path.resolve(PROJECT_ROOT, outputDir, 'imgs');
  fs.mkdirSync(absImgsDir, { recursive: true });

  const formatToRatio = {
    'carousel_1080x1080': '1:1',
    'story_1080x1920':    '9:16',
    'reels_1080x1920':    '9:16',
    'youtube_thumbnail':  '16:9',
  };

  // Read brand context from brand_identity.md
  const brand = useBrandOverlay ? readBrandContext(projectDir) : null;
  if (brand) {
    log(outputDir, 'api_image_gen', `Brand context loaded: ${brand.brandName} | colors: ${brand.colors.join(', ')}`);
  }

  const defaultSceneOrder = ['hook', 'tension', 'solution', 'social_proof', 'cta'];
  const assets = [];
  let imgIndex = 1;

  const formatList = [];
  for (let i = 0; i < count; i++) formatList.push(formats[i % formats.length]);

  // Pre-generate ALL prompts and save as individual _prompt.txt files before calling API
  const allPrompts = [];
  for (let pi = 0; pi < formatList.length; pi++) {
    const fmt = formatList[pi];
    const ratio = formatToRatio[fmt] || '1:1';
    const taskPrefix = path.basename(outputDir);
    const filename = `${taskPrefix}_generated_${String(pi + 1).padStart(2, '0')}_${fmt}.jpg`;
    const sceneType = scenePurposes[pi] || defaultSceneOrder[pi % defaultSceneOrder.length];
    const sceneDesc = sceneDescriptions[pi] || '';
    const prompt = buildImagePrompt(brief, brand, fmt, pi + 1, count, sceneType, sceneDesc, model);
    allPrompts.push({ index: pi + 1, filename, format: fmt, ratio, sceneType, prompt });
    // Save individual prompt file
    const promptTxtPath = path.join(absImgsDir, filename.replace(/\.[^.]+$/, '_prompt.txt'));
    fs.writeFileSync(promptTxtPath, prompt);
  }
  log(outputDir, 'api_image_gen', `All ${allPrompts.length} prompts saved as _prompt.txt files`);

  for (const fmt of formatList) {
    const ratio = formatToRatio[fmt] || '1:1';
    const taskPrefix = path.basename(outputDir);
    const filename = `${taskPrefix}_generated_${String(imgIndex).padStart(2, '0')}_${fmt}.jpg`;
    const outputPath = path.join(absImgsDir, filename);
    const sceneType = scenePurposes[imgIndex - 1] || defaultSceneOrder[(imgIndex - 1) % defaultSceneOrder.length];
    const sceneDesc = sceneDescriptions[imgIndex - 1] || '';

    if (fs.existsSync(outputPath)) {
      log(outputDir, 'api_image_gen', `Already exists, skipping: ${filename}`);
    } else {
      const prompt = allPrompts[imgIndex - 1].prompt;
      log(outputDir, 'api_image_gen', `Generating ${imgIndex}/${count}: ${filename} [${sceneType}] (${provider}/${model}, ${ratio})`);
      log(outputDir, 'api_image_gen', `Prompt: ${prompt.slice(0, 200)}`);

      try {
        await genImage(outputPath, prompt, model, ratio);
        // Signal bot: image ready — bot sends it live to the chat
        process.stdout.write(`[STAGE2_IMAGE_READY] ${outputDir} ${outputPath}\n`);
      } catch (err) {
        log(outputDir, 'api_image_gen', `Failed image ${imgIndex}: ${err.message}`);
        imgIndex++;
        continue;
      }
    }

    const dims = getImageDimensions(outputPath);
    assets.push({ path: outputPath, sceneType, ...dims });
    imgIndex++;
  }

  // If no images were generated at all, signal bot and wait for decision
  if (assets.length === 0) {
    const lastError = fs.readFileSync
      ? (() => {
          try {
            const logPath = path.resolve(PROJECT_ROOT, outputDir, 'logs', 'api_image_gen.log');
            const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
            const failLine = [...lines].reverse().find(l => l.includes('Failed image'));
            return failLine ? failLine.replace(/.*Failed image \d+: /, '') : 'Todas as imagens falharam';
          } catch { return 'Todas as imagens falharam'; }
        })()
      : 'Todas as imagens falharam';

    process.stdout.write(`[IMAGE_GEN_ERROR] ${outputDir} ${lastError}\n`);
    log(outputDir, 'api_image_gen', `[IMAGE_GEN_ERROR] emitted — waiting for user decision...`);

    const decisionPath = path.resolve(PROJECT_ROOT, outputDir, 'imgs', 'error_decision.json');
    const decided = await waitForFile(decisionPath, 600000);
    if (!decided) throw new Error('Timeout aguardando decisão do usuário sobre erro de imagens');

    const decision = JSON.parse(fs.readFileSync(decisionPath, 'utf-8'));
    fs.unlinkSync(decisionPath);

    if (decision.action === 'cancel') throw new Error('Geração de imagens cancelada pelo usuário');
    if (decision.action === 'retry') {
      log(outputDir, 'api_image_gen', 'Retrying image generation by user request...');
      return generateApiImages(outputDir, projectDir, model, count, formats, brief, useBrandOverlay, scenePurposes);
    }
    if (decision.action === 'change_source') {
      log(outputDir, 'api_image_gen', `Changing image source to: ${decision.image_source}`);
      // Signal the worker to use a different source — write source override file
      const overridePath = path.resolve(PROJECT_ROOT, outputDir, 'imgs', 'source_override.json');
      fs.writeFileSync(overridePath, JSON.stringify({ image_source: decision.image_source, image_folder: decision.image_folder || null }));
      // Return empty — the ad_creative_designer will pick up brand/free assets instead
      return [];
    }
    // action === 'advance' — continue without images (CSS-only fallback)
    log(outputDir, 'api_image_gen', 'Advancing without images by user request.');
  }

  return assets;
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

function runClaude(prompt, agentName, outputDir, timeoutMs = 600000, { model = 'sonnet' } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', model,
      '--no-session-persistence',   // don't save session to disk (lighter, no stale sessions)
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

async function handleCreativeDirector(job) {
  const { task_name, task_date, output_dir, project_dir, platform_targets, language, campaign_brief } = job.data;
  const absCreativeDir = path.resolve(PROJECT_ROOT, output_dir, 'creative');
  fs.mkdirSync(absCreativeDir, { recursive: true });

  const lang = language || 'pt-BR';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: Write ALL outputs (creative_brief.json values, creative_brief.md) in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief from user: ${campaign_brief}`
    : '';

  const prompt = `You are the Creative Director. Follow the skill defined in skills/creative-director/SKILL.md exactly.

Task: Create the Creative Brief for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
Output directory: ${output_dir}/creative/
${langInstruction}${briefInstruction}

Read these files FIRST:
- ${project_dir}/knowledge/brand_identity.md
- ${project_dir}/knowledge/product_campaign.md
- ${output_dir}/research_results.json

Then follow the SKILL.md process exactly:
1. Analyze research — identify top 3 angles
2. Filter through brand identity
3. Choose ONE angle with justification
4. Define visual direction
5. Write key messages per platform
6. Set guardrails (what to avoid)

Save to ${output_dir}/creative/:
- creative_brief.json
- creative_brief.md

After saving, print exactly: [STAGE1_DONE] ${output_dir}`;

  await runClaude(prompt, 'creative_director', output_dir, 600000);

  // Emit stage signal to bot's stdout listener
  process.stdout.write(`[STAGE1_DONE] ${output_dir}\n`);

  // Write signal file for bot restart recovery
  const signalFile = path.resolve(PROJECT_ROOT, output_dir, 'creative', 'stage1_done.json');
  if (!fs.existsSync(signalFile)) {
    fs.writeFileSync(signalFile, JSON.stringify({ stage: 1, output_dir, ts: Date.now() }));
  }

  return { status: 'complete', output: `${output_dir}/creative/creative_brief.md` };
}

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
    image_source: rawImageSource = 'brand',
    image_folder = null,
  } = job.data;
  const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
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

  // All filenames MUST start with task_name for uniqueness
  const fnPrefix = task_name;

  let imageInstructions = '';
  if (hasCarousel && hasStories) {
    const carouselCount = Math.ceil(image_count * 0.6);
    const storyCount = image_count - carouselCount;
    imageInstructions = `
Generate ${image_count} total ad images:
- ${carouselCount} CAROUSEL slides (1080x1080) — saved as ${fnPrefix}_carousel_01.png, ${fnPrefix}_carousel_02.png, etc.
- ${storyCount} STORIES images (1080x1920) — saved as ${fnPrefix}_story_01.png, ${fnPrefix}_story_02.png, etc.

For EACH image:
1. Create a separate HTML file (${fnPrefix}_carousel_01.html, ${fnPrefix}_story_01.html, etc.) with inline CSS
2. Use Playwright to screenshot it at the correct resolution (1080x1080 for carousel, 1080x1920 for stories)

CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.

Each slide/story must have a DIFFERENT visual concept and copy. The carousel should tell a progression:
- Slide 1: Hook (attention grabber)
- Slides 2-${carouselCount - 1}: Benefits, emotional moments, product features
- Slide ${carouselCount}: CTA

Stories should be vertical, bold, quick-read — one key message per story with large text.`;
  } else if (hasCarousel) {
    imageInstructions = `
Generate ${image_count} carousel slides (1080x1080) — saved as ${fnPrefix}_carousel_01.png through ${fnPrefix}_carousel_0${image_count}.png.
For EACH slide, create a separate HTML file and render via Playwright at 1080x1080.
CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.
Each slide must have different visual concept and copy, forming a narrative progression.`;
  } else {
    imageInstructions = `
Generate ${image_count} story images (1080x1920) — saved as ${fnPrefix}_story_01.png through ${fnPrefix}_story_0${image_count}.png.
For EACH story, create a separate HTML file and render via Playwright at 1080x1920.
CRITICAL: ALL filenames MUST start with "${fnPrefix}_" prefix.
Each story has one bold key message with large text.`;
  }

  // ── Resolve image source ──────────────────────────────────────────────────
  const providerName = job.data.image_provider || IMAGE_PROVIDER;

  // ── Pre-generate images via API if image_source === 'api' ──────────────────
  let apiGeneratedAssets = [];
  if (image_source === 'api') {
    const model = job.data.image_model || process.env.KIE_DEFAULT_MODEL || DEFAULT_MODEL;
    const useBrand = job.data.use_brand_overlay !== false;

    // Read creative_brief.json for per-slide visual descriptions
    let scenePurposes = [];
    let sceneDescriptions = [];
    const briefPath = path.resolve(PROJECT_ROOT, output_dir, 'creative', 'creative_brief.json');
    if (fs.existsSync(briefPath)) {
      try {
        const brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8'));
        // Extract visual descriptions from carousel_structure or photography_style
        if (brief.carousel_structure) {
          const slideKeys = Object.keys(brief.carousel_structure)
            .filter(k => k.startsWith('slide_'))
            .sort();
          sceneDescriptions = slideKeys.map(k => brief.carousel_structure[k].conceito_visual || '');
          scenePurposes = slideKeys.map(k => {
            const tema = (brief.carousel_structure[k].tema || '').toLowerCase();
            if (tema.includes('hook')) return 'hook';
            if (tema.includes('cta')) return 'cta';
            return 'solution';
          });
        }
        // Fallback: generate varied ENGLISH descriptions when no carousel_structure
        if (sceneDescriptions.filter(Boolean).length === 0) {
          const metaphor = brief.visual_direction?.key_visual_metaphor || '';
          const mood = brief.visual_direction?.mood || '';

          // Each slide gets a UNIQUE visual concept — different subject, angle, environment
          const slideTemplates = [
            { purpose: 'hook', desc: `${metaphor || 'leader commanding technology'}. low angle dramatic shot, strong silhouette, dark futuristic background, blue accent lighting, cinematic wide` },
            { purpose: 'solution', desc: `close-up hands on tablet with AI workflow on screen, warm side lighting, shallow depth of field, modern office, professional atmosphere` },
            { purpose: 'solution', desc: `diverse team collaborating around holographic display, aerial view, ${mood || 'premium dark'} environment, multiple screens, dynamic composition` },
            { purpose: 'social_proof', desc: `community gathering in modern auditorium, faces lit by screens, warm golden hour light, sense of belonging, wide shot with depth` },
            { purpose: 'cta', desc: `clean minimalist composition, brand logo space, premium dark background with subtle gradient, inviting atmosphere, centered framing` },
          ];

          sceneDescriptions = [];
          scenePurposes = [];
          for (let si = 0; si < image_count; si++) {
            const tmpl = slideTemplates[si % slideTemplates.length];
            sceneDescriptions.push(tmpl.desc.slice(0, 250));
            scenePurposes.push(tmpl.purpose);
          }
          log(output_dir, 'ad_creative_designer', `Fallback: generated ${sceneDescriptions.length} varied English descriptions`);
        }
        log(output_dir, 'ad_creative_designer', `Creative brief loaded: ${sceneDescriptions.length} visual descriptions`);
      } catch (e) {
        log(output_dir, 'ad_creative_designer', `Could not parse creative_brief.json: ${e.message}`);
      }
    }

    log(output_dir, 'ad_creative_designer', `Generating ${image_count} images via ${providerName} (${model}, brand=${useBrand})...`);
    try {
      apiGeneratedAssets = await generateApiImages(
        output_dir, project_dir, model, image_count, image_formats, campaign_brief, useBrand,
        scenePurposes, sceneDescriptions, providerName
      );
      log(output_dir, 'ad_creative_designer', `Generated ${apiGeneratedAssets.length} images → ${output_dir}/imgs/`);
    } catch (err) {
      log(output_dir, 'ad_creative_designer', `API image generation failed: ${err.message}. Falling back to CSS-only layouts.`);
    }

    // Signal bot to show generated images for approval before proceeding
    if (apiGeneratedAssets.length > 0) {
      const approvalPath = path.resolve(PROJECT_ROOT, output_dir, 'imgs', 'approved.json');
      const rejectedPath = path.resolve(PROJECT_ROOT, output_dir, 'imgs', 'rejected.json');
      process.stdout.write(`[IMAGE_APPROVAL_NEEDED] ${output_dir}\n`);
      log(output_dir, 'ad_creative_designer', '[IMAGE_APPROVAL_NEEDED] Waiting for user to approve generated images...');
      fs.writeFileSync(path.resolve(PROJECT_ROOT, output_dir, 'imgs', 'approval_needed.json'),
        JSON.stringify({ type: 'images', output_dir, ts: Date.now() }));

      const imgApproved = await waitForFile(approvalPath, 1800000);
      if (!imgApproved) {
        if (fs.existsSync(rejectedPath)) {
          log(output_dir, 'ad_creative_designer', 'User rejected generated images. Stopping.');
          return { status: 'skipped', reason: 'images rejected' };
        }
        log(output_dir, 'ad_creative_designer', 'Image approval timeout. Proceeding anyway.');
      } else {
        log(output_dir, 'ad_creative_designer', 'Images approved. Proceeding to creative assembly.');
      }
    }
  }

  // ── Build image source instructions ────────────────────────────────────────
  let imageSourceSection = '';
  if (image_source === 'api') {
    if (apiGeneratedAssets.length > 0) {
      const generatedList = formatAssetList(apiGeneratedAssets);
      imageSourceSection = `
STEP 2 — AI-generated images (generated via ${providerName} API — use these):
${generatedList}

These images were generated specifically for this campaign. Use them as <img src="file://<absolute_path>"> in your HTML.
Apply overlays, gradients, and text — the same way as brand images.`;
    } else {
      imageSourceSection = `
STEP 2 — Image source: CSS-only (API generation failed or unavailable)
- Use CSS gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
    }
  } else if (image_source === 'free') {
    const freeProvider = getFreeImageProvider();
    if (freeProvider) {
      const authNote = freeProvider.authHeader
        ? `Header: ${freeProvider.authHeader}: ${freeProvider.key}`
        : `Parameter: key=${freeProvider.key}`;
      imageSourceSection = `
STEP 2 — Image source: ${freeProvider.name.toUpperCase()} (free stock photos)
- Search: GET ${freeProvider.searchUrl}?query=<theme>&per_page=5
  ${authNote}
- Download the best photos to ${output_dir}/imgs/ and use as <img src="file://...">
- Choose photos that match the campaign emotional theme
- If a photo has visible text or watermarks, set image_type: "banner" (no cropping)`;
    } else {
      imageSourceSection = `
STEP 2 — Image source: CSS-only (no free image provider configured — set PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, or PIXABAY_API_KEY in .env)
- Use CSS gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
    }
  } else if (image_source === 'folder') {
    const folderAssets = imageFolder ? getFolderAssets(imageFolder) : [];
    const folderList = formatAssetList(folderAssets);
    if (folderAssets.length > 0) {
      imageSourceSection = `
STEP 2 ��� Images from user-specified folder (MANDATORY — use these):
${folderList}

CRITICAL IMAGE RULES:
- Embed these images as <img src="file://<absolute_path>"> in your HTML
- Choose the most contextually relevant image for each slide (different image per slide)
- Apply CSS: semi-transparent overlays, gradients, blur effects ON TOP of real images
- Text must be readable — use text-shadow, backdrop-filter blur, or dark overlay bands
- BANNER images (marked [banner]): use object-fit: contain, never cover
- VIDEO CLIPS (marked [clip]): reference in layout.json, do NOT embed in HTML`;
    } else {
      imageSourceSection = `
STEP 2 — Image source: folder "${imageFolder || '(not specified)'}" — no images found
- Falling back to CSS-only: gradients, bold typography, and geometric shapes
- No <img> tags — pure HTML/CSS visual design`;
    }
  } else if (image_source === 'screenshot') {
    const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');
    const briefPath = path.resolve(PROJECT_ROOT, output_dir, 'creative', 'creative_brief.json');
    const researchPath = path.resolve(PROJECT_ROOT, output_dir, 'research_results.json');
    const productPath = path.resolve(PROJECT_ROOT, project_dir, 'knowledge', 'product_campaign.md');
    const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
    const explicitUrls = job.data.screenshot_urls || [];
    const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
    log(output_dir, 'ad_creative_designer', `Capturing screenshots from ${allUrls.length} URLs...`);
    const screenshotAssets = await captureScreenshots(allUrls, path.resolve(PROJECT_ROOT, output_dir));
    const brandAssets = getProjectAssets(project_dir);
    const combinedAssets = [...screenshotAssets, ...brandAssets];
    const assetList = formatAssetList(combinedAssets);
    imageSourceSection = `
STEP 2 — Screenshots + brand images (${screenshotAssets.length} screenshots + ${brandAssets.length} brand):
${assetList}

CRITICAL IMAGE RULES:
- Embed as <img src="file://<absolute_path>"> in your HTML
- Screenshots show the real product interface — prioritize them
- Combine with brand photos for variety
- Apply CSS overlays, gradients, blur for text readability
- BANNER images (marked [banner]): use object-fit: contain, never cover`;
  } else {
    // brand (default)
    const brandAssets = getProjectAssets(project_dir);
    const assetList = formatAssetList(brandAssets);
    imageSourceSection = `
STEP 2 — Available brand images (MANDATORY — use these real images):
${assetList}

CRITICAL IMAGE RULES:
- You MUST embed these brand images as <img src="file://<absolute_path>"> in your HTML
- Do NOT use solid colored boxes as backgrounds — use the real brand photos
- Choose the most contextually relevant image for each slide (different image per slide)
- Apply CSS: semi-transparent overlays, gradients, blur effects ON TOP of real images
- Text must be readable — use text-shadow, backdrop-filter blur, or dark overlay bands
- BANNER images (marked [banner] in the list): use object-fit: contain, never object-fit: cover — the full image must be visible, no cropping
- VIDEO CLIPS (marked [clip] in the list): reference the clip path in layout.json but do NOT embed in HTML — note it for the Distribution Agent`;
  }

  const prompt = `You are the Ad Creative Designer. Your role is PURELY VISUAL — you design and render ad images. You do NOT write copy.

Follow the skill defined in skills/ad-creative-designer/SKILL.md for brand guidelines, but adapt the output format as instructed below.

Task: Create multiple static ad creatives for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
${langInstruction}${briefInstruction}

STEP 1 — Read ALL inputs FIRST (before designing anything):
- ${output_dir}/creative/creative_brief.json — campaign angle, emotional hook, visual direction (mood, colors, photography style, typography mood), approved CTAs
- ${output_dir}/copy/narrative.json — MANDATORY: the campaign narrative with headlines, carousel_texts, story_texts, key_phrases, and approved CTAs. This is your text source.
- ${project_dir}/knowledge/brand_identity.md — color palette, typography, tone
- ${project_dir}/knowledge/product_campaign.md — product features, assets described
- ${project_dir}/knowledge/platform_guidelines.md — format requirements per platform
- skills/typography-on-image/SKILL.md — CRITICAL: text positioning, font sizing, contrast rules, and legibility over images

COPY RULE: You MUST use the text from narrative.json. Do NOT invent headlines, subtext, or CTAs.
- For carousel slides: read narrative.json → carousel_texts (one entry per slide)
- For stories: read narrative.json → story_texts (one entry per story)
- Headlines: read narrative.json → headlines
- CTAs: use ONLY narrative.json → approved_ctas
- If narrative.json is missing, fall back to creative_brief.json → key_messages
${imageSourceSection}

STEP 3 — Design and render ads:
${imageInstructions}

STEP 4 — Save ALL files to ${output_dir}/ads/:
- layout.json (metadata: filename, dimensions, concept, copy_source, images_used array)
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
- Maximum 2 font sizes per slide: one for headline (80-120px), one for subtext (36-52px)
- Headlines: ALL CAPS or Title Case, never sentence case for impact
- Line height: 1.1-1.2 for headlines, 1.4-1.6 for body text
- Letter spacing: +0.02em to +0.08em for headlines — gives premium feel
- Hierarchy rule: headline > subtext > CTA — each 30-40% smaller than the previous
- NEVER use more than 8 words on a headline — if longer, split into headline + subtext

COLOR & CONTRAST:
- Text on image: ALWAYS use at least one of: dark scrim (rgba 0,0,0,0.5+), blur backdrop, gradient overlay, or solid color band
- Contrast ratio minimum: 4.5:1 for body text, 3:1 for large headlines (WCAG AA)
- Use brand accent color SPARINGLY — 1-2 elements max (CTA button, underline, badge)
- Gradient overlays: prefer bottom-to-top (text lives at bottom) or full-bleed subtle vignette

VISUAL EFFECTS (use inline CSS):
- Image treatment: mix of brightness(0.85) + contrast(1.1) + saturate(1.2) for punchy look
- Glassmorphism CTA button: background: rgba(255,255,255,0.15); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.3)
- Text pop: text-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.3)
- Subtle glow on CTA: box-shadow: 0 4px 24px rgba(<accent-color>, 0.5)
- Overlay gradient: linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)

CSS ANIMATION (capture the "first-frame" of the animation for the screenshot):
- Headline: animate fade-up — transform: translateY(20px) > 0; opacity: 0 > 1
- CTA badge: animate scale-in — transform: scale(0.9) > 1; opacity: 0 > 1; delay 0.3s
- Set animation-fill-mode: both and animation-duration: 0.5s — Playwright captures at ~600ms, so they'll be fully visible

SLIDE-SPECIFIC DESIGN (for carousels):
- Slide 1 (Hook): Maximum visual impact. Bold treatment of the hook caption.
- Middle slides: One benefit per slide. Human/emotional imagery if possible.
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

  // ── Post-render: validate aspect ratios ──────────────────────────────────
  if (fs.existsSync(absAdsDir)) {
    const pngFiles = fs.readdirSync(absAdsDir).filter(f => f.endsWith('.png'));
    for (const f of pngFiles) {
      const dims = getImageDimensions(path.join(absAdsDir, f));
      if (!dims) continue;
      const ratio = parseFloat(dims.ratio);
      const isCarousel = f.includes('carousel');
      const isStory = f.includes('story') || f.includes('reel');

      if (isCarousel && (ratio < 0.85 || ratio > 1.15)) {
        log(output_dir, 'ad_creative_designer', `WARN: ${f} is ${dims.width}x${dims.height} (ratio ${dims.ratio}) — expected 1:1 for carousel. Cropping...`);
        const fullPath = path.join(absAdsDir, f);
        const tmpPath = fullPath + '.tmp.png';
        try {
          execFileSync('ffmpeg', ['-y', '-i', fullPath, '-vf', 'crop=min(iw\\,ih):min(iw\\,ih)', tmpPath],
            { stdio: 'pipe', timeout: 15000 });
          fs.renameSync(tmpPath, fullPath);
          log(output_dir, 'ad_creative_designer', `Cropped ${f} to 1:1`);
        } catch (e) {
          log(output_dir, 'ad_creative_designer', `Failed to crop ${f}: ${e.message.slice(0, 100)}`);
          try { fs.unlinkSync(tmpPath); } catch {}
        }
      }

      if (isStory && (ratio > 0.65 || ratio < 0.45)) {
        log(output_dir, 'ad_creative_designer', `WARN: ${f} is ${dims.width}x${dims.height} (ratio ${dims.ratio}) — expected 9:16 for story`);
      }
    }
  }

  return { status: 'complete', output: `${output_dir}/ads/` };
}

// ── Video Quick — slideshow simples com imagens do Designer ──────────────────

async function handleVideoQuick(job) {
  const {
    task_name, task_date, output_dir, project_dir,
    language, campaign_brief,
    video_count = 1,
  } = job.data;
  const absVideoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  fs.mkdirSync(absVideoDir, { recursive: true });

  // Skip if already completed (rerun optimization) — check with glob since filenames have timestamps
  if (job.data.skip_completed) {
    const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
    const hasQuick = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some(f => f.startsWith(`${task_name}_quick_`) && f.endsWith('.mp4'));
    const legacyVideo = path.resolve(PROJECT_ROOT, output_dir, 'video', `${task_name}_video_01.mp4`);
    if (hasQuick || fs.existsSync(legacyVideo)) {
      log(output_dir, 'video_quick', `Skipping — video already exists`);
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

  // Discover images from ads/ (produced by Ad Creative Designer in stage 2)
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const adImages = fs.existsSync(adsDir)
    ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).map(f => path.join(adsDir, f))
    : [];
  const adImageList = adImages.length > 0
    ? adImages.map(f => `  - ${f}`).join('\n')
    : '  (no images found in ads/)';

  // Check for narration capability
  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

  // Check for background music (music/ → audio/ → assets/ fallback)
  const _mDirs = [
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'music'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'audio'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets'),
  ];
  let musicFiles = [];
  for (const _md of _mDirs) {
    if (fs.existsSync(_md)) {
      const _mf = fs.readdirSync(_md).filter(f => /\.(mp3|wav|aac|m4a)$/i.test(f) && !f.includes('narration'));
      if (_mf.length > 0) { musicFiles = _mf.map(f => path.relative(PROJECT_ROOT, path.join(_md, f))); break; }
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
- text_position: ALWAYS "top" — NEVER "bottom" or "center"
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

  // ── Approval gate ──────────────────────────────────────────────────────────
  const approvalPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'approved.json');
  const rejectedPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'rejected.json');

  log(output_dir, 'video_quick', '[VIDEO_APPROVAL_NEEDED] Waiting for approval (30 min timeout)...');
  process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
  fs.writeFileSync(path.resolve(PROJECT_ROOT, output_dir, 'video', 'approval_needed.json'),
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

  // ── Render ─────────────────────────────────────────────────────────────────
  log(output_dir, 'video_quick', 'Rendering video(s)...');

  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    // Try prefixed name first, fallback to unprefixed for backward compat
    let planPath = path.resolve(PROJECT_ROOT, output_dir, 'video', `${task_name}_video_${idx}_scene_plan.json`);
    if (!fs.existsSync(planPath)) planPath = path.resolve(PROJECT_ROOT, output_dir, 'video', `video_${idx}_scene_plan.json`);
    if (!fs.existsSync(planPath)) {
      log(output_dir, 'video_quick', `Scene plan not found: video_${idx}, skipping.`);
      continue;
    }

    const ts = videoTimestamp();
    const videoOutput = path.resolve(PROJECT_ROOT, output_dir, 'video', `${task_name}_quick_${idx}_${ts}.mp4`);
    backupIfExists(videoOutput);

    // Inject image_bg_mode from payload into scene plan (dark = default, blur = option)
    if (job.data.image_bg_mode) {
      try {
        const planData = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
        planData.image_bg_mode = job.data.image_bg_mode;
        fs.writeFileSync(planPath, JSON.stringify(planData, null, 2));
      } catch {}
    }

    log(output_dir, 'video_quick', `Rendering video ${i}/${video_count}...`);

    try {
      const renderScript = path.resolve(PROJECT_ROOT, 'pipeline', 'render-video-ffmpeg.js');
      require('child_process').execFileSync('node', [renderScript, planPath, videoOutput], {
        cwd: PROJECT_ROOT,
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

// ── Video Ad Specialist (legacy — kept for backward compat) ──────────────────

async function handleVideoAdSpecialist(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    video_count = 1, video_briefs = [],
    image_source: rawImageSource = 'brand',
    image_folder = null,
  } = job.data;
  const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
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

  // Check for background music files in project assets (music/ or audio/)
  const musicDirs = [
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'music'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'audio'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets'),
  ];
  let musicFiles = [];
  for (const mdir of musicDirs) {
    if (fs.existsSync(mdir)) {
      const found = fs.readdirSync(mdir).filter(f => /\.(mp3|wav|aac|m4a)$/i.test(f) && !f.includes('narration'));
      if (found.length > 0) {
        musicFiles = found.map(f => path.relative(PROJECT_ROOT, path.join(mdir, f)));
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

  // ── Build image source section based on image_source ───────────────────────
  // NOTE: for 'api' mode, images are generated AFTER the scene plan is written
  // so that each scene's image_prompt drives generation (sync script ↔ image)
  const providerNameVideo = job.data.image_provider || IMAGE_PROVIDER;
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
    const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');
    const briefPath = path.resolve(PROJECT_ROOT, output_dir, 'creative', 'creative_brief.json');
    const researchPath = path.resolve(PROJECT_ROOT, output_dir, 'research_results.json');
    const productPath = path.resolve(PROJECT_ROOT, project_dir, 'knowledge', 'product_campaign.md');
    const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
    const explicitUrls = job.data.screenshot_urls || [];
    const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
    log(output_dir, 'video_quick', `Capturing screenshots from ${allUrls.length} URLs...`);
    const screenshotAssets = await captureScreenshots(allUrls, path.resolve(PROJECT_ROOT, output_dir));
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
    // brand (default) — include metadata so agent can make smart decisions
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

  // ── PHASE 1.5: Post-generation — generate per-scene images from image_prompt ─
  // Only when image_source === 'api'. Images are generated here (AFTER scene plan)
  // so each scene's image_prompt (derived from its narration/purpose) drives generation.
  if (image_source === 'api') {
    const jobProvider = job.data.image_provider || IMAGE_PROVIDER;
    const imageProvider = getImageProvider(jobProvider);
    const genImage = imageProvider.generateImage;
    const model = job.data.image_model || process.env.KIE_DEFAULT_MODEL || DEFAULT_MODEL;
    const useBrand = job.data.use_brand_overlay !== false;
    const brand = useBrand ? readBrandContext(project_dir) : null;
    if (brand) log(output_dir, 'video_ad_specialist', `Brand context: ${brand.brandName} | provider: ${jobProvider}`);

    for (let i = 1; i <= video_count; i++) {
      const idx = String(i).padStart(2, '0');
      const planPath = path.resolve(PROJECT_ROOT, output_dir, 'video', `video_${idx}_scene_plan.json`);
      if (!fs.existsSync(planPath)) continue;

      let plan;
      try { plan = JSON.parse(fs.readFileSync(planPath, 'utf-8')); }
      catch (e) { log(output_dir, 'video_ad_specialist', `Could not parse scene plan ${idx}: ${e.message}`); continue; }

      const absImgsDir = path.resolve(PROJECT_ROOT, output_dir, 'imgs');
      fs.mkdirSync(absImgsDir, { recursive: true });

      let planChanged = false;
      const total = plan.scenes.length;

      for (let s = 0; s < total; s++) {
        const scene = plan.scenes[s];
        if (!scene.image_prompt) continue; // skip scenes without explicit prompt
        if (scene.image && fs.existsSync(scene.image)) continue; // already has image

        const filename = `${task_name}_video_${idx}_scene_${String(s + 1).padStart(2, '0')}_${scene.type || 'scene'}.jpg`;
        const outputPath = path.join(absImgsDir, filename);
        const sceneType = scene.type || scene.id || 'solution';
        const colorHint = brand?.colors?.length ? ` Colors: ${brand.colors.slice(0, 2).join(', ')}.` : '';
        // Build final prompt: scene description + mood + brand colors + restrictions
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
          // Save prompt alongside image
          const promptTxt = outputPath.replace(/\.[^.]+$/, '_prompt.txt');
          fs.writeFileSync(promptTxt, finalPrompt, 'utf-8');
        } catch (err) {
          log(output_dir, 'video_ad_specialist', `Failed scene image ${s + 1}: ${err.message}`);
        }
      }

      if (planChanged) {
        fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
        log(output_dir, 'video_ad_specialist', `Updated scene plan with generated image paths: video_${idx}_scene_plan.json`);

        // Save prompts alongside images
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

  // ── PHASE 2: Wait for user approval via file handshake ─────────────────────
  const approvalPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'approved.json');
  const rejectedPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'rejected.json');

  log(output_dir, 'video_ad_specialist', '[VIDEO_APPROVAL_NEEDED] Waiting for user approval of scene plans (30 min timeout)...');
  process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
  // Write signal file so bot can re-detect after restart
  fs.writeFileSync(path.resolve(PROJECT_ROOT, output_dir, 'video', 'approval_needed.json'),
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

  // ── PHASE 3: Motion Director — enrich scene plans before render ────────────
  log(output_dir, 'video_ad_specialist', 'Running Motion Director to enrich scene plans...');
  await handleMotionDirector(output_dir, project_dir, video_count);

  // ── PHASE 4: Render approved videos ────────────────────────────────────────
  log(output_dir, 'video_ad_specialist', 'Starting video render...');

  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    const videoOutput = path.resolve(PROJECT_ROOT, `${output_dir}/video/video_${idx}.mp4`);
    const scenePlan = `${output_dir}/video/video_${idx}_scene_plan.json`;
    const motionPlan = `${output_dir}/video/video_${idx}_scene_plan_motion.json`;

    // Use motion-enriched plan if Motion Director produced one, else fall back to original
    const planToRender = fs.existsSync(path.resolve(PROJECT_ROOT, motionPlan)) ? motionPlan : scenePlan;
    const absScenePlan = path.resolve(PROJECT_ROOT, planToRender);

    if (!fs.existsSync(absScenePlan)) {
      log(output_dir, 'video_ad_specialist', `Scene plan not found for video ${i}, skipping render: ${absScenePlan}`);
      continue;
    }

    log(output_dir, 'video_ad_specialist', `Rendering video ${i}/${video_count} using: ${path.basename(planToRender)}`);
    try {
      execFileSync('node', [
        path.resolve(PROJECT_ROOT, 'pipeline/render-video-ffmpeg.js'),
        planToRender,
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

// ── Motion Director ────────────────────────────────────────────────────────────

async function handleMotionDirector(outputDir, projectDir, videoCount) {
  const scenePlans = [];
  for (let i = 1; i <= videoCount; i++) {
    const idx = String(i).padStart(2, '0');
    const planPath = path.resolve(PROJECT_ROOT, outputDir, 'video', `video_${idx}_scene_plan.json`);
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
${scenePlans.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

For each scene plan:
1. Read all reference files: skills/motion-director/cinematography-rules.md, layout-typography.md, pacing-by-mood.md, scene-type-presets.md
2. Read the scene plan JSON
3. Use the Read tool to view each image listed in the scenes
4. Read ${projectDir}/knowledge/brand_identity.md for brand mood and visual style
5. Produce the enriched scene plan with motion, text_layout and transition_out per scene
6. Save as ${task_name}_video_0N_scene_plan_motion.json in the same folder

After saving all files, print exactly: [MOTION_PLAN_DONE] ${outputDir}`;

  await runClaude(prompt, 'motion_director', outputDir, 300000);
}

// ── Video Pro (Diretor de Edição — produção profissional) ─────────────────

async function handleVideoPro(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    video_count = 1, video_briefs = [],
    image_source: rawImageSource = 'brand',
    image_folder = null,
  } = job.data;
  const { source: image_source, folder: imageFolder } = resolveImageSource(rawImageSource, image_folder);
  const absVideoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');

  // Helper: prefixed video filename with backward-compat fallback for reading
  const vf = (idx, suffix) => `${task_name}_video_${idx}${suffix}`;
  const vfFind = (idx, suffix) => {
    const prefixed = path.resolve(PROJECT_ROOT, output_dir, 'video', vf(idx, suffix));
    if (fs.existsSync(prefixed)) return prefixed;
    const legacy = path.resolve(PROJECT_ROOT, output_dir, 'video', `video_${idx}${suffix}`);
    if (fs.existsSync(legacy)) return legacy;
    return prefixed;
  };
  fs.mkdirSync(absVideoDir, { recursive: true });

  // Skip if already completed (rerun optimization) — check with glob since filenames have timestamps
  if (job.data.skip_completed) {
    const hasPro = fs.existsSync(absVideoDir) && fs.readdirSync(absVideoDir).some(f => f.startsWith(`${task_name}_pro_`) && f.endsWith('.mp4'));
    if (hasPro) {
      log(output_dir, 'video_pro', `Skipping — final video already exists`);
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

  const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;

  const videoBriefsText = video_briefs.length > 0
    ? video_briefs.map((b, i) => `  ${i + 1}. ${b}`).join('\n')
    : Array.from({ length: video_count }, (_, i) =>
        `  ${i + 1}. Video ${i + 1} — 60 seconds, professional edit with 30-50 rapid cuts`
      ).join('\n');

  // Check for background music (music/ → audio/ → assets/ fallback)
  const _mDirs = [
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'music'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets', 'audio'),
    path.resolve(PROJECT_ROOT, project_dir, 'assets'),
  ];
  let musicFiles = [];
  for (const _md of _mDirs) {
    if (fs.existsSync(_md)) {
      const _mf = fs.readdirSync(_md).filter(f => /\.(mp3|wav|aac|m4a)$/i.test(f) && !f.includes('narration'));
      if (_mf.length > 0) { musicFiles = _mf.map(f => path.relative(PROJECT_ROOT, path.join(_md, f))); break; }
    }
  }
  // If no local music, try Freesound API
  if (musicFiles.length === 0 && process.env.FREESOUND_API_KEY) {
    log(output_dir, 'video_pro', 'No local music found — searching Freesound...');
    try {
      const { searchMusic, downloadPreview } = require('./search-music-freesound');
      const briefText = job.data.campaign_brief || task_name;
      const moodKeywords = briefText.includes('tech') || briefText.includes('ia') ? 'ambient electronic' : 'corporate background';
      const sound = await searchMusic(moodKeywords, '', 30, 120);
      if (sound) {
        const audioDir = path.resolve(PROJECT_ROOT, output_dir, 'audio');
        const musicPath = await downloadPreview(sound, audioDir);
        if (musicPath) {
          musicFiles = [path.relative(PROJECT_ROOT, musicPath)];
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
- Write a narration script (50-60 seconds of natural speech for 60s videos)
- Generate narration: node pipeline/generate-audio.js <output.mp3> "<script>" [rachel|bella|domi|antoni|josh|arnold]
- Save as: ${output_dir}/audio/${task_name}_video_0N_narration.mp3
- Recommended voices: rachel (warm/emotional), bella (clear/friendly), domi (confident), antoni (professional), josh (deep/warm), arnold (bold/energetic)
${musicInstructions}` : `
AUDIO: ElevenLabs not configured. Generate silent videos. Narration scripts only.
${musicInstructions}`;

  // Image source section
  const providerNameEditor = job.data.image_provider || IMAGE_PROVIDER;
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
    // Capture screenshots from URLs in brief/research/payload
    const { captureScreenshots, extractUrlsFromFiles } = require('./capture-screenshots');
    const briefPath = path.resolve(PROJECT_ROOT, output_dir, 'creative', 'creative_brief.json');
    const researchPath = path.resolve(PROJECT_ROOT, output_dir, 'research_results.json');
    const productPath = path.resolve(PROJECT_ROOT, project_dir, 'knowledge', 'product_campaign.md');
    const extractedUrls = extractUrlsFromFiles([briefPath, researchPath, productPath]);
    const explicitUrls = job.data.screenshot_urls || [];
    const allUrls = [...new Set([...explicitUrls, ...extractedUrls])];
    log(output_dir, 'video_pro', `Capturing screenshots from ${allUrls.length} URLs: ${allUrls.join(', ')}`);
    const screenshotAssets = await captureScreenshots(allUrls, path.resolve(PROJECT_ROOT, output_dir));
    // Also include brand assets alongside screenshots
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
    // brand (default)
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

  // ── PHASE 1: Narration (Sonnet — fast) ───────────────────────────────────────
  // Check if narration already exists (rerun optimization)
  const absAudioDir = path.resolve(PROJECT_ROOT, output_dir, 'audio');
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

  // ── PHASE 1.5: Analyze narration audio timing ─────────────────────────────
  log(output_dir, 'video_pro', 'Phase 1.5: Analyzing narration audio timing...');

  const narrationFiles = [];
  const narrationTimings = [];
  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    const narPath = `${output_dir}/audio/${task_name}_video_${idx}_narration.mp3`;
    const absNarPath = path.resolve(PROJECT_ROOT, narPath);
    if (!fs.existsSync(absNarPath)) continue;
    narrationFiles.push(narPath);

    // Get exact audio duration via ffprobe
    let audioDuration = 0;
    try {
      const probe = execFileSync('ffprobe', [
        '-v', 'quiet', '-show_entries', 'format=duration',
        '-of', 'csv=p=0', absNarPath
      ], { encoding: 'utf-8', timeout: 10000 }).trim();
      audioDuration = parseFloat(probe) || 0;
      log(output_dir, 'video_pro', `Audio ${idx} duration: ${audioDuration.toFixed(1)}s`);
    } catch (e) {
      log(output_dir, 'video_pro', `ffprobe failed for ${narPath}: ${e.message.slice(0, 100)}`);
    }

    // Try to load existing timing file first (survives reruns)
    const timingPath = path.resolve(PROJECT_ROOT, output_dir, 'audio', `${task_name}_video_${idx}_timing.json`);
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

    // Read the narration script from the log (Phase 1 output)
    let narrationScript = '';
    try {
      const proLog = fs.readFileSync(path.resolve(PROJECT_ROOT, output_dir, 'logs', 'video_pro.log'), 'utf-8');
      const scriptMatch = proLog.match(/Script utilizado.*?\n\n?>\s*\*?"?([\s\S]*?)\*?"?\n\n/);
      if (scriptMatch) narrationScript = scriptMatch[1].replace(/\*/g, '').trim();
    } catch {}

    // Split script into sentences and calculate proportional timing
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

      // Save timing file for reference
      fs.writeFileSync(timingPath, JSON.stringify({ audioDuration, totalWords, segments }, null, 2));
      log(output_dir, 'video_pro', `Audio timing: ${segments.length} segments, ${totalWords} words in ${audioDuration.toFixed(1)}s`);
    } else if (audioDuration > 0) {
      // Fallback: no script found, but we have audio duration — push minimal timing so videoDur adjusts
      narrationTimings.push({ video: idx, audioDuration, totalWords: 0, segments: [] });
      log(output_dir, 'video_pro', `Audio timing (duration only, no script): ${audioDuration.toFixed(1)}s`);
    }
  }

  // Build timing info for the scene plan prompt
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

  // ── PHASE 1.6: Photography Director ─────────────────────────────────────────
  // photo_quality: 'premium' = Opus + lê arquivos (mais criativo, ~5-8min)
  //                'simples' = Sonnet + arquivos injetados (rápido, ~1-2min)
  const photoQuality = job.data.photo_quality || 'simples';
  const photoplanPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'photography_plan.json');
  if (!fs.existsSync(photoplanPath)) {
    const photoModel = photoQuality === 'premium' ? 'opus' : 'sonnet';
    const photoLabel = photoQuality === 'premium' ? 'Premium/Opus' : 'Simples/Sonnet';
    log(output_dir, 'video_pro', `Phase 1.6: Photography Director (${photoLabel})...`);
    process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} photography_director\n`);

    // Build prioritized image list for Photography Director
    // Video Pro does NOT use ads/ (carousel images) — those are for static ads.
    // Only uses: imgs/ (API-generated raw images) and assets/ (brand).
    // Exception: user can pass pro_image_dir to include a specific directory.
    const absImgsDir2 = path.resolve(PROJECT_ROOT, output_dir, 'imgs');
    const absAssetsDir = path.resolve(PROJECT_ROOT, project_dir, 'assets');
    const proImageDir = job.data.pro_image_dir ? path.resolve(PROJECT_ROOT, job.data.pro_image_dir) : null;
    const imgExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const listImages = (dir, label) => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir)
        .filter(f => imgExts.includes(path.extname(f).toLowerCase()))
        .map(f => `  - ${path.relative(PROJECT_ROOT, path.join(dir, f))} [${label}]`);
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
      // ── PREMIUM: Opus lê todos os arquivos via tool calls (mais criativo) ──
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
      // ── SIMPLES: Sonnet com arquivos essenciais injetados no prompt ─────────
      const readFileCompact = (filePath) => {
        const abs = path.resolve(PROJECT_ROOT, filePath);
        if (!fs.existsSync(abs)) return '(arquivo não encontrado)';
        return fs.readFileSync(abs, 'utf-8').slice(0, 4000);
      };
      const brandIdentity = readFileCompact(`${project_dir}/knowledge/brand_identity.md`);
      const creativeBrief = readFileCompact(`${output_dir}/creative/creative_brief.json`);
      // style-dictionary: compact to essential fields
      let styleDict = '';
      try {
        const sd = JSON.parse(fs.readFileSync(path.resolve(PROJECT_ROOT, 'skills/video-engineering/style-dictionary.json'), 'utf-8'));
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
7. Text position: ONLY "top" or "center". NEVER "bottom"
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

  // Extend lock after photography director
  await job.extendLock(job.token, 900000).catch(() => {});

  // Read photography plan for scene plan prompt
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

Shots (${(photoPlan.shots || []).length} defined):
${(photoPlan.shots || []).slice(0, 10).map(s => `  ${s.timing}: ${s.framing} + ${s.motion} | "${(s.text_overlay || '').slice(0, 30)}" | img: ${(s.image_prompt || '').slice(0, 50)}`).join('\n')}
${(photoPlan.shots || []).length > 10 ? `  ... (${photoPlan.shots.length} total — read the full file)` : ''}

CRITICAL: You MUST follow the Photography Director's decisions. Do NOT override style, framing, motion, or color choices. Your job is ONLY to create the edit timeline (scene plan) using these visual decisions.
Read the full photography_plan.json for all shots.`;
    } catch (e) {
      log(output_dir, 'video_pro', `Could not parse photography_plan.json: ${e.message}`);
    }
  }

  // ── PHASE 2: Scene Plan ─────────────────────────────────────────────────────
  // scene_quality: 'premium' = Opus + prompt extenso + lê arquivos (~5-8min)
  //                'simples' = Sonnet + photography plan injetado (~1-2min)
  const sceneQuality = job.data.scene_quality || 'simples';
  const sceneModel = sceneQuality === 'premium' ? 'opus' : 'sonnet';
  const sceneLabel = sceneQuality === 'premium' ? 'Premium/Opus' : 'Simples/Sonnet';
  log(output_dir, 'video_pro', `Phase 2: Creating scene plan (${sceneLabel})...`);

  // Read photography plan and compact it (used by both modes)
  let photoPlanContent = '';
  const photoPlanPath2 = path.resolve(PROJECT_ROOT, output_dir, 'video', 'photography_plan.json');
  if (fs.existsSync(photoPlanPath2)) {
    try {
      const fullPlan = JSON.parse(fs.readFileSync(photoPlanPath2, 'utf-8'));
      // Compact: keep only essential fields to reduce prompt size (14KB → 4KB)
      const compact = {
        style_preset: fullPlan.style_preset,
        color_palette: fullPlan.color_palette,
        video_length: fullPlan.video_length || job.data.video_duration || 60,
        typography: fullPlan.typography,
        shots: (fullPlan.shots || []).map(s => ({
          timing: s.timing,
          start_s: s.start_time,
          end_s: s.end_time,
          dur: s.duration,
          image: s.image || s.image_file,
          has_text: s.image_has_text || false,
          framing: s.framing,
          motion: s.motion,
          text: s.text_overlay,
          section: s.section,
        })),
      };
      photoPlanContent = JSON.stringify(compact, null, 2);
    } catch {
      photoPlanContent = fs.readFileSync(photoPlanPath2, 'utf-8');
    }
  }

  // Video duration = audio duration + 3s (breathing room at end), or payload override
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
    // ── PREMIUM: Opus lê arquivos + prompt extenso com todas as regras ────
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
- text_layout.position: "top" is the DEFAULT for all scenes. "center" ONLY for hooks and CTA final (max 3 scenes total). NEVER "bottom"
- text_layout.font_size: hook 120-140px, headlines 96-120px, body 80-96px. NEVER below 80px
- text_layout.font_weight: 900 for headlines, 700 for body
- text_layout.font_family: "Lora" or "DM Serif Display" (DEFAULT — editorial serif), "Oswald" or "Bebas Neue" ONLY for hooks (max 2-3 scenes), "Montserrat" for data/numbers
- text_layout.line_height: 1.0 for tight headlines, 1.15 for body
- text_layout.color: "#FFFFFF" on dark overlays, "#0D0D0D" on light — NEVER gray
- Every scene with text MUST have text_layout with ALL fields (font_size, font_weight, font_family, position, color, line_height)

GLOBAL VIDEO SETTINGS — include these top-level fields in the scene plan JSON:
- "color_grading": { "gamma": 1.05, "saturate": 1.1, "contrast": 1.15, "hueRotate": 10 } — unified color across ALL scenes ("same camera, same day")
- "film_grain": { "intensity": 0.03, "monochromatic": true, "lightLeak": false } — cinematic grain + light leaks
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
    // ── SIMPLES: Sonnet com photography plan injetado + prompt compacto ───
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
  "film_grain": { "intensity": 0.03, "monochromatic": true, "lightLeak": false },
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
- position "top" is DEFAULT. "center" ONLY for hooks/CTA (max 3 scenes). NEVER "bottom"
- font_family: "Lora"/"DM Serif Display" default. "Oswald"/"Bebas Neue" only for hooks (max 2-3)
- Never same motion 2x in row. font_size ≥60px
- Last 3s = silent closing shot with URL/logo (narration: "")

Save to: ${output_dir}/video/${task_name}_video_0N_scene_plan_motion.json
Then print: [VIDEO_APPROVAL_NEEDED] ${output_dir}`;
  }

  const sceneTimeout = sceneQuality === 'premium' ? 900000 : 600000;
  await runClaude(scenePlanPrompt, 'video_pro', output_dir, sceneTimeout, { model: sceneModel });

  // Extend lock after each heavy phase to prevent BullMQ stall
  await job.extendLock(job.token, 900000).catch(() => {});

  // ── PHASE 1.5: Draft render (optional — only when video_draft: true) ────────
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
        const draftPlanPath = path.resolve(PROJECT_ROOT, output_dir, 'video', vf(idx, '_draft.json'));
        fs.writeFileSync(draftPlanPath, JSON.stringify(draftPlan, null, 2));

        const draftOutput = path.resolve(PROJECT_ROOT, output_dir, 'video', vf(idx, '_draft.mp4'));
        try {
          execFileSync('node', [
            RENDER_FFMPEG,
            `${output_dir}/video/${vf(idx, '_draft.json')}`,
            `${output_dir}/video/${vf(idx, '_draft.mp4')}`,
          ], { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 300000 });
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

  // Extend lock before image generation
  await job.extendLock(job.token, 900000).catch(() => {});

  // ── PHASE 2: Generate real images (API mode) ───────────────────────────────
  process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} images_start\n`);
  if (image_source === 'api') {
    const jobProvider = job.data.image_provider || IMAGE_PROVIDER;
    const imageProvider = getImageProvider(jobProvider);
    const genImage = imageProvider.generateImage;
    const model = job.data.image_model || process.env.KIE_DEFAULT_MODEL || DEFAULT_MODEL;
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

      const absImgsDir = path.resolve(PROJECT_ROOT, output_dir, 'imgs');
      fs.mkdirSync(absImgsDir, { recursive: true });

      // Deduplicate image_prompts — generate once, reuse across cuts
      const promptMap = new Map(); // prompt → generated path
      let planChanged = false;

      for (let s = 0; s < plan.scenes.length; s++) {
        const scene = plan.scenes[s];
        if (!scene.image_prompt) continue;
        if (scene.image && fs.existsSync(scene.image)) continue;

        // Check if we already generated this prompt
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
          // Save prompt as .txt alongside the image
          const promptTxtPath = outputPath.replace(/\.[^.]+$/, '_prompt.txt');
          fs.writeFileSync(promptTxtPath, finalPrompt, 'utf-8');
        } catch (err) {
          log(output_dir, 'video_pro', `Failed image gen: ${err.message}`);
        }
      }

      // Map all scenes sharing the same prompt to the generated path
      if (planChanged) {
        for (const scene of plan.scenes) {
          if (scene.image_prompt && !scene.image && promptMap.has(scene.image_prompt)) {
            scene.image = promptMap.get(scene.image_prompt);
          }
        }
        fs.writeFileSync(planPath, JSON.stringify(plan, null, 2), 'utf-8');
        log(output_dir, 'video_pro', `Updated plan with ${promptMap.size} unique images for ${plan.scenes.length} cuts`);

        // Save prompts alongside images for reference
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

  // ── PHASE 2b: Validate and auto-fix ─────────────────────────────────────────
  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    const planPath = vfFind(idx, '_scene_plan_motion.json');
    if (!fs.existsSync(planPath)) continue;

    try {
      const plan = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
      let fixes = 0;
      const motionTypes = ['zoom_in', 'zoom_out', 'pan_right', 'pan_left'];
      const positions = ['top', 'center', 'bottom'];

      // Fix 0: Remove ads/ (carousel/banner) images from video pro (unless carousel_in_video)
      if (!job.data.carousel_in_video) {
        for (let s = 0; s < plan.scenes.length; s++) {
          const imgPath = plan.scenes[s].image || '';
          if (/\/ads\/|carousel_|_carousel|banner_/i.test(imgPath)) {
            // Replace with a campaign image from imgs/ or brand asset
            const absImgsDirFix = path.resolve(PROJECT_ROOT, output_dir, 'imgs');
            const absAssetsDirFix = path.resolve(PROJECT_ROOT, project_dir, 'assets');
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

      // Fix consecutive same motion
      for (let s = 1; s < plan.scenes.length; s++) {
        const prev = plan.scenes[s - 1].motion?.type;
        const curr = plan.scenes[s].motion?.type;
        if (prev && curr && prev === curr) {
          const alts = motionTypes.filter(m => m !== curr);
          plan.scenes[s].motion.type = alts[s % alts.length];
          fixes++;
        }
      }

      // Fix 3 consecutive same text position
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

      // Fix: Ensure video_length matches videoDur (audio + 3s)
      const totalSceneDur = plan.scenes.reduce((s, c) => s + c.duration, 0);
      if (plan.video_length && plan.video_length < videoDur) {
        log(output_dir, 'video_pro', `Auto-fix: video_length ${plan.video_length}s → ${videoDur}s (audio + 3s)`);
        plan.video_length = videoDur;
        fixes++;
      }

      // Fix: If total scene duration is shorter than videoDur, extend last scene
      if (totalSceneDur < videoDur - 1) {
        const deficit = videoDur - totalSceneDur;
        const lastScene = plan.scenes[plan.scenes.length - 1];
        log(output_dir, 'video_pro', `Auto-fix: scene total ${totalSceneDur.toFixed(1)}s < ${videoDur}s — extending last scene "${lastScene.id}" by ${deficit.toFixed(1)}s`);
        lastScene.duration += deficit;
        fixes++;
      }

      // Fix: Ensure every scene has "narration" field
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

      const finalDur = plan.scenes.reduce((s, c) => s + c.duration, 0);
      log(output_dir, 'video_pro', `Video ${idx}: ${plan.scenes.length} cuts, ${finalDur.toFixed(1)}s total (target: ${videoDur}s)`);
    } catch (e) {
      log(output_dir, 'video_pro', `Validation error video ${idx}: ${e.message}`);
    }
  }

  // ── PHASE 2.5: Typography validation ────────────────────────────────────────
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

        // Fix 1: Font size minimum (magazine style)
        if (scene.text_overlay && scene.text_layout) {
          const minSize = scene.type === 'hook' ? 120 : scene.type === 'cta' ? 96 : 80;
          if (scene.text_layout.font_size && scene.text_layout.font_size < minSize) {
            scene.text_layout.font_size = minSize;
            typoFixes++;
          }
          // Fix 2: Font weight minimum for headlines
          if (scene.text_layout.font_weight && scene.text_layout.font_weight < 700) {
            scene.text_layout.font_weight = 700;
            typoFixes++;
          }
        }

        // Fix 3: Auto-detect image_has_text from filename + clear text overlay + force static motion
        const imgPath = scene.image || '';
        if (!scene.image_has_text && imgPath &&
            /(_post|_stories|carousel_|oficial_|logo_|instagram|facebook|_ad\.|banner|calendar)/i.test(imgPath)) {
          scene.image_has_text = true;
          typoFixes++;
        }
        if (scene.image_has_text === true) {
          // Clear text overlay — image already has text
          if (scene.text_overlay) {
            scene.text_overlay = '';
            typoFixes++;
          }
          // Force static/breathe motion — no zoom that crops text
          if (scene.motion) {
            const mt = typeof scene.motion === 'object' ? scene.motion.type : scene.motion;
            if (mt && !['breathe', 'static', 'none'].includes(mt)) {
              if (typeof scene.motion === 'object') scene.motion.type = 'breathe';
              else scene.motion = { type: 'breathe' };
              typoFixes++;
            }
          }
        }

        // Fix 4: Position never bottom
        if (scene.text_layout?.position === 'bottom') {
          scene.text_layout.position = 'top';
          typoFixes++;
        }
        if (scene.text_position === 'bottom') {
          scene.text_position = 'top';
          typoFixes++;
        }

        // Fix 5: Max 6 words
        if (scene.text_overlay) {
          const words = scene.text_overlay.trim().split(/\s+/);
          if (words.length > 6) {
            scene.text_overlay = words.slice(0, 6).join(' ');
            typoFixes++;
          }
        }

        // Fix 6: Ensure text shadow for contrast
        if (scene.text_overlay && !scene.overlay) {
          scene.overlay = 'dark';
          scene.overlay_opacity = 0.45;
          typoFixes++;
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

  // ── PHASE 3: Wait for user approval ─────────────────────────────────────────
  const approvalPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'approved.json');
  const rejectedPath = path.resolve(PROJECT_ROOT, output_dir, 'video', 'rejected.json');

  log(output_dir, 'video_pro', '[VIDEO_APPROVAL_NEEDED] Waiting for approval (30 min timeout)...');
  process.stdout.write(`[VIDEO_APPROVAL_NEEDED] ${output_dir}\n`);
  fs.writeFileSync(path.resolve(PROJECT_ROOT, output_dir, 'video', 'approval_needed.json'),
    JSON.stringify({ type: 'video_editor', output_dir, ts: Date.now() }));

  const approved = await waitForFile(approvalPath, 1800000);
  if (!approved) {
    if (fs.existsSync(rejectedPath)) {
      log(output_dir, 'video_pro', 'User rejected the video plan. Skipping render.');
      return { status: 'skipped', reason: 'rejected by user' };
    }
    log(output_dir, 'video_pro', 'Approval timeout. Skipping video render.');
    return { status: 'skipped', reason: 'approval timeout' };
  }

  // Extend lock before final render
  await job.extendLock(job.token, 900000).catch(() => {});

  // ── PHASE 4: Render (no motion_director needed — plan already enriched) ────
  process.stdout.write(`[VIDEO_PRO_PROGRESS] ${output_dir} render_start\n`);
  log(output_dir, 'video_pro', 'Starting video render...');

  for (let i = 1; i <= video_count; i++) {
    const idx = String(i).padStart(2, '0');
    const ts = videoTimestamp();
    const proFilename = `${task_name}_pro_${idx}_${ts}.mp4`;
    const videoOutput = path.resolve(PROJECT_ROOT, output_dir, 'video', proFilename);
    backupIfExists(videoOutput);
    const absScenePlan = vfFind(idx, '_scene_plan_motion.json');
    const planToRender = path.relative(PROJECT_ROOT, absScenePlan);

    if (!fs.existsSync(absScenePlan)) {
      log(output_dir, 'video_pro', `Scene plan not found for video ${i}, skipping: ${absScenePlan}`);
      continue;
    }

    const renderer = getVideoRenderer('pro');
    const rendererName = renderer === RENDER_REMOTION ? 'Remotion' : 'ffmpeg';
    log(output_dir, 'video_pro', `Rendering video ${i}/${video_count} via ${rendererName}...`);
    try {
      execFileSync('node', [
        renderer,
        planToRender,
        `${output_dir}/video/${proFilename}`,
      ], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        timeout: 600000,
      });
      log(output_dir, 'video_pro', `Video ${i} rendered via ${rendererName}: ${videoOutput}`);
    } catch (renderErr) {
      // If Remotion fails, fallback to ffmpeg
      if (renderer === RENDER_REMOTION) {
        log(output_dir, 'video_pro', `Remotion render ${i} failed, falling back to ffmpeg: ${renderErr.message.slice(0, 150)}`);
        try {
          execFileSync('node', [RENDER_FFMPEG, planToRender, `${output_dir}/video/${proFilename}`], {
            cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 300000,
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

  const prompt = `You are the Copywriter Agent — the Campaign Narrator. Follow the skill defined in skills/copywriter-agent/SKILL.md.

Your role is to create the NARRATIVE of the campaign — the story, the emotional arc, the key phrases that will guide ALL visual and platform content. You do NOT write platform-specific copy (captions, hashtags, descriptions) — that is done by platform agents later.

Task: Create the campaign narrative for "${task_name}".
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
${langInstruction}${briefInstruction}

STEP 1 — Read ALL inputs:
- ${output_dir}/creative/creative_brief.json — campaign angle, emotional hook, key messages, approved CTAs, visual direction, guardrails
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone, approved CTAs, what to avoid
- ${project_dir}/knowledge/product_campaign.md — product features, selling points, campaign angles
- ${output_dir}/research_results.json — winning hooks, audience insights, emotional triggers

STEP 2 — Build the campaign narrative:
Based on the Creative Brief's angle and emotional hook, create:
1. The emotional arc: hook → tension → solution → proof → CTA
2. Key phrases and headlines (short, impactful, brand-aligned)
3. The story in 1 paragraph (the "elevator pitch" of this campaign)
4. Visual text elements (what goes ON the images/videos)

STEP 3 — Save to ${output_dir}/copy/:
- narrative.json — the master narrative file:
  {
    "campaign_angle": "from creative brief",
    "story": "1 paragraph — the campaign story",
    "emotional_arc": ["hook phrase", "tension phrase", "solution phrase", "proof phrase", "cta phrase"],
    "headlines": ["headline 1", "headline 2", "headline 3", ...],
    "carousel_texts": ["slide 1 text", "slide 2 text", ...],
    "story_texts": ["story 1 text", "story 2 text", ...],
    "video_narration": "full narration script for video (50-60s of natural speech)",
    "key_phrases": ["memorable phrase 1", "phrase 2", ...],
    "approved_ctas": ["from creative brief"],
    "tone": "description of the voice/tone for this campaign"
  }
- narrative.md — human-readable version of the narrative (for approval)

QUALITY RULES:
- Use ONLY approved CTAs from creative_brief.json — do not invent new ones
- Match the brand voice from brand_identity.md exactly
- Headlines: max 6 words each, impactful, emotional
- carousel_texts: one key message per slide, building a progression (hook → benefit → proof → CTA)
- story_texts: bold, punchy, one message per story
- video_narration: natural spoken language, matches the emotional arc
- Every text must serve the campaign angle — no generic filler`;

  await runClaude(prompt, 'copywriter_agent', output_dir);
  return { status: 'complete', output: `${output_dir}/copy/` };
}

async function handleDistributionAgent(job) {
  const { task_name, task_date, output_dir, project_dir, platform_targets, language } = job.data;

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: Write the Publish MD file in Brazilian Portuguese (pt-BR).'
    : '';

  // Discover media and platform files
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  const platformsDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
  const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];
  const platformFiles = fs.existsSync(platformsDir) ? fs.readdirSync(platformsDir).filter(f => /\.json$/i.test(f)) : [];

  const prompt = `You are the Distribution Agent. Follow the skill defined in skills/distribution-agent/SKILL.md.

Task: Prepare the COMPLETE distribution package for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Output directory: ${output_dir}/
${langInstruction}

MEDIA FILES TO UPLOAD:
- Images: ${adFiles.length > 0 ? adFiles.map(f => `${output_dir}/ads/${f}`).join(', ') : 'none'}
- Videos: ${videoFiles.length > 0 ? videoFiles.map(f => `${output_dir}/video/${f}`).join(', ') : 'none'}

PLATFORM COPY (already produced by platform agents):
- ${platformFiles.length > 0 ? platformFiles.map(f => `${output_dir}/platforms/${f}`).join(', ') : 'none'}

STEPS:
1. UPLOAD — Run supabase-upload.js for EACH media file:
   node pipeline/supabase-upload.js ${project_dir} ${task_name} ${task_date} <file1> <file2> ...
   This uploads to the "campaign-uploads" bucket and saves ${output_dir}/media_urls.json with public URLs.

2. READ PLATFORM COPY — Read all JSON files from ${output_dir}/platforms/:
   - instagram.json — carousel caption, story sequence, reels caption, hashtags, scheduling
   - youtube.json — title, description, tags, thumbnail text, scheduling
   - threads.json — posts (main + thread + standalone), scheduling
   Also read the .md versions for human-readable summaries.

3. CHECK REWORK — If any platform JSON has "rework_needed" != null, log it as a warning in the Publish MD.

4. ASSEMBLE PUBLISH MD — Create: ${output_dir}/Publish ${task_name} ${task_date}.md
   Structure:
   - Status checklist (one checkbox per platform)
   - Media assets table (filename, platform, public URL from media_urls.json)
   - Instagram section (carousel + stories + reels — copy from instagram.json, URLs from media_urls.json)
   - YouTube section (per video — title, description, tags, video URL from media_urls.json)
   - Threads section (all posts from threads.json)
   - Scheduling calendar (combine scheduling from all platform JSONs into unified calendar)
   - Rework warnings (if any)
   - Execution instructions (reference this file by name to trigger publishing)

DO NOT publish to any platform. Only generate the Publish MD advisory file.
Publishing is ONLY triggered when the user explicitly references the Publish MD by name.`;

  await runClaude(prompt, 'distribution_agent', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/Publish ${task_name} ${task_date}.md` };
}

// ── Platform Agents ──────────────────────────────────────────────────────────────

async function handlePlatformInstagram(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover visual assets produced in stages 2-3
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
  const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

  const prompt = `You are the Instagram Platform Agent — a specialist in Instagram content strategy.

Task: Create Instagram-ready copy for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, headlines, carousel_texts, story_texts, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction, guardrails
- ${project_dir}/knowledge/brand_identity.md — brand voice, approved CTAs, hashtag strategy, emojis
- ${project_dir}/knowledge/platform_guidelines.md — Instagram-specific rules and format constraints
- ${output_dir}/research_results.json — audience insights, best posting times, trending topics

VISUAL ASSETS PRODUCED (adapt your copy to complement these):
- Images in ${output_dir}/ads/: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Videos in ${output_dir}/video/: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}
- VIEW the images before writing — your captions must describe/complement what the viewer sees

YOUR JOB:
Transform the campaign narrative into Instagram-native copy. The MESSAGE comes from the narrative — you adapt tone, format, structure, and hashtags for Instagram. Your captions must work WITH the visuals, not ignore them.

OUTPUT — save to ${output_dir}/platforms/instagram.json:
{
  "carousel": {
    "caption": "main caption: hook in first line (before ...ver mais) + benefit + CTA + line breaks + 5-8 hashtags",
    "slide_captions": ["alt text / context per slide — describe what each image shows"],
    "hashtags": ["from brand_identity.md hashtag strategy"],
    "posting_notes": "best time, format tips"
  },
  "stories": {
    "sequence": [
      { "slide": 1, "image": "filename", "text_overlay": "from narrative story_texts", "cta": "swipe up / link", "sticker": "poll/quiz/emoji slider suggestion" }
    ],
    "posting_notes": "timing, frequency"
  },
  "reels": {
    "video": "video filename",
    "caption": "short punchy caption for video reel",
    "hashtags": ["relevant hashtags"],
    "audio_suggestion": "trending audio or original narration"
  },
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "carousel first, then stories, then reel"
  },
  "rework_needed": null
}

REWORK: If any visual asset is unsuitable for Instagram (wrong aspect ratio, poor quality, missing format), set "rework_needed" to a description of what needs to change. Otherwise leave it null.

Also save ${output_dir}/platforms/instagram.md — human-readable version for review.

QUALITY RULES:
- Use ONLY approved CTAs and hashtags from brand_identity.md
- Caption hook must be in the FIRST LINE (before "...ver mais")
- Carousel caption: 2200 chars max
- Stories: bold, 1 message per story, suggest interactive stickers
- Reels caption: short, punchy, trending hashtags
- Match brand voice exactly — never generic`;

  await runClaude(prompt, 'platform_instagram', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/instagram.json` };
}

async function handlePlatformYouTube(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover video assets
  const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];
  const scenePlans = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /scene_plan.*\.json$/i.test(f)) : [];

  const prompt = `You are the YouTube Platform Agent — a specialist in YouTube content optimization and SEO.

Task: Create YouTube-ready metadata for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, video_narration script, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, approved CTAs
- ${project_dir}/knowledge/platform_guidelines.md — YouTube-specific rules
- ${output_dir}/research_results.json — trending keywords, audience interests, competitor gaps

VIDEO ASSETS PRODUCED:
- Videos: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}
- Scene plans: ${scenePlans.length > 0 ? scenePlans.join(', ') : 'none'}
- Read scene plans to understand the video content and write accurate descriptions

YOUR JOB:
Transform the campaign narrative into YouTube-optimized metadata. Titles rank in search, descriptions convert viewers, tags improve discovery. Your metadata must accurately describe the VIDEO CONTENT.

OUTPUT — save to ${output_dir}/platforms/youtube.json:
{
  "videos": [
    {
      "file": "video filename",
      "title": "60-70 chars, keyword-rich, no emojis, curiosity-driven",
      "description": "first 2 lines = hook + CTA (visible before fold). Then: 2-3 benefit sentences. Links. Hashtags at bottom.",
      "tags": ["8-12 keyword tags for SEO"],
      "category": "YouTube category",
      "thumbnail_text": "2-4 words for thumbnail overlay",
      "end_screen": "subscribe CTA + related video suggestion"
    }
  ],
  "shorts": {
    "video": "short video filename if available",
    "title": "shorter title for Shorts format",
    "description": "brief + hashtags",
    "tags": ["shorts-specific tags"]
  },
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "long-form first, then Shorts 24h later"
  },
  "rework_needed": null
}

REWORK: If any video is unsuitable for YouTube (wrong duration, missing audio, poor quality), set "rework_needed" to a description of what needs to change. Otherwise leave null.

Also save ${output_dir}/platforms/youtube.md — human-readable version for review.

QUALITY RULES:
- Title: 60-70 chars, front-load keywords, no clickbait that doesn't deliver
- Description: first 160 chars appear in search — make them count
- Tags: mix of broad + specific, brand name included
- Use trending keywords from research_results.json
- Match brand voice — informative but not corporate`;

  await runClaude(prompt, 'platform_youtube', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/youtube.json` };
}

async function handlePlatformThreads(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover visual assets for image attachment decisions
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];

  const prompt = `You are the Threads Platform Agent — a specialist in Threads/Twitter-style short-form content.

Task: Create Threads-ready posts for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, key_phrases, emotional_arc, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, guardrails
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone, what to avoid
- ${project_dir}/knowledge/platform_guidelines.md — Threads-specific rules
- ${output_dir}/research_results.json — trending topics, audience language

VISUAL ASSETS AVAILABLE (for image attachments):
- Images in ${output_dir}/ads/: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Decide which posts benefit from an image attachment and which work better as text-only

YOUR JOB:
Transform the campaign narrative into Threads-native content. Threads is conversational, direct, and punchy — like talking to a friend who happens to be an expert. NOT a copy of the Instagram caption.

OUTPUT — save to ${output_dir}/platforms/threads.json:
{
  "posts": [
    {
      "type": "main",
      "text": "main post — max 500 chars, hook + value + soft CTA",
      "image": "filename from ads/ or null"
    },
    {
      "type": "thread",
      "text": "follow-up in thread — adds context, insight, or behind-the-scenes",
      "image": null
    },
    {
      "type": "standalone",
      "text": "separate post for another day — different angle from the narrative",
      "image": "filename or null"
    }
  ],
  "scheduling": {
    "best_days": ["from research_results.json"],
    "best_times": ["from research_results.json"],
    "posting_order": "main + thread same day, standalone next day"
  },
  "rework_needed": null
}

Also save ${output_dir}/platforms/threads.md — human-readable version for review.

QUALITY RULES:
- Max 500 chars per post
- No more than 3 hashtags per post
- Conversational tone — NOT a copy of Instagram caption
- Main post must hook in first sentence
- Thread follow-ups add NEW value, not just repeat
- Match brand voice exactly`;

  await runClaude(prompt, 'platform_threads', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/threads.json` };
}

async function handlePlatformTikTok(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover video assets
  const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

  const prompt = `You are the TikTok Platform Agent — a specialist in TikTok viral content.

Task: Create TikTok-ready content plan for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, emotional_arc, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone
- ${project_dir}/knowledge/platform_guidelines.md — TikTok-specific rules
- ${output_dir}/research_results.json — trending topics, viral hooks, audience behavior

VIDEOS AVAILABLE:
- ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}

TikTok requires 9:16 vertical video (1080x1920). If existing videos are in a different format, set rework_needed with the format request.

YOUR JOB:
Create TikTok-native content. TikTok demands: hook in FIRST 2 SECONDS, fast pacing, trending sounds, authentic (not polished corporate). The content must feel native to the platform.

OUTPUT — save to ${output_dir}/platforms/tiktok.json:
{
  "videos": [
    {
      "source_video": "existing video filename or null",
      "format": "9:16",
      "duration": "15-60s",
      "caption": "short caption — max 150 chars for visibility, punchy, conversational",
      "hashtags": ["mix of trending + niche, max 5"],
      "sound": "trending sound suggestion or 'original audio'",
      "hook_strategy": "what happens in the first 2 seconds to stop the scroll",
      "text_overlays": ["key text that appears on screen during video"]
    }
  ],
  "rework_needed": null,
  "video_format_request": null,
  "scheduling": {
    "best_days": ["from research"],
    "best_times": ["from research"],
    "frequency": "posting cadence recommendation"
  }
}

REWORK: If no 9:16 video exists, set:
  "rework_needed": "Need 9:16 vertical video (1080x1920) for TikTok"
  "video_format_request": { "format": "9:16", "duration": "15-30s", "style": "quick cuts, hook first 2s" }

Also save ${output_dir}/platforms/tiktok.md — human-readable version.

QUALITY RULES:
- Hook in FIRST 2 seconds — no slow intros
- Caption: max 150 chars visible (rest truncated)
- Hashtags: max 5, mix trending + brand
- Tone: authentic, not corporate — TikTok users scroll past polished ads
- Match brand voice but adapt to TikTok culture`;

  await runClaude(prompt, 'platform_tiktok', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/tiktok.json` };
}

async function handlePlatformFacebook(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover assets
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const videoDir = path.resolve(PROJECT_ROOT, output_dir, 'video');
  const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];
  const videoFiles = fs.existsSync(videoDir) ? fs.readdirSync(videoDir).filter(f => /\.mp4$/i.test(f)) : [];

  const prompt = `You are the Facebook Platform Agent — a specialist in Facebook content strategy across Feed, Stories, and Reels.

Task: Create Facebook-ready content plan for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, headlines, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, tone, CTAs
- ${project_dir}/knowledge/platform_guidelines.md — Facebook-specific rules
- ${output_dir}/research_results.json — audience demographics, engagement patterns

VISUAL ASSETS:
- Images: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}
- Videos: ${videoFiles.length > 0 ? videoFiles.join(', ') : 'none'}

Facebook content types:
- Feed post (image or video): 16:9 landscape or 1:1 square, longer captions OK
- Stories: 9:16 vertical, 15s segments, ephemeral
- Reels: 9:16 vertical, 15-90s, algorithm-boosted
- Video: 16:9 landscape preferred, up to 240 min

YOUR JOB:
Create Facebook-native content. Facebook favors: longer engagement, shares/comments, community building, video (especially Reels). Adapt the narrative for an audience that skews older and more community-oriented than Instagram.

OUTPUT — save to ${output_dir}/platforms/facebook.json:
{
  "feed_post": {
    "type": "image or video",
    "media": "filename from ads/ or video/",
    "format": "1:1 or 16:9",
    "caption": "longer caption OK — hook + story + CTA + hashtags (3-5)",
    "link": "URL if applicable"
  },
  "stories": {
    "sequence": [
      { "slide": 1, "media": "filename", "text_overlay": "bold text", "cta": "swipe action" }
    ]
  },
  "reels": {
    "source_video": "existing video or null",
    "format": "9:16",
    "caption": "short engaging caption",
    "hashtags": ["relevant hashtags"]
  },
  "video": {
    "source_video": "existing 16:9 video or null",
    "title": "video title for Facebook",
    "description": "video description"
  },
  "rework_needed": null,
  "video_format_request": null,
  "scheduling": {
    "best_days": ["from research"],
    "best_times": ["from research"],
    "posting_order": "feed post, then stories, then reels"
  }
}

REWORK: If you need a 16:9 video and only 9:16 exists (or vice versa), set:
  "rework_needed": "description of what's needed"
  "video_format_request": { "format": "16:9", "duration": "30-60s", "style": "description" }

Also save ${output_dir}/platforms/facebook.md — human-readable version.

QUALITY RULES:
- Feed captions can be longer (up to 500 words) — use storytelling
- Reels need hook in first 3 seconds
- Stories: bold text, 1 message per slide
- Community tone — encourage comments and shares
- Match brand voice`;

  await runClaude(prompt, 'platform_facebook', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/facebook.json` };
}

async function handlePlatformLinkedIn(job) {
  const { task_name, task_date, output_dir, project_dir, language, campaign_brief } = job.data;
  const absPlatformDir = path.resolve(PROJECT_ROOT, output_dir, 'platforms');
  fs.mkdirSync(absPlatformDir, { recursive: true });

  const lang = language || 'en';
  const langInstruction = lang === 'pt-BR'
    ? 'IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).'
    : '';
  const briefInstruction = campaign_brief
    ? `\nCampaign Brief: ${campaign_brief}`
    : '';

  // Discover image assets
  const adsDir = path.resolve(PROJECT_ROOT, output_dir, 'ads');
  const adFiles = fs.existsSync(adsDir) ? fs.readdirSync(adsDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)) : [];

  const prompt = `You are the LinkedIn Platform Agent — a specialist in LinkedIn professional content.

Task: Create LinkedIn-ready content for the "${task_name}" campaign.
Date: ${task_date}
${langInstruction}${briefInstruction}

READ ALL INPUTS:
- ${output_dir}/copy/narrative.json — campaign narrative, key_phrases, approved CTAs
- ${output_dir}/creative/creative_brief.json — campaign angle, visual direction
- ${project_dir}/knowledge/brand_identity.md — brand voice, professional tone
- ${project_dir}/knowledge/platform_guidelines.md — LinkedIn-specific rules
- ${output_dir}/research_results.json — industry trends, professional audience insights

VISUAL ASSETS:
- Images: ${adFiles.length > 0 ? adFiles.join(', ') : 'none'}

LinkedIn content types:
- Post (text + image): 1200x627 landscape or 1080x1080 square
- Article: long-form thought leadership
- Document/carousel: PDF slides (swipeable)

YOUR JOB:
Adapt the campaign narrative for a PROFESSIONAL audience. LinkedIn rewards: thought leadership, data-driven insights, professional storytelling, industry relevance. NOT a copy of Instagram — reframe the message for business context.

OUTPUT — save to ${output_dir}/platforms/linkedin.json:
{
  "post": {
    "text": "professional post — hook first line (before ...see more) + insight + value + CTA. Max 3000 chars but front-load value in first 300.",
    "image": "filename from ads/ or null",
    "format": "1200x627 or 1080x1080",
    "hashtags": ["3-5 professional hashtags"]
  },
  "article": {
    "title": "thought leadership title if applicable",
    "summary": "2-3 sentences — only if the campaign angle merits long-form",
    "publish": false
  },
  "carousel_document": {
    "slides": ["slide 1 text", "slide 2 text"],
    "description": "PDF carousel concept — if applicable",
    "publish": false
  },
  "rework_needed": null,
  "scheduling": {
    "best_days": ["Tue, Wed, Thu — highest LinkedIn engagement"],
    "best_times": ["8-10 AM or 12-1 PM"],
    "posting_notes": "post once, engage in comments for 2 hours after"
  }
}

Also save ${output_dir}/platforms/linkedin.md — human-readable version.

QUALITY RULES:
- Professional tone — not corporate jargon, but not casual/slang either
- Hook in FIRST LINE (before "...see more" fold)
- Add value/insight — LinkedIn penalizes pure self-promotion
- Hashtags: 3-5 professional/industry hashtags
- If campaign angle doesn't fit LinkedIn (e.g. pure lifestyle), acknowledge it and suggest a professional reframe
- Match brand voice adapted for professional context`;

  await runClaude(prompt, 'platform_linkedin', output_dir, 600000);
  return { status: 'complete', output: `${output_dir}/platforms/linkedin.json` };
}

// ── Handler registry ────────────────────────────────────────────────────────────

const HANDLERS = {
  research_agent: handleResearchAgent,
  creative_director: handleCreativeDirector,
  copywriter_agent: handleCopywriterAgent,
  ad_creative_designer: handleAdCreativeDesigner,
  video_quick: handleVideoQuick,
  video_pro: handleVideoPro,
  video_ad_specialist: handleVideoAdSpecialist,  // legacy compat
  platform_instagram: handlePlatformInstagram,
  platform_youtube: handlePlatformYouTube,
  platform_tiktok: handlePlatformTikTok,
  platform_facebook: handlePlatformFacebook,
  platform_threads: handlePlatformThreads,
  platform_linkedin: handlePlatformLinkedIn,
  distribution_agent: handleDistributionAgent,
  motion_director: async (job) => ({ status: 'complete' }),
};

// ── Logger ────────────────────────────────────────────────────────────────────

// Backup existing file before overwriting (rerun creates new versions)
/** Generate timestamp string for video filenames: YYYYMMDD_HHmmss */
function videoTimestamp() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let v = 1;
  while (fs.existsSync(path.join(dir, `${base}_v${v}${ext}`))) v++;
  fs.renameSync(filePath, path.join(dir, `${base}_v${v}${ext}`));
}

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

  // Each dependency can take up to 30 min (e.g. video + approval flow)
  const maxWait = 3600000; // 60 minutes
  const pollInterval = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    // Fetch up to 1000 completed jobs — default range is only 1 which misses prior completions
    const completed = await queue.getCompleted(0, 1000);
    // Filter to jobs from the same campaign (same output_dir) to avoid cross-campaign collisions
    const outputDir = job.data.output_dir;
    const completedAgents = completed
      .filter(j => j.data.output_dir === outputDir)
      .map(j => j.data.agent);

    const allDone = deps.every(dep => completedAgents.includes(dep));

    if (allDone) {
      log(job.data.output_dir, job.data.agent, 'All dependencies completed.');
      await queue.close();
      return;
    }

    // Check if any dependency failed (same campaign)
    const failed = await queue.getFailed(0, 1000);
    const failedAgents = failed
      .filter(j => j.data.output_dir === outputDir)
      .map(j => j.data.agent);
    const anyFailed = deps.some(dep => failedAgents.includes(dep));

    if (anyFailed) {
      await queue.close();
      throw new Error(`Dependency failed for ${job.data.agent}. Cannot proceed.`);
    }

    // Log progress every ~30s so the user can see it's alive
    const elapsed = Math.round((Date.now() - start) / 1000);
    if (elapsed % 30 < pollInterval / 1000) {
      const waiting = deps.filter(d => !completedAgents.includes(d));
      log(job.data.output_dir, job.data.agent, `Still waiting for: ${waiting.join(', ')} (${elapsed}s elapsed)`);
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

    // Wait for dependencies before running (skip in rerun mode)
    if (!job.data.skip_dependencies) {
      await waitForDependencies(job);
    }

    await job.updateProgress(0);
    log(job.data.output_dir, agentName, `Starting ${agentName}...`);

    const result = await handler(job);
    await job.updateProgress(100);

    log(job.data.output_dir, agentName, `Completed successfully.`);
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 5,
    lockDuration: 900000,    // 15 min — video pro agents can take 10+ min
    stalledInterval: 120000, // check stalled every 2 min (default 30s)
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

// Drain stale jobs left from previous worker runs (active/waiting jobs with no live worker)
// Note: drain() was removed — it was deleting fresh jobs added just before worker startup

console.log(`\n🔄 Worker started — listening on queue: "${QUEUE_NAME}"`);
console.log('   Agents will be invoked via Claude CLI (claude -p)');
console.log('   Press Ctrl+C to stop.\n');
