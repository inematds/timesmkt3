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

const fs = require('fs');
const path = require('path');

let pipelineQueueRef = null;

function getPipelineQueue() {
  if (!pipelineQueueRef) {
    ({ pipelineQueue: pipelineQueueRef } = require('./queues'));
  }

  return pipelineQueueRef;
}

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
    dependencies: ['video_quick', 'video_pro', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'youtube',
  },
  {
    name: 'platform_tiktok',
    label: 'TikTok Agent',
    dependencies: ['video_quick', 'video_pro', 'copywriter_agent'],
    skippable: true,
    platformFlag: 'tiktok',
  },
  {
    name: 'platform_facebook',
    label: 'Facebook Agent',
    dependencies: ['ad_creative_designer', 'video_quick', 'video_pro', 'copywriter_agent'],
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

function hasGeneratedAdAssets(payload, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const outputDir = payload.output_dir || `${payload.project_dir}/outputs/${payload.task_name}`;
  const adsDir = path.resolve(projectRoot, outputDir, 'ads');
  if (!fs.existsSync(adsDir)) return false;
  return fs.readdirSync(adsDir).some((file) => /\.(png|jpg|jpeg)$/i.test(file));
}

function getRequestedVideoAgents(payload, options = {}) {
  let wantQuick = payload.video_quick !== false;
  const wantPro = payload.video_pro === true || payload.video_mode === 'pro' || payload.video_mode === 'both';
  if (payload.skip_image && wantQuick && !hasGeneratedAdAssets(payload, options)) {
    wantQuick = false;
  }
  return {
    wantQuick,
    wantPro,
    active: [
      ...(wantQuick ? ['video_quick'] : []),
      ...(wantPro ? ['video_pro'] : []),
    ],
  };
}

function getEnabledAgents(payload = {}) {
  const enabled = new Set();
  const { wantQuick, wantPro } = getRequestedVideoAgents(payload);
  const platformTargets = Array.isArray(payload.platform_targets) ? payload.platform_targets : [];

  for (const agent of AGENTS) {
    if (agent.platformFlag && platformTargets.length > 0 && !platformTargets.includes(agent.platformFlag)) {
      continue;
    }

    if (agent.name === 'video_quick' && !wantQuick) continue;
    if (agent.name === 'video_pro' && !wantPro) continue;
    if (agent.skippable && agent.skipFlag && payload[agent.skipFlag]) continue;

    enabled.add(agent.name);
  }

  return enabled;
}

function resolveDependencies(payload, dependencies = []) {
  const enabled = getEnabledAgents(payload);
  return dependencies.filter(dep => enabled.has(dep));
}

function validateAgentGraph(agents = AGENTS) {
  const knownAgents = new Set(agents.map(agent => agent.name));
  const errors = [];

  for (const agent of agents) {
    for (const dep of agent.dependencies || []) {
      if (!knownAgents.has(dep)) {
        errors.push(`Agent "${agent.name}" depends on unknown agent "${dep}"`);
      }
    }
  }

  return errors;
}

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

function buildFallbackResearchArtifacts(payload, sourceFolder) {
  const sourceAssets = fs.existsSync(sourceFolder)
    ? fs.readdirSync(sourceFolder).filter((name) => !name.startsWith('.')).slice(0, 20)
    : [];
  const campaignLabel = String(payload.task_name || 'campanha').replace(/[_-]+/g, ' ').trim();
  const campaignBrief = payload.campaign_brief || payload.description || `Campanha ${campaignLabel}`;
  const platformTargets = Array.isArray(payload.platform_targets) && payload.platform_targets.length > 0
    ? payload.platform_targets
    : ['instagram'];
  const primaryPlatform = platformTargets[0];
  const approvedCtas = [
    'Saiba mais',
    'Conheça a campanha',
    'Acesse agora',
  ];

  const researchResults = {
    simulated: true,
    generated_from: 'skip_research',
    task_name: payload.task_name,
    task_date: payload.task_date,
    source_folder: sourceFolder,
    source_assets: sourceAssets,
    summary: `Pesquisa simulada a partir do briefing e dos assets disponíveis para ${campaignLabel}.`,
    industry_trends: [
      `Conteúdo orientado a ${campaignLabel} com foco em relevância prática e aplicação imediata.`,
      'Materiais visuais e narrativas curtas tendem a performar melhor em social.',
      'A clareza do benefício e o CTA direto são mais importantes que volume de informação.',
    ],
    audience_insights: [
      `O público precisa entender rapidamente o valor central de ${campaignLabel}.`,
      'Tom humano, claro e orientado a resultado reduz fricção na primeira interação.',
      'Provas visuais, contexto real e consistência de marca aumentam confiança.',
    ],
    competitor_gaps: [
      'Mensagens genéricas e pouco conectadas ao briefing real do produto.',
      'Excesso de promessa sem evidência visual ou contextual.',
      'CTAs fracos ou desconectados da proposta principal.',
    ],
    emotional_hooks: [
      'clareza',
      'pertencimento',
      'transformação prática',
    ],
    winning_angles: [
      campaignBrief,
      `Mostrar ${campaignLabel} com benefício direto e linguagem simples.`,
      `Usar ${primaryPlatform} como canal principal para narrativa curta e clara.`,
    ],
    content_topics: [
      `${campaignLabel} explicado de forma objetiva`,
      'prova visual do benefício',
      'CTA orientado à ação',
    ],
    keywords: [
      payload.task_name,
      campaignLabel,
      primaryPlatform,
      'campanha',
      'conteúdo',
    ].filter(Boolean),
    ad_hooks: [
      `O que torna ${campaignLabel} diferente?`,
      `A forma mais clara de apresentar ${campaignLabel}.`,
      'Menos ruído, mais valor percebido.',
    ],
    video_concepts: [
      {
        title: `${campaignLabel} em 15 segundos`,
        hook: `Mostrar o benefício central de ${campaignLabel} logo na abertura.`,
        platform: primaryPlatform,
        duration: 15,
      },
      {
        title: `${campaignLabel} com prova visual`,
        hook: 'Usar assets reais para reforçar credibilidade.',
        platform: primaryPlatform,
        duration: 30,
      },
    ],
    scheduling: {
      best_days: ['terça', 'quarta', 'quinta'],
      best_times: ['09:00', '12:00', '19:00'],
    },
  };

  const creativeBrief = {
    simulated: true,
    generated_from: 'skip_research',
    campaign_theme: campaignLabel,
    campaign_angle: campaignBrief,
    positioning_statement: `${campaignLabel} apresentado com clareza, foco em benefício e linguagem alinhada à marca.`,
    emotional_hook: 'clareza prática com apelo humano',
    visual_direction: {
      mood: 'premium, claro e direto',
      dominant_colors: ['#0D0D0D', '#0099FF'],
      photography_style: sourceAssets.length > 0 ? 'usar assets reais disponíveis como base visual' : 'lifestyle e produto com composição limpa',
      typography_mood: 'bold e legível',
      key_visual_metaphor: 'transformação visível com benefício em destaque',
    },
    carousel_structure: {
      slide_1: {
        tema: 'hook',
        conceito_visual: `Hero frame introducing ${campaignLabel}, bold typography, premium contrast lighting.`,
        mensagem: `Apresentar ${campaignLabel} com impacto imediato.`,
      },
      slide_2: {
        tema: 'benefit',
        conceito_visual: 'Focused product or interface detail, clean composition, benefit highlighted with depth.',
        mensagem: 'Mostrar o benefício central de forma objetiva.',
      },
      slide_3: {
        tema: 'benefit',
        conceito_visual: 'Lifestyle or contextual usage scene, natural motion and strong subject framing.',
        mensagem: 'Conectar o produto ao uso real.',
      },
      slide_4: {
        tema: 'proof',
        conceito_visual: 'Trust-building scene with social proof or concrete result, premium editorial look.',
        mensagem: 'Adicionar prova, contexto ou resultado.',
      },
      slide_5: {
        tema: 'cta',
        conceito_visual: 'Brand-led closing frame with clean CTA area and strong contrast.',
        mensagem: 'Fechar com CTA direto e coerente.',
      },
    },
    key_messages: {
      instagram: [
        `Apresentar ${campaignLabel} com clareza`,
        'Destacar benefício visualmente',
        'Fechar com CTA simples',
      ],
      youtube: [
        `Explicar ${campaignLabel} com contexto`,
        'Mostrar problema, solução e prova',
        'Encerrar com CTA objetivo',
      ],
      threads: [
        `Resumo curto de ${campaignLabel}`,
        'Tom humano e conversacional',
      ],
    },
    approved_ctas: approvedCtas,
    avoid: [
      'mensagem genérica',
      'excesso de texto por peça',
      'CTA desconectado do briefing',
    ],
  };

  const researchBriefMd = `# Research Brief Simulado — ${campaignLabel}

## Contexto
Pesquisa simulada porque \`skip_research\` foi ativado.

## Base usada
- Brief: ${campaignBrief}
- Fonte de assets: \`${sourceFolder}\`
- Plataformas: ${platformTargets.join(', ')}

## Principais insights
- Clareza do benefício precisa vir antes de detalhe técnico.
- Assets reais e consistência visual aumentam confiança.
- CTA curto e explícito tende a funcionar melhor que mensagens longas.
`;

  const creativeBriefMd = `# Brief Criativo — ${campaignLabel}

## Ângulo da Campanha
${campaignBrief}

## Direção Visual
- Mood: ${creativeBrief.visual_direction.mood}
- Fotografia: ${creativeBrief.visual_direction.photography_style}
- Tipografia: ${creativeBrief.visual_direction.typography_mood}

## CTAs Aprovados
- ${approvedCtas.join('\n- ')}

## O que evitar
- ${creativeBrief.avoid.join('\n- ')}
`;

  const interactiveReportHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Research Report Simulado — ${campaignLabel}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #0d0d0d; color: #fff; padding: 32px; }
    .card { max-width: 860px; margin: 0 auto; background: #171717; border: 1px solid #2a2a2a; border-radius: 16px; padding: 24px; }
    h1 { margin-top: 0; color: #0099FF; }
    code { color: #00d084; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Research Report Simulado</h1>
    <p>Este relatório foi gerado automaticamente porque <code>skip_research</code> está ativo.</p>
    <p><strong>Campanha:</strong> ${campaignLabel}</p>
    <p><strong>Base:</strong> ${campaignBrief}</p>
    <p><strong>Assets:</strong> ${sourceAssets.length > 0 ? sourceAssets.join(', ') : 'nenhum asset listado'}</p>
  </div>
</body>
</html>`;

  return {
    researchResults,
    creativeBrief,
    researchBriefMd,
    creativeBriefMd,
    interactiveReportHtml,
  };
}

function ensureSkippedResearchArtifacts(payload, options = {}) {
  if (!payload?.skip_research) return null;

  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const outputDir = payload.output_dir || `${payload.project_dir}/outputs/${payload.task_name}`;
  const absOutputDir = path.resolve(projectRoot, outputDir);
  const sourceFolder = payload.source_folder
    ? path.resolve(projectRoot, payload.source_folder)
    : path.resolve(projectRoot, payload.project_dir, 'assets', payload.task_name);

  fs.mkdirSync(absOutputDir, { recursive: true });
  fs.mkdirSync(path.join(absOutputDir, 'creative'), { recursive: true });

  const artifacts = buildFallbackResearchArtifacts(payload, sourceFolder);
  const writes = [
    ['research_results.json', JSON.stringify(artifacts.researchResults, null, 2)],
    ['research_brief.md', artifacts.researchBriefMd],
    ['interactive_report.html', artifacts.interactiveReportHtml],
    [path.join('creative', 'creative_brief.json'), JSON.stringify(artifacts.creativeBrief, null, 2)],
    [path.join('creative', 'creative_brief.md'), artifacts.creativeBriefMd],
    [path.join('creative', 'stage1_done.json'), JSON.stringify({ stage: 1, simulated: true, output_dir: outputDir, ts: Date.now() }, null, 2)],
  ];

  const created = [];
  for (const [relativePath, content] of writes) {
    const target = path.join(absOutputDir, relativePath);
    if (fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    created.push(relativePath);
  }

  return { outputDir, sourceFolder, created };
}

function ensureSkippedImageArtifacts(payload, options = {}) {
  if (!payload?.skip_image) return null;

  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const outputDir = payload.output_dir || `${payload.project_dir}/outputs/${payload.task_name}`;
  const adsDir = path.resolve(projectRoot, outputDir, 'ads');
  fs.mkdirSync(adsDir, { recursive: true });

  const writes = [
    [
      'layout.json',
      JSON.stringify({
        simulated: true,
        generated_from: 'skip_image',
        task_name: payload.task_name,
        note: 'Nenhum criativo estático foi renderizado porque skip_image está ativo.',
        images: [],
      }, null, 2),
    ],
    [
      'skip_image.json',
      JSON.stringify({
        simulated: true,
        output_dir: outputDir,
        ts: Date.now(),
        reason: 'skip_image ativo',
      }, null, 2),
    ],
  ];

  const created = [];
  for (const [relativePath, content] of writes) {
    const target = path.join(adsDir, relativePath);
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, content);
    created.push(path.join('ads', relativePath));
  }

  return { outputDir, created };
}

function ensureSkippedVideoArtifacts(payload, options = {}) {
  if (!payload?.skip_video) return null;

  const projectRoot = options.projectRoot || path.resolve(__dirname, '..');
  const outputDir = payload.output_dir || `${payload.project_dir}/outputs/${payload.task_name}`;
  const videoDir = path.resolve(projectRoot, outputDir, 'video');
  fs.mkdirSync(videoDir, { recursive: true });

  const writes = [
    [
      'skip_video.json',
      JSON.stringify({
        simulated: true,
        output_dir: outputDir,
        ts: Date.now(),
        reason: 'skip_video ativo',
        videos: [],
      }, null, 2),
    ],
  ];

  const created = [];
  for (const [relativePath, content] of writes) {
    const target = path.join(videoDir, relativePath);
    if (fs.existsSync(target)) continue;
    fs.writeFileSync(target, content);
    created.push(path.join('video', relativePath));
  }

  return { outputDir, created };
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

  if (skip_research) {
    const result = ensureSkippedResearchArtifacts(payload);
    if (result?.created?.length) {
      console.log(`  🧩 skip_research fallback prepared: ${result.created.join(', ')}`);
    }
  }
  if (skip_image) {
    const result = ensureSkippedImageArtifacts(payload);
    if (result?.created?.length) {
      console.log(`  🧩 skip_image fallback prepared: ${result.created.join(', ')}`);
    }
  }
  if (skip_video) {
    const result = ensureSkippedVideoArtifacts(payload);
    if (result?.created?.length) {
      console.log(`  🧩 skip_video fallback prepared: ${result.created.join(', ')}`);
    }
  }

  // Resolve video agents based on video_quick / video_pro flags
  const { wantQuick, wantPro } = getRequestedVideoAgents(payload);
  if (!skip_video) {
    if (wantQuick && wantPro) console.log('  [video] Running both video_quick + video_pro');
    else if (wantPro) console.log('  [video] Running video_pro only');
    else if (wantQuick) console.log('  [video] Running video_quick');
    else console.log('  [video] No video agents active after skip/fallback rules');
  }

  for (const agent of AGENTS) {
    // Platform agents: skip if not in platform_targets
    if (agent.platformFlag && !platform_targets.includes(agent.platformFlag)) {
      skippedJobs.add(agent.name);
      console.log(`  ⏭  ${agent.label} — not in platform_targets`);
      continue;
    }

    // Video mode filtering: respect video_quick / video_pro flags
    if (agent.name === 'video_quick' && !wantQuick && !skip_video) {
      skippedJobs.add(agent.name);
      console.log(`  ⏭  ${agent.label} — disabled via video_quick: false`);
      continue;
    }
    if (agent.name === 'video_pro' && !wantPro && !skip_video) {
      skippedJobs.add(agent.name);
      console.log(`  ⏭  ${agent.label} — not requested`);
      continue;
    }

    const isSkipped = agent.skippable && agent.skipFlag && payload[agent.skipFlag];

    // Mark dependencies as skipped so downstream agents can adjust
    const activeDeps = resolveDependencies(payload, agent.dependencies).filter(dep => !skippedJobs.has(dep));

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

    const job = await getPipelineQueue().add(agent.name, jobData, jobOptions);

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
  if (skip_research) {
    ensureSkippedResearchArtifacts(payload);
  }
  if (skip_image) {
    ensureSkippedImageArtifacts(payload);
  }
  if (skip_video) {
    ensureSkippedVideoArtifacts(payload);
  }

  let resolvedNames = [...agentNames];
  if (agentNames.includes('video_quick')) {
    // Quick always runs unless explicitly disabled; Pro runs when requested
    const { wantQuick, wantPro } = getRequestedVideoAgents(payload);

    // Replace the default video_quick entry with what's actually requested
    resolvedNames = resolvedNames.filter(a => a !== 'video_quick');
    if (wantQuick) resolvedNames.push('video_quick');
    if (wantPro) resolvedNames.push('video_pro');

    if (wantQuick && wantPro) console.log('  [video] Running both video_quick + video_pro');
    else if (wantPro) console.log('  [video] Running video_pro only');
    else if (wantQuick) console.log('  [video] Running video_quick');
    else console.log('  [video] No video agents active after skip/fallback rules');
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
      dependencies: resolveDependencies(payload, agent.dependencies),
      project_dir,
      output_dir: payload.output_dir || `${project_dir}/outputs/${task_name}`,
    };

    const jobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: false,
      removeOnFail: false,
    };

    const job = await getPipelineQueue().add(agent.name, jobData, jobOptions);
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

  const graphErrors = validateAgentGraph();
  if (graphErrors.length > 0) {
    console.error('\n❌ Agent graph validation failed:');
    graphErrors.forEach(e => console.error(`   - ${e}`));
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
  module.exports = {
    enqueueStage,
    STAGES,
    validatePayload,
    validateAgentGraph,
    ensureSkippedResearchArtifacts,
    ensureSkippedImageArtifacts,
    ensureSkippedVideoArtifacts,
  };
}
