/**
 * AI Content Pipeline Orchestrator
 *
 * Receives a Job Payload and enqueues all agent jobs into BullMQ
 * with proper dependency ordering. Supports optional skips for
 * research, image, and video stages.
 *
 * Usage:
 *   node pipeline/orchestrator.js --payload '{"task_name":"coldbrew_campaign","task_date":"2026-03-15",...}'
 *   node pipeline/orchestrator.js --file pipeline/payloads/coldbrew_demo.json
 */

const { pipelineQueue } = require('./queues');
const fs = require('fs');
const path = require('path');

// ── Agent definitions ─────────────────────────────────────────────────────────

const AGENTS = [
  // ── Stage 1: Research, Strategy & Narrative ──────────────────────────────
  {
    name: 'research_agent',
    label: 'Research Agent',
    dependencies: [],
    skippable: true,
    skipFlag: 'skip_research',
  },
  {
    name: 'creative_director',
    label: 'Creative Director',
    dependencies: ['research_agent'],
    skippable: true,
    skipFlag: 'skip_research', // skipped together with research
  },
  {
    name: 'copywriter_agent',
    label: 'Copywriter Agent (Narrativa)',
    dependencies: ['research_agent', 'creative_director'],
    skippable: false,
  },
  // ── Stage 2: Visual Production ───────────────────────────────────────────
  {
    name: 'ad_creative_designer',
    label: 'Ad Creative Designer',
    dependencies: ['creative_director', 'copywriter_agent'],
    skippable: true,
    skipFlag: 'skip_image',
  },
  {
    name: 'video_quick',
    label: 'Video Quick',
    dependencies: ['ad_creative_designer', 'copywriter_agent'],
    skippable: true,
    skipFlag: 'skip_video',
  },
  {
    name: 'video_pro',
    label: 'Video Pro',
    dependencies: ['ad_creative_designer', 'copywriter_agent'],
    skippable: true,
    skipFlag: 'skip_video',
  },
  // ── Stage 4: Platform Agents ─────────────────────────────────────────────
  // Each agent is a specialist for its platform — knows formats, rules, and
  // can request rework (new video format, image crop, etc.) from stages 2-3.
  // Only agents matching platform_targets in the payload are enqueued.
  {
    name: 'platform_instagram',
    label: 'Instagram Agent',
    dependencies: ['ad_creative_designer', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'instagram',
  },
  {
    name: 'platform_youtube',
    label: 'YouTube Agent',
    dependencies: ['video_editor_agent', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'youtube',
  },
  {
    name: 'platform_tiktok',
    label: 'TikTok Agent',
    dependencies: ['video_editor_agent', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'tiktok',
  },
  {
    name: 'platform_facebook',
    label: 'Facebook Agent',
    dependencies: ['ad_creative_designer', 'video_editor_agent', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'facebook',
  },
  {
    name: 'platform_threads',
    label: 'Threads Agent',
    dependencies: ['copywriter_agent'],
    skippable: true,
    platformFlag: 'threads',
  },
  {
    name: 'platform_linkedin',
    label: 'LinkedIn Agent',
    dependencies: ['ad_creative_designer', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'linkedin',
  },
  // ── Stage 5: Distribution ────────────────────────────────────────────────
  {
    name: 'distribution_agent',
    label: 'Distribution Agent',
    dependencies: [], // dynamically resolved from active platform agents
    skippable: false,
  },
];

// All platform agent names (used by enqueueStage to filter by platform_targets)
const PLATFORM_AGENTS = AGENTS.filter(a => a.platformFlag).map(a => a.name);

// ── Stage definitions ────────────────────────────────────────────────────────

const STAGES = {
  stage1: ['research_agent', 'creative_director', 'copywriter_agent'],
  stage2: ['ad_creative_designer'],
  stage3: ['video_quick'],  // default; swapped to ['video_pro'] when video_mode === 'pro'
  stage4: PLATFORM_AGENTS,
  stage5: ['distribution_agent'],
};

// ── Payload validation ────────────────────────────────────────────────────────

function validatePayload(payload) {
  const errors = [];

  if (!payload.task_name) errors.push('Missing required field: task_name');
  if (!payload.task_date) errors.push('Missing required field: task_date');
  if (!payload.platform_targets || !Array.isArray(payload.platform_targets)) {
    errors.push('Missing or invalid field: platform_targets (must be an array)');
  }

  if (!payload.project_dir) errors.push('Missing required field: project_dir (e.g. "prj/coldbrew-coffee-co")');

  // If skipping research, verify source folder exists
  if (payload.skip_research) {
    const projectDir = payload.project_dir || '';
    const sourceFolder = payload.source_folder
      ? path.resolve(__dirname, '..', payload.source_folder)
      : path.resolve(__dirname, '..', projectDir, 'assets', payload.task_name);

    if (!fs.existsSync(sourceFolder)) {
      errors.push(
        `skip_research is true but source folder not found: ${sourceFolder}. ` +
        `Upload assets to ${projectDir}/assets/${payload.task_name}/ before running.`
      );
    }
  }

  return errors;
}

// ── Job enqueue ───────────────────────────────────────────────────────────────

async function enqueueJobs(payload) {
  const {
    task_name,
    task_date,
    project_dir,
    skip_research = false,
    skip_image = false,
    skip_video = false,
    platform_targets = ['instagram', 'youtube'],
    source_folder = null,
  } = payload;

  const jobResults = [];
  const skippedJobs = new Set();

  console.log(`\n🚀 Starting pipeline: ${task_name} (${task_date})`);
  console.log(`   Platforms: ${platform_targets.join(', ')}`);
  console.log(`   Skips — research: ${skip_research}, image: ${skip_image}, video: ${skip_video}\n`);

  for (const agent of AGENTS) {
    const isSkipped = agent.skippable && payload[agent.skipFlag];

    // Mark dependencies as skipped so downstream agents can adjust
    const activeDeps = agent.dependencies.filter(dep => !skippedJobs.has(dep));

    if (isSkipped) {
      skippedJobs.add(agent.name);
      const result = {
        job_name: agent.name,
        status: 'complete',
        dependencies: agent.dependencies,
        notes: `Skipped per user flag: ${agent.skipFlag}`,
      };
      jobResults.push(result);
      console.log(`  ⏭  ${agent.label} — skipped`);
      continue;
    }

    const jobData = {
      ...payload,
      agent: agent.name,
      task_name,
      task_date,
      platform_targets,
      source_folder,
      skip_research,
      skip_image,
      skip_video,
      dependencies: activeDeps,
      project_dir,
      output_dir: payload.output_dir || `${project_dir}/outputs/${task_name}`,
    };

    // BullMQ job options — delay dependent jobs to allow dependencies to complete
    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    };

    const job = await pipelineQueue.add(agent.name, jobData, jobOptions);

    const result = {
      job_name: agent.name,
      job_id: job.id,
      status: 'queued',
      dependencies: activeDeps,
      notes: activeDeps.length > 0
        ? `Waiting on: ${activeDeps.join(', ')}`
        : 'No dependencies — ready to run',
    };

    jobResults.push(result);
    console.log(`  ✅ ${agent.label} — queued (job ID: ${job.id})`);
  }

  // Print summary table
  console.log('\n── Pipeline Job Summary ─────────────────────────────────');
  console.table(
    jobResults.map(r => ({
      Agent: r.job_name,
      Status: r.status,
      'Job ID': r.job_id || '—',
      Notes: r.notes,
    }))
  );
  console.log('─────────────────────────────────────────────────────────\n');

  return jobResults;
}

// ── Stage enqueue (v3) ────────────────────────────────────────────────────────

/**
 * Enqueues only the agents belonging to a specific stage.
 * Used by the bot to advance the pipeline one stage at a time.
 *
 * @param {object} payload - full campaign payload
 * @param {string[]} agentNames - list of agent names to enqueue (from STAGES)
 */
async function enqueueStage(payload, agentNames) {
  const {
    task_name,
    task_date,
    project_dir,
    skip_research = false,
    skip_image = false,
    skip_video = false,
    platform_targets = ['instagram', 'youtube'],
    source_folder = null,
  } = payload;

  // Resolve video agents based on video_mode / video_quick / video_pro flags
  let resolvedNames = [...agentNames];
  if (agentNames.includes('video_quick')) {
    const wantQuick = payload.video_quick !== false && payload.video_mode !== 'pro';
    const wantPro = payload.video_pro === true || payload.video_mode === 'pro' || payload.video_mode === 'both';

    // Replace the default video_quick entry with what's actually requested
    resolvedNames = resolvedNames.filter(a => a !== 'video_quick');
    if (wantQuick) resolvedNames.push('video_quick');
    if (wantPro) resolvedNames.push('video_pro');

    if (wantQuick && wantPro) console.log('  [video] Running both video_quick + video_pro');
    else if (wantPro) console.log('  [video] Running video_pro only');
    else if (wantQuick) console.log('  [video] Running video_quick');
  }

  const stageAgentDefs = AGENTS.filter(a => resolvedNames.includes(a.name));
  const jobResults = [];

  for (const agent of stageAgentDefs) {
    // Platform agents: skip if not in platform_targets
    if (agent.platformFlag && !platform_targets.includes(agent.platformFlag)) {
      console.log(`  ⏭  ${agent.label} — not in platform_targets`);
      continue;
    }

    const isSkipped = agent.skippable && agent.skipFlag && payload[agent.skipFlag];
    if (isSkipped) {
      console.log(`  ⏭  ${agent.label} — skipped`);
      continue;
    }

    const jobData = {
      ...payload,
      agent: agent.name,
      task_name,
      task_date,
      platform_targets,
      source_folder,
      skip_research,
      skip_image,
      skip_video,
      dependencies: agent.dependencies,
      project_dir,
      output_dir: payload.output_dir || `${project_dir}/outputs/${task_name}`,
    };

    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    };

    const job = await pipelineQueue.add(agent.name, jobData, jobOptions);
    jobResults.push({ job_name: agent.name, job_id: job.id });
    console.log(`  ✅ ${agent.label} — queued (job ID: ${job.id})`);
  }

  return jobResults;
}

// ── CLI entrypoint ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  let payload;

  // Accept --payload '{"..."}' or --file path/to/payload.json
  if (args.includes('--payload')) {
    const raw = args[args.indexOf('--payload') + 1];
    payload = JSON.parse(raw);
  } else if (args.includes('--file')) {
    const filePath = path.resolve(args[args.indexOf('--file') + 1]);
    payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    console.error('Usage: node orchestrator.js --payload \'{"task_name":...}\' or --file payload.json');
    process.exit(1);
  }

  // Validate before enqueuing
  const errors = validatePayload(payload);
  if (errors.length > 0) {
    console.error('\n❌ Payload validation failed:');
    errors.forEach(e => console.error(`   - ${e}`));
    process.exit(1);
  }

  await enqueueJobs(payload);
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Orchestrator error:', err);
    process.exit(1);
  });
} else {
  // Module mode — used by bot.js for v3 stage-by-stage execution
  module.exports = { enqueueStage, STAGES, validatePayload };
}
