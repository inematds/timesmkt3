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
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Asset discovery ────────────────────────────────────────────────────────────

/**
 * Returns a list of absolute paths for all brand images in a project.
 * Checks both `imgs/` and `assets/` directories.
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
      .map(f => path.resolve(fullDir, f));
    files.push(...found);
  }

  return files;
}

/**
 * Formats asset list for inclusion in agent prompts.
 */
function formatAssetList(assetPaths) {
  if (!assetPaths || assetPaths.length === 0) return 'No brand assets found.';
  return assetPaths.map(p => `  - ${p}`).join('\n');
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

  // Build image source instructions based on image_source field
  let imageSourceSection = '';
  if (image_source === 'generate') {
    imageSourceSection = `
STEP 2 — Image source: AI GENERATION
- Do NOT use brand photos as backgrounds
- Use CSS gradients, geometric shapes, abstract visuals, and typography-driven layouts
- Create visually striking designs using ONLY CSS/HTML — no <img> tags for backgrounds
- You may use brand colors from brand_identity.md for the visual palette
- Focus on bold typography, strong visual hierarchy, and brand color usage`;
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
  await page.screenshot({ path: pngOutputPath });
  await browser.close();

Design quality bar:
- Each slide uses a DIFFERENT brand image — never repeat the same photo
- Brand color palette from brand_identity.md applied to text, overlays, CTAs
- Bold typography, high contrast, clear visual hierarchy
- Campaign theme visible in every image — coherent visual story`;

  await runClaude(prompt, 'ad_creative_designer', output_dir, 900000); // 15 min for multiple images
  return { status: 'complete', output: `${output_dir}/ads/` };
}

async function handleVideoAdSpecialist(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    video_count = 1, video_briefs = [],
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

  const brandAssets = getProjectAssets(project_dir);
  const assetList = formatAssetList(brandAssets);
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
- Include the audio path in the scene plan under "audio": "${output_dir}/audio/video_01_narration.mp3"
- Recommended voices: rachel (warm/emotional), bella (clear/friendly), antoni (professional)
` : `
AUDIO: ElevenLabs not configured. Generate silent videos. Narration scripts only in scene plan.
`;

  const prompt = `You are the Video Ad Specialist. Follow the skill defined in skills/video-ad-specialist/SKILL.md for guidelines, but adapt for multiple videos.

Task: Create ${video_count} short-form video ads for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

STEP 1 — Read brand knowledge:
- ${project_dir}/knowledge/brand_identity.md
- ${project_dir}/knowledge/product_campaign.md
- ${output_dir}/research_results.json (winning angles, hooks, audience insights)

STEP 2 — Available brand images for video frames:
${assetList}

STEP 3 — Video briefs:
${videoBriefsText}
${audioInstructions}
STEP 4 — For EACH video, create:

a) Scene plan JSON — save to ${output_dir}/video/video_0N_scene_plan.json
   Required format:
   {
     "titulo": "...",
     "video_length": 20,
     "format": "1080x1920",
     "audio": "${output_dir}/audio/video_0N_narration.mp3",
     "narration_script": "full narration text here...",
     "scenes": [
       {
         "id": "hook",
         "duration": 4,
         "type": "hook",
         "image": "<absolute path to brand image>",
         "text_overlay": "Short impactful text",
         "narration": "First sentence of narration for this scene"
       }
     ]
   }

b) CRITICAL: Use REAL brand images from the list above for each scene "image" field.
   - Different image per scene — never repeat
   - Choose images that match the scene's emotional context
   - Use absolute file paths

c) After generating ALL scene plans and audio, render each video using ffmpeg:
   node pipeline/render-video-ffmpeg.js ${output_dir}/video/video_0N_scene_plan.json ${output_dir}/video/video_0N.mp4

Each video: 20 seconds, hook in first 3 seconds, 4-5 scenes, strong CTA at end.
${video_count} videos must each have DIFFERENT emotional angles and image selections.`;

  await runClaude(prompt, 'video_ad_specialist', output_dir, 900000);

  // Render videos using ffmpeg (via render-video-ffmpeg.js)
  const { execFileSync } = require('child_process');
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
