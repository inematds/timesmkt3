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
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getEnv, hasEnv, loadEnv } = require('../config/env');

const PROJECT_ROOT = path.resolve(__dirname, '..');
loadEnv({ override: true });
const workerEnv = {
  IMAGE_PROVIDER: getEnv('IMAGE_PROVIDER', 'kie'),
  FREE_IMAGE_PROVIDER: getEnv('FREE_IMAGE_PROVIDER', 'pexels'),
  PEXELS_API_KEY: getEnv('PEXELS_API_KEY', ''),
  UNSPLASH_ACCESS_KEY: getEnv('UNSPLASH_ACCESS_KEY', ''),
  PIXABAY_API_KEY: getEnv('PIXABAY_API_KEY', ''),
};
const { createWorkerAssetHelpers } = require('./worker-assets');
const { videoTimestamp, backupIfExists, createLogger, createDependencyWaiter, createClaudeRunner } = require('./worker-runtime');
const { createAdCreativeHandler } = require('./worker-ad-creative');
const { createPlatformHandlers } = require('./worker-platforms');
const { createWorkerVideoHandlers } = require('./worker-video');
const { createWorkerVideoProHandler } = require('./worker-video-pro');
const kieProvider = require('./generate-image-kie');
const pollinationsProvider = require('./generate-image-pollinations');
const piramydProvider = require('./generate-image-piramyd');

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
const IMAGE_PROVIDER = workerEnv.IMAGE_PROVIDER.toLowerCase();

// Free image provider — default pexels, configurable via FREE_IMAGE_PROVIDER env
const FREE_IMAGE_PROVIDER = workerEnv.FREE_IMAGE_PROVIDER.toLowerCase();
const log = createLogger(PROJECT_ROOT);
const runClaude = createClaudeRunner({ projectRoot: PROJECT_ROOT, log, command: 'claude' });
const waitForDependencies = createDependencyWaiter({ queueName: QUEUE_NAME, redisConnection, log });
const {
  resolveImageSource,
  getFreeImageProvider,
  getFolderAssets,
  detectImageType,
  getImageDimensions,
  getProjectAssets,
  formatAssetList,
} = createWorkerAssetHelpers({ projectRoot: PROJECT_ROOT, freeImageProviderEnv: FREE_IMAGE_PROVIDER, env: workerEnv });

function getImageProvider(jobProvider) {
  const p = (jobProvider || IMAGE_PROVIDER || 'kie').toLowerCase();
  if (p === 'pollinations') return pollinationsProvider;
  if (p === 'piramyd') return piramydProvider;
  return kieProvider;
}

// Rotating provider pool — cycles through multiple providers to avoid rate limits
const ROTATING_PROVIDERS = ['pollinations', 'piramyd'].filter(p => {
  if (p === 'piramyd') return hasEnv('PIRAMYD_API_KEY');
  return true;
});
let _rotatingIdx = 0;
function getRotatingProvider() {
  if (ROTATING_PROVIDERS.length === 0) return pollinationsProvider;
  const p = ROTATING_PROVIDERS[_rotatingIdx % ROTATING_PROVIDERS.length];
  _rotatingIdx++;
  return getImageProvider(p);
}


// Aliases used throughout file (KIE defaults; overridden per-job via getImageProvider)
const { buildImagePrompt, readBrandContext, DEFAULT_MODEL } = kieProvider;
const { generateImage } = kieProvider; // will be shadowed per call when provider differs
const {
  handleVideoQuick,
  handleVideoAdSpecialist,
} = createWorkerVideoHandlers({
  projectRoot: PROJECT_ROOT,
  imageProviderName: IMAGE_PROVIDER,
  defaultModel: DEFAULT_MODEL,
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
});
const handleVideoPro = createWorkerVideoProHandler({
  projectRoot: PROJECT_ROOT,
  imageProviderName: IMAGE_PROVIDER,
  defaultModel: DEFAULT_MODEL,
  renderFfmpeg: RENDER_FFMPEG,
  renderRemotion: RENDER_REMOTION,
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
});
const handleAdCreativeDesigner = createAdCreativeHandler({
  projectRoot: PROJECT_ROOT,
  imageProviderName: IMAGE_PROVIDER,
  defaultModel: DEFAULT_MODEL,
  buildImagePrompt,
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
});
const {
  handleDistributionAgent,
  handlePlatformInstagram,
  handlePlatformYouTube,
  handlePlatformThreads,
  handlePlatformTikTok,
  handlePlatformFacebook,
  handlePlatformLinkedIn,
} = createPlatformHandlers({
  projectRoot: PROJECT_ROOT,
  runClaude,
});

// ── Asset discovery ────────────────────────────────────────────────────────────


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
