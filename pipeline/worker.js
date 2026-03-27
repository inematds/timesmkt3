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

const PROJECT_ROOT = path.resolve(__dirname, '..');

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
  const { task_name, task_date, output_dir, project_dir, platform_targets, language, campaign_brief } = job.data;
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

Focus the research on the campaign theme: "${task_name}". This is a Cold Brew Coffee Co. campaign.`;

  await runClaude(prompt, 'research_agent', output_dir);
  return { status: 'complete', output: `${output_dir}/research_results.json` };
}

async function handleAdCreativeDesigner(job) {
  const {
    task_name, task_date, output_dir, project_dir, platform_targets,
    language, campaign_brief,
    image_count = 1, image_formats = ['carousel_1080x1080'],
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

  const prompt = `You are the Ad Creative Designer. Follow the skill defined in skills/ad-creative-designer/SKILL.md for brand guidelines, but adapt the output format as instructed below.

Task: Create multiple static ad creatives for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

Read ${project_dir}/knowledge/brand_identity.md, ${project_dir}/knowledge/product_campaign.md, and ${project_dir}/knowledge/platform_guidelines.md.
Read the research results from ${output_dir}/research_results.json for campaign context.
Use assets from the ${project_dir}/assets/ directory for product images (use absolute paths for file:// URLs in the HTML).
${imageInstructions}

Save ALL files to ${output_dir}/ads/.
Also save a layout.json with metadata for all generated images (filename, dimensions, concept, copy).

CRITICAL: Use Playwright (chromium) to render EVERY HTML file to PNG. Example:
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 }); // or 1920 for stories
  await page.goto('file://' + absolutePathToHtml);
  await page.screenshot({ path: outputPngPath });

Make each image visually distinct with different colors, layouts, and compositions. Use the brand palette (coffee browns, cold blue, amber, off-white) but vary the emphasis per slide.`;

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

  const videoBriefsText = video_briefs.length > 0
    ? video_briefs.map((b, i) => `  ${i + 1}. ${b}`).join('\n')
    : Array.from({ length: video_count }, (_, i) =>
        `  ${i + 1}. Video ${i + 1} — 15 seconds, unique angle on the campaign theme`
      ).join('\n');

  const prompt = `You are the Video Ad Specialist. Follow the skill defined in skills/video-ad-specialist/SKILL.md for guidelines, but adapt for multiple videos.

Task: Create ${video_count} short-form video ad concepts for the "${task_name}" campaign.
Date: ${task_date}
Platforms: ${platform_targets.join(', ')}
Research input: ${output_dir}/research_results.json
${langInstruction}${briefInstruction}

Read ${project_dir}/knowledge/brand_identity.md, ${project_dir}/knowledge/product_campaign.md, and ${project_dir}/knowledge/platform_guidelines.md.
Read the research results from ${output_dir}/research_results.json for campaign context.

Video briefs:
${videoBriefsText}

For EACH video, save a scene plan JSON to ${output_dir}/video/:
- video_01_scene_plan.json
- video_02_scene_plan.json
${video_count > 2 ? `- ... up to video_0${video_count}_scene_plan.json` : ''}

Each scene plan must include: video_length, platform, scenes array (with timing, type, visual description, text_overlay).
Each video should be 15 seconds, hook in first 2 seconds, fast pacing, strong CTA.
Each video must have a DIFFERENT creative angle and emotional tone.`;

  await runClaude(prompt, 'video_ad_specialist', output_dir, 600000);

  // Render videos using Remotion with scene plan as props
  const { execFileSync } = require('child_process');
  for (let i = 1; i <= video_count; i++) {
    const videoOutput = `${output_dir}/video/ad_${String(i).padStart(2, '0')}.mp4`;
    const scenePlan = `${output_dir}/video/video_${String(i).padStart(2, '0')}_scene_plan.json`;
    log(output_dir, 'video_ad_specialist', `Rendering video ${i}/${video_count} with scene plan...`);
    try {
      execFileSync('node', [
        path.resolve(PROJECT_ROOT, 'pipeline/render-video.js'),
        videoOutput,
        scenePlan,
      ], {
        cwd: PROJECT_ROOT,
        stdio: 'pipe',
        timeout: 300000,
      });
      log(output_dir, 'video_ad_specialist', `Video ${i} rendered: ${videoOutput}`);
    } catch (renderErr) {
      log(output_dir, 'video_ad_specialist', `Remotion render ${i} failed: ${renderErr.message}`);
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

Read ${project_dir}/knowledge/brand_identity.md, ${project_dir}/knowledge/product_campaign.md, and ${project_dir}/knowledge/platform_guidelines.md.
Read the research results from ${output_dir}/research_results.json to extract content_topics, marketing_angles, keywords, and ad_hooks.

Select ONE consistent campaign angle and write copy for each platform:
Save these files to ${output_dir}/copy/:
- threads_post.txt (max 500 chars, witty/casual, 1-3 sentences)
- instagram_caption.txt (hook + benefit + CTA + 3-5 hashtags)
- youtube_metadata.json (title 60-70 chars, description, 5-8 tags)
- copy_output.json (structured output with all platform copy)

Also write captions for each carousel slide and story:
- carousel_captions.json (array of captions, one per slide)
- story_captions.json (array of captions, one per story)`;

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
