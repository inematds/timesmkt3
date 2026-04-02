const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

function registerOperationalCommands(bot, deps) {
  const {
    projectRoot,
    session,
    escapeHtml,
    findCampaign,
    findCampaignAcrossProjects,
  } = deps;

  bot.command('fix', async (ctx) => {
    const description = ctx.match?.trim();
    if (!description) {
      return ctx.reply(
        'Use: /fix <descricao do problema>\n\n'
          + 'Exemplos:\n'
          + '<code>/fix o brief esta sendo cortado no card de confirmacao</code>\n'
          + '<code>/fix adicionar suporte a reels no gerador de imagens</code>\n'
          + '<code>/fix o video nao segue o timing do audio</code>',
        { parse_mode: 'HTML' },
      );
    }

    const chatId = String(ctx.chat.id);

    await ctx.reply(
      `Entendido. Vou analisar e corrigir:\n\n<i>"${description}"</i>\n\nAguarde — isso pode levar alguns minutos...`,
      { parse_mode: 'HTML' },
    );

    const claudePath = '/home/nmaldaner/.local/bin/claude';
    const prompt = `You are Claude Code working on the ITAGMKT social media automation project at ${projectRoot}.

Task: ${description}

Instructions:
- Read the relevant files first to understand the current code
- Make the necessary fixes
- Do NOT run the pipeline or start any long-running processes
- Do NOT restart the bot
- After making changes, run: git diff --stat to confirm what changed
- Keep changes minimal and focused on the reported issue`;

    const child = spawn(claudePath, [
      '-p', prompt,
      '--dangerously-skip-permissions',
      '--model', 'sonnet',
    ], {
      cwd: projectRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const ping = setInterval(() => {
      ctx.api.sendChatAction(chatId, 'typing').catch(() => {});
    }, 30000);

    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 600000);

    child.on('error', (err) => {
      clearInterval(ping);
      clearTimeout(timeout);
      ctx.reply(`Erro ao iniciar Claude: ${err.message}`);
    });

    child.on('close', async (code) => {
      clearInterval(ping);
      clearTimeout(timeout);

      let diffSummary = '';
      try {
        diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD'], {
          cwd: projectRoot, encoding: 'utf-8',
        }).trim();
        if (!diffSummary) {
          diffSummary = execFileSync('git', ['diff', '--stat'], {
            cwd: projectRoot, encoding: 'utf-8',
          }).trim();
        }
      } catch {}

      if (code !== 0) {
        const errSnippet = stderr.slice(-500) || stdout.slice(-500);
        return ctx.reply(
          `Correcao falhou (exit ${code}).\n\n<pre>${escapeHtml(errSnippet)}</pre>`,
          { parse_mode: 'HTML' },
        );
      }

      const lines = ['✅ <b>Correcao concluida</b>'];
      if (diffSummary) {
        lines.push(`\n<b>Arquivos alterados:</b>\n<pre>${escapeHtml(diffSummary)}</pre>`);
      } else {
        lines.push('\nNenhum arquivo alterado — pode ser que ja estava correto.');
      }

      const outputLines = stdout.split('\n').filter((line) => line.trim() && !line.startsWith('{') && !line.startsWith('['));
      const summary = outputLines.slice(-8).join('\n').trim();
      if (summary) {
        lines.push(`\n<b>Resumo:</b>\n<pre>${escapeHtml(summary.slice(0, 800))}</pre>`);
      }

      const botChanged = diffSummary.includes('bot.js') || diffSummary.includes('session.js');
      if (botChanged) {
        lines.push('\n<i>bot.js foi alterado — reiniciando em 3s...</i>');
      }

      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

      if (botChanged) {
        setTimeout(() => {
          spawn('node', ['telegram/bot.js'], {
            cwd: projectRoot,
            detached: true,
            stdio: 'ignore',
            env: { ...process.env },
          }).unref();
          process.exit(0);
        }, 3000);
      }
    });
  });

  bot.command('arquivar', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);
    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply('Use: <code>/arquivar c34</code>', { parse_mode: 'HTML' });
    }

    const campaignFolder = findCampaign(projectRoot, s.projectDir, raw) || (() => {
      const result = findCampaignAcrossProjects(projectRoot, raw);
      return result ? result.campaignFolder : null;
    })();

    if (!campaignFolder) {
      return ctx.reply(`Campanha "${raw}" não encontrada.`);
    }

    const projectDir = findCampaignAcrossProjects(projectRoot, raw)?.projectDir || s.projectDir;
    const campDir = path.resolve(projectRoot, projectDir, 'outputs', campaignFolder);
    fs.writeFileSync(path.join(campDir, 'archived.json'), JSON.stringify({ archived: true, ts: new Date().toISOString() }));
    await ctx.reply(`📦 <b>${campaignFolder}</b> arquivada — não aparecerá mais no startup.`, { parse_mode: 'HTML' });
  });

  bot.command('desarquivar', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);
    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply('Use: <code>/desarquivar c34</code>', { parse_mode: 'HTML' });
    }

    const campaignFolder = findCampaign(projectRoot, s.projectDir, raw) || (() => {
      const result = findCampaignAcrossProjects(projectRoot, raw);
      return result ? result.campaignFolder : null;
    })();

    if (!campaignFolder) {
      return ctx.reply(`Campanha "${raw}" não encontrada.`);
    }

    const projectDir = findCampaignAcrossProjects(projectRoot, raw)?.projectDir || s.projectDir;
    const campDir = path.resolve(projectRoot, projectDir, 'outputs', campaignFolder);
    const archivePath = path.join(campDir, 'archived.json');
    if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
    await ctx.reply(`📂 <b>${campaignFolder}</b> desarquivada.`, { parse_mode: 'HTML' });
  });

  bot.command('modos', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const cv = session.getCampaignV3(chatId);
    const arg = ctx.match?.trim().toLowerCase();

    if (!cv) {
      await ctx.reply(
        '<b>Modos de aprovação</b>\n\n'
          + 'Use este comando durante uma campanha ativa para ajustar os modos por etapa.\n\n'
          + 'Sintaxe: <code>/modos [etapa] [modo]</code>\n\n'
          + 'Etapas: <code>1</code> (brief), <code>2</code> (criativos), <code>3</code> (vídeo), <code>4</code> (distribuição), <code>todas</code>\n'
          + 'Modos:\n'
          + '  👤 <code>humano</code> — você aprova antes de avançar\n'
          + '  🤖 <code>agente</code> — Agente Revisor decide\n'
          + '  ⚡ <code>auto</code> — avança automaticamente sem aprovação\n\n'
          + 'Exemplos:\n'
          + '<code>/modos todas auto</code> — sem aprovações\n'
          + '<code>/modos 1 humano</code> — só etapa 1 com aprovação humana\n'
          + '<code>/modos notificacoes off</code> — silencia notificações',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const parts = arg ? arg.split(/\s+/) : [];
    const target = parts[0];
    const mode = parts[1];

    if (target === 'notificacoes' || target === 'notificações') {
      cv.notifications = !(mode === 'off' || mode === 'nao' || mode === 'não' || mode === 'false');
      await ctx.reply(`Notificações ${cv.notifications ? 'ativadas ✅' : 'desativadas 🔇'}`);
      return;
    }

    const validModes = ['humano', 'agente', 'auto'];
    if (!target || !mode || !validModes.includes(mode)) {
      await ctx.reply(
        'Use: <code>/modos [1|2|3|4|todas] [humano|agente|auto]</code>\n'
          + 'Ou: <code>/modos notificacoes [on|off]</code>',
        { parse_mode: 'HTML' },
      );
      return;
    }

    const stageMap = { '1': 'stage1', '2': 'stage2', '3': 'stage3', '4': 'stage4', '5': 'stage5' };
    if (target === 'todas' || target === 'all') {
      ['stage1', 'stage2', 'stage3', 'stage4', 'stage5'].forEach((stageKey) => { cv.approvalModes[stageKey] = mode; });
      await ctx.reply(`Todas as etapas definidas como <b>${mode}</b>.`, { parse_mode: 'HTML' });
    } else if (stageMap[target]) {
      cv.approvalModes[stageMap[target]] = mode;
      const stageLabels = {
        stage1: 'Brief & Narrativa',
        stage2: 'Imagens',
        stage3: 'Video',
        stage4: 'Copy Plataforma',
        stage5: 'Distribuicao',
      };
      await ctx.reply(
        `Etapa ${target} (${stageLabels[stageMap[target]]}) definida como <b>${mode}</b>.`,
        { parse_mode: 'HTML' },
      );
    } else {
      await ctx.reply('Etapa invalida. Use 1, 2, 3, 4, 5 ou todas.');
    }
  });
}

function createScanPendingApprovals(deps) {
  const {
    projectRoot,
    bot,
    session,
    scanPendingApprovalsBase,
    sendImageApprovalRequest,
    sendVideoApprovalRequest,
  } = deps;

  return async function scanPendingApprovals(targetChatId, ctx) {
    return scanPendingApprovalsBase({
      projectRoot,
      targetChatId,
      ctx,
      botApi: bot.api,
      session,
      sendImageApprovalRequest: (chatId, outputDir) => sendImageApprovalRequest(null, chatId, outputDir),
      sendVideoApprovalRequest: (chatId, outputDir) => sendVideoApprovalRequest(null, chatId, outputDir),
    });
  };
}

async function resumeInProgressCampaigns(deps, monitoredSignals) {
  const { projectRoot, session, readChatContext } = deps;
  const prjRoot = path.resolve(projectRoot, 'prj');
  if (!fs.existsSync(prjRoot)) return;

  const stageAgentMap = {
    1: ['research_agent', 'creative_director', 'copywriter_agent'],
    2: ['ad_creative_designer'],
    3: ['video_quick', 'video_pro'],
    4: ['platform_instagram', 'platform_youtube', 'platform_tiktok', 'platform_facebook', 'platform_threads', 'platform_linkedin'],
    5: ['distribution_agent'],
  };

  const allCampaigns = [];
  for (const prj of fs.readdirSync(prjRoot)) {
    const outRoot = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outRoot)) continue;
    for (const campaign of fs.readdirSync(outRoot)) {
      const payloadPath = path.join(outRoot, campaign, 'campaign_payload.json');
      try {
        allCampaigns.push({ prj, campaign, mtime: fs.statSync(payloadPath).mtimeMs });
      } catch {}
    }
  }
  allCampaigns.sort((a, b) => b.mtime - a.mtime);

  for (const { prj, campaign } of allCampaigns) {
    const campDir = path.join(prjRoot, prj, 'outputs', campaign);
    const payloadPath = path.join(campDir, 'campaign_payload.json');
    const ctxFile = readChatContext(campDir);
    if (!ctxFile?.chatId || !fs.existsSync(payloadPath)) continue;
    if (fs.existsSync(path.join(campDir, 'archived.json'))) continue;

    try {
      const ageHours = (Date.now() - fs.statSync(payloadPath).mtimeMs) / 3600000;
      if (ageHours > 6) continue;
    } catch {
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
    } catch {
      continue;
    }

    const chatId = ctxFile.chatId;
    const logsDir = path.join(campDir, 'logs');
    if (!fs.existsSync(logsDir)) continue;

    let highestDone = 0;
    let allComplete = true;
    for (let stage = 1; stage <= 5; stage += 1) {
      let agents = stageAgentMap[stage];
      if (stage === 3) {
        agents = [];
        if (payload.video_quick !== false) agents.push('video_quick');
        if (payload.video_pro === true) agents.push('video_pro');
        if (agents.length === 0) agents = ['video_quick'];
      }
      if (stage === 4) {
        const targets = payload.platform_targets || [];
        agents = stageAgentMap[4].filter((agent) => targets.includes(agent.replace('platform_', '')));
      }

      let stageDone = agents.length > 0;
      for (const agent of agents) {
        const logFile = path.join(logsDir, `${agent}.log`);
        if (!fs.existsSync(logFile)) {
          stageDone = false;
          break;
        }
        const tail = fs.readFileSync(logFile, 'utf-8').split('\n').filter((line) => line.trim()).slice(-3).join('\n');
        if (!tail.includes('Completed successfully')) {
          stageDone = false;
          break;
        }
      }
      if (stageDone) {
        highestDone = stage;
      } else {
        allComplete = false;
        break;
      }
    }

    if (allComplete || highestDone === 5) continue;
    if (highestDone === 0 && !fs.readdirSync(logsDir).length) continue;

    console.log(`[resume] Campaign ${campaign} — stage ${highestDone} done, resuming from stage ${highestDone + 1}`);

    const outputDir = `prj/${prj}/outputs/${campaign}`;
    if (monitoredSignals) {
      for (let doneStage = 1; doneStage <= highestDone; doneStage += 1) {
        monitoredSignals.add(`stage_done:${outputDir}:${doneStage}`);
      }
    }

    const existingSession = session.get(chatId);
    if (existingSession?.runningTask) {
      console.log(`[resume] Session already has runningTask (${existingSession.runningTask.taskName}) — skipping ${campaign}`);
      continue;
    }

    const projectDir = `prj/${prj}`;
    session.setProject(chatId, projectDir);
    session.setRunningTask(chatId, {
      taskName: campaign,
      taskDate: payload.task_date,
      outputDir,
      startedAt: payload.started_at || new Date().toISOString(),
    });
    session.setCampaignV3(chatId, {
      outputDir,
      payload,
      approvalModes: payload.approval_modes || {},
      notifications: payload.notifications !== false,
    });
    session.setCampaignV3Stage(chatId, highestDone);
    console.log(`[resume] Restored session for ${campaign} — stage ${highestDone}`);
  }
}

module.exports = {
  createScanPendingApprovals,
  registerOperationalCommands,
  resumeInProgressCampaigns,
};
