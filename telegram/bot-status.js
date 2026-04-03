const fs = require('fs');
const path = require('path');

function registerStatusCommand(bot, deps) {
  const { projectRoot, session } = deps;

  bot.command('status', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (!s.runningTask) {
      return ctx.reply('Nenhum pipeline rodando no momento.');
    }

    const logsDir = path.join(projectRoot, s.runningTask.outputDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      return ctx.reply(
        `Pipeline: <code>${s.runningTask.taskName}</code>\n`
        + `Iniciado: ${s.runningTask.startedAt}\n`
        + 'Status: aguardando inicio dos agentes...',
        { parse_mode: 'HTML' },
      );
    }

    const stageAgents = {
      1: { name: 'Brief & Narrativa', agents: ['research_agent', 'creative_director', 'copywriter_agent'] },
      2: { name: 'Imagens', agents: ['ad_creative_designer'] },
      3: { name: 'Video', agents: ['video_quick', 'video_pro'] },
      4: { name: 'Plataformas', agents: ['platform_instagram', 'platform_youtube', 'platform_tiktok', 'platform_facebook', 'platform_threads', 'platform_linkedin'] },
      5: { name: 'Distribuicao', agents: ['distribution_agent'] },
    };

    function agentStatus(agentName) {
      const logFile = path.join(logsDir, `${agentName}.log`);
      if (!fs.existsSync(logFile)) return null;
      const content = fs.readFileSync(logFile, 'utf-8');
      const logLines = content.split('\n').filter((line) => line.trim());
      const tail = logLines.slice(-5).join('\n');
      if (tail.includes('Completed successfully')) return '✅';
      if (tail.includes('FAILED') && !tail.includes('Invoking Claude')) return '❌';
      if (tail.includes('Invoking Claude') || tail.includes('Phase')) return '▶️';
      return '🔄';
    }

    const rerunStages = s.runningTask?.rerunStages || null;
    const videoMode = s.runningTask?.videoMode || '';
    const rerunMaxStage = rerunStages ? Math.max(...rerunStages) : 0;
    const isRerun = !!s.runningTask?.rerun;
    const lines = [];

    for (const [stageNum, stage] of Object.entries(stageAgents)) {
      const num = Number(stageNum);
      let stageLabel = stage.name;
      if (num === 3 && videoMode) stageLabel += ` (${videoMode})`;

      const agentLines = [];
      let hasAnyLog = false;
      for (const agent of stage.agents) {
        if (num === 3) {
          if (agent === 'video_quick' && videoMode === 'Pro') continue;
          if (agent === 'video_pro' && videoMode === 'Quick') continue;
        }
        const status = agentStatus(agent);
        if (status) {
          hasAnyLog = true;
          agentLines.push(`    ${agent}: ${status}`);
        }
      }

      if (isRerun && rerunStages && !rerunStages.includes(num) && num > rerunMaxStage) {
        continue;
      }

      let stageIcon = '⬜';
      if (hasAnyLog) {
        const allDone = agentLines.every((line) => line.includes('✅'));
        const anyFail = agentLines.some((line) => line.includes('❌'));
        const anyRunning = agentLines.some((line) => line.includes('▶️') || line.includes('🔄'));
        if (allDone) stageIcon = '✅';
        else if (anyFail) stageIcon = '❌';
        else if (anyRunning) stageIcon = '▶️';
      } else if (rerunStages && rerunStages.includes(num)) {
        stageIcon = '⏳';
      }

      lines.push(`${stageIcon} <b>${num}. ${stageLabel}</b>`);

      const isStartedOrDone = hasAnyLog || stageIcon === '✅' || stageIcon === '❌' || stageIcon === '⏳';
      if (!isStartedOrDone) continue;

      for (const agent of stage.agents) {
        if (num === 3) {
          if (agent === 'video_quick' && videoMode === 'Pro') continue;
          if (agent === 'video_pro' && videoMode === 'Quick') continue;
        }
        const status = agentStatus(agent);
        lines.push(`    ${status || '⬜'} ${agent}`);
      }

      if (num === 3) {
        appendVideoPhaseLines(lines, logsDir, stageIcon, videoMode);
      }

      if (num === 2 && (hasAnyLog || stageIcon !== '⬜')) {
        appendImagePhaseLines(lines, logsDir);
      }
    }

    const cv = s.campaignV3;
    let approvalStatus = '';
    if (cv?.pendingApproval) {
      const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
      approvalStatus = `\n⏳ <b>Aprovacao pendente — Etapa ${cv.pendingApproval.stage}: ${stageLabels[cv.pendingApproval.stage] || ''}</b>`;
    }

    const rerunInfo = s.runningTask?.rerun ? '\n🔄 <i>Reprocessamento</i>' : '';

    await ctx.reply(
      `<b>Pipeline: ${s.runningTask.taskName}</b>${rerunInfo}\n`
      + `Iniciado: ${s.runningTask.startedAt}`
      + approvalStatus
      + '\n\n'
      + lines.join('\n'),
      { parse_mode: 'HTML' },
    );
  });
}

function appendVideoPhaseLines(lines, logsDir, stageIcon, videoMode) {
  const quickPhaseList = ['Scene plan', 'Aprovacao', 'Render final', 'Completo'];
  const proPhaseList = [
    'Narracao', 'Timing audio', 'Dir. Fotografia', 'Scene plan',
    'Validacao tipografica', 'Gerando imagens', 'Aprovacao',
    'Render final', 'Completo',
  ];
  const videoLogs = [
    { file: 'video_quick.log', label: 'Quick', allPhases: quickPhaseList },
    { file: 'video_pro.log', label: 'Pro', allPhases: proPhaseList },
  ];
  const phaseMarkers = [
    { key: 'Generating narration', label: 'Narracao', icon: '▶️' },
    { key: 'Narration already exists', label: 'Narracao', icon: '✅' },
    { key: 'Narration generated', label: 'Narracao', icon: '✅' },
    { key: 'Analyzing narration audio', label: 'Timing audio', icon: '▶️' },
    { key: 'Audio timing:', label: 'Timing audio', icon: '✅' },
    { key: 'Photography Director', label: 'Dir. Fotografia', icon: '▶️' },
    { key: 'Photography plan created', label: 'Dir. Fotografia', icon: '✅' },
    { key: 'Photography plan already exists', label: 'Dir. Fotografia', icon: '✅' },
    { key: 'Creating scene plan', label: 'Scene plan', icon: '▶️' },
    { key: 'Scene plan saved', label: 'Scene plan', icon: '✅' },
    { key: 'Typography validation', label: 'Validacao tipografica', icon: '▶️' },
    { key: 'typography fixes applied', label: 'Validacao tipografica', icon: '✅' },
    { key: 'No typography fixes', label: 'Validacao tipografica', icon: '✅' },
    { key: 'Generating image', label: 'Gerando imagens', icon: '▶️' },
    { key: 'Updated plan with', label: 'Gerando imagens', icon: '✅' },
    { key: '[VIDEO_APPROVAL_NEEDED] Waiting', label: 'Aprovacao', icon: '🔄' },
    { key: 'Starting video render', label: 'Render final', icon: '▶️' },
    { key: 'render_start', label: 'Render final', icon: '▶️' },
    { key: 'Video 1 rendered', label: 'Render final', icon: '✅' },
    { key: 'Completed successfully', label: 'Completo', icon: '✅' },
  ];

  for (const videoLog of videoLogs) {
    if (videoLog.label === 'Quick' && videoMode === 'Pro') continue;
    if (videoLog.label === 'Pro' && videoMode === 'Quick') continue;

    const vLog = path.join(logsDir, videoLog.file);
    const content = fs.existsSync(vLog) ? fs.readFileSync(vLog, 'utf-8') : '';
    const phaseStatus = new Map();
    for (const marker of phaseMarkers) {
      if (content.includes(marker.key)) phaseStatus.set(marker.label, marker.icon);
    }
    if (phaseStatus.get('Completo') === '✅') phaseStatus.delete('Aprovacao');

    if (content.length > 0 || stageIcon === '▶️' || stageIcon === '🔄') {
      lines.push(`      <i>${videoLog.label}:</i>`);
      for (const phase of videoLog.allPhases) {
        lines.push(`      ${phaseStatus.get(phase) || '⬜'} ${phase}`);
      }
    }
  }
}

function appendImagePhaseLines(lines, logsDir) {
  const adLog = path.join(logsDir, 'ad_creative_designer.log');
  const content = fs.existsSync(adLog) ? fs.readFileSync(adLog, 'utf-8') : '';
  const imgPhases = [
    'Gerar prompts', 'Gerar imagens', 'Aprovacao imagens',
    'Montar criativos', 'Validacao aspect ratio', 'Completo',
  ];
  const imgMarkers = [
    { key: 'prompt', label: 'Gerar prompts', icon: '▶️' },
    { key: 'Generating image', label: 'Gerar imagens', icon: '▶️' },
    { key: 'Image generated', label: 'Gerar imagens', icon: '✅' },
    { key: 'approval', label: 'Aprovacao imagens', icon: '🔄' },
    { key: 'approved', label: 'Aprovacao imagens', icon: '✅' },
    { key: 'Rendering HTML', label: 'Montar criativos', icon: '▶️' },
    { key: 'Screenshot saved', label: 'Montar criativos', icon: '✅' },
    { key: 'aspect ratio', label: 'Validacao aspect ratio', icon: '✅' },
    { key: 'Completed successfully', label: 'Completo', icon: '✅' },
  ];
  const imgStatus = new Map();
  for (const marker of imgMarkers) {
    if (content.includes(marker.key)) imgStatus.set(marker.label, marker.icon);
  }
  for (const phase of imgPhases) {
    lines.push(`      ${imgStatus.get(phase) || '⬜'} ${phase}`);
  }
}

module.exports = { registerStatusCommand };
