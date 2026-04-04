const fs = require('fs');
const path = require('path');
const { normalizeProjectFolder } = require('./bot-rerun');

function createPendingTextHandlers(deps) {
  const {
    projectRoot,
    session,
    bot,
    monitoredSignals,
    ensureWorker,
    stages,
    enqueueStage,
    writeVideoApproval,
    runClaude,
    sendVideoApprovalRequest,
    showCampaignConfirmation,
    parseCampaignFromText,
    runPipelineV3,
    env = process.env,
  } = deps;

  const sourceLabels = {
    brand: 'assets da marca',
    api: 'IA (API)',
    free: 'banco grátis',
    screenshot: 'screenshots',
    folder: 'pasta',
    pasta: 'pasta',
  };

  function normalizeImageSource(raw) {
    const lower = String(raw || '').trim().toLowerCase();
    const aliases = { marca: 'brand', gratis: 'free', stock: 'free', captura: 'screenshot', capturas: 'screenshot', pasta: 'folder' };
    return aliases[lower] || lower || 'brand';
  }

  function describePendingRerun(payload, rerunStages) {
    const stageLabels = { 1: 'Brief', 2: 'Imagens', 3: 'Vídeo', 4: 'Plataformas', 5: 'Distribuição' };
    const stageText = rerunStages.map((n) => stageLabels[n] || `Etapa ${n}`).join(', ');
    const source = normalizeImageSource(payload.image_source);
    const lines = [
      `Reprocessamento: <b>${payload.task_name}</b>`,
      `Etapas: ${stageText}`,
      `Fonte de imagens: <b>${sourceLabels[source] || source}</b>`,
    ];
    if (source === 'folder' && payload.image_folder) {
      lines.push(`Pasta: <code>${payload.image_folder}</code>`);
    }
    if (source === 'screenshot' && Array.isArray(payload.screenshot_urls) && payload.screenshot_urls.length > 0) {
      lines.push(`URLs: ${payload.screenshot_urls.join(', ')}`);
    }
    lines.push('Responda <b>sim</b> para confirmar, <b>não</b> para cancelar, ou ajuste com <code>fonte pasta ...</code>, <code>fonte screenshot ...</code>, <code>fonte api</code>.');
    return lines.join('\n');
  }

  async function handlePendingImageError(ctx, chatId, s, text) {
    if (!s.pendingImageError) return false;

    const lower = text.toLowerCase().trim();
    const { outputDir } = s.pendingImageError;
    const decisionPath = path.resolve(projectRoot, outputDir, 'imgs', 'error_decision.json');

    let action = null;
    let newSource = null;
    if (/^(avan[çc]|avanc|continuar|sem imagem)/.test(lower)) action = 'advance';
    else if (/^(tentar|retry|repetir|novamente)/.test(lower)) action = 'retry';
    else if (/^(cancel|cancelar|nao|não|para)/.test(lower)) action = 'cancel';
    else if (/^(outra|trocar|mudar|fonte|source)/.test(lower) || /^(api|free|gratis|brand|marca|folder|pasta)/.test(lower)) {
      if (/api/.test(lower)) newSource = 'api';
      else if (/free|gratis|stock/.test(lower)) newSource = 'free';
      else if (/brand|marca/.test(lower)) newSource = 'brand';
      else if (/folder|pasta/.test(lower)) {
        newSource = 'folder';
        const folderMatch = text.match(/(?:folder|pasta)\s+(\S+)/i);
        if (folderMatch) {
          action = 'change_source';
          fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
          fs.writeFileSync(decisionPath, JSON.stringify({ action, image_source: 'folder', image_folder: folderMatch[1], ts: Date.now() }));
          session.clearPendingImageError(chatId);
          await ctx.reply(`🔄 Trocando para pasta: <code>${folderMatch[1]}</code>`, { parse_mode: 'HTML' });
          return true;
        }
      }
      if (newSource && !action) {
        action = 'change_source';
        fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
        fs.writeFileSync(decisionPath, JSON.stringify({ action, image_source: newSource, ts: Date.now() }));
        session.clearPendingImageError(chatId);
        const sourceLabels = { api: 'IA (API)', free: 'banco grátis', brand: 'assets da marca', folder: 'pasta' };
        await ctx.reply(`🔄 Trocando fonte de imagens para: <b>${sourceLabels[newSource]}</b>`, { parse_mode: 'HTML' });
        return true;
      }
    }

    if (action) {
      fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
      fs.writeFileSync(decisionPath, JSON.stringify({ action, ts: Date.now() }));
      session.clearPendingImageError(chatId);
      const msgs = {
        advance: '▶️ Avançando sem imagens — usando layout CSS.',
        retry: '🔄 Tentando gerar as imagens novamente...',
        cancel: '❌ Campanha cancelada.',
      };
      await ctx.reply(msgs[action]);
      return true;
    }

    await ctx.reply(
      'Responda:\n• <b>avançar</b> — continuar sem imagens (CSS)\n• <b>tentar novamente</b> — repetir a geração\n• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n• <b>cancelar</b>',
      { parse_mode: 'HTML' },
    );
    return true;
  }

  async function handlePendingVideoApproval(ctx, chatId, s, text) {
    if (!s.pendingVideoApproval) return false;

    const currentOutputDir = s.pendingVideoApproval.outputDir;
    const videoDir = path.resolve(projectRoot, currentOutputDir, 'video');
    const approvalSignal = path.join(videoDir, 'approval_needed.json');
    const timedOutPath = path.join(videoDir, 'timed_out.json');
    if (fs.existsSync(timedOutPath) || !fs.existsSync(approvalSignal)) {
      session.clearPendingVideoApproval(chatId);
      await ctx.reply('Essa aprovação expirou. O fluxo já seguiu adiante.');
      return true;
    }

    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda|rodar|renderiza|renderizar)/.test(lower);
    const isCancel = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isConfirm) {
      const { outputDir } = s.pendingVideoApproval;
      session.clearPendingVideoApproval(chatId);
      writeVideoApproval(projectRoot, outputDir, true);
      await ctx.reply('Aprovado! Renderizando os vídeos agora...');
      return true;
    }

    if (isCancel) {
      const { outputDir } = s.pendingVideoApproval;
      session.clearPendingVideoApproval(chatId);
      writeVideoApproval(projectRoot, outputDir, false);
      await ctx.reply('Vídeos cancelados. Os outros arquivos da campanha continuam disponíveis.');
      return true;
    }

    if (lower.length > 10) {
      const { outputDir, absOutputDir } = s.pendingVideoApproval;
      await ctx.reply('Entendido — ajustando o roteiro...');

      const planFiles = fs.existsSync(path.join(absOutputDir, 'video'))
        ? fs.readdirSync(path.join(absOutputDir, 'video')).filter((file) => file.endsWith('_scene_plan.json'))
        : [];

      const adjustPrompt = `Adjust the video scene plans based on this feedback: "${text}"

Scene plan files to update:
${planFiles.map((file) => path.join(absOutputDir, 'video', file)).join('\n')}

Read each scene plan, apply the feedback, and save the updated versions to the same file paths.
Keep the same JSON structure. Only modify what the feedback requests.`;

      runClaude(adjustPrompt, 'video_adjustment', (code) => {
        if (code !== 0) {
          ctx.reply('Erro ao ajustar o roteiro.');
          return;
        }
        sendVideoApprovalRequest(ctx, chatId, outputDir).catch(() => {});
      });
      return true;
    }

    return false;
  }

  async function handlePendingRerun(ctx, chatId, s, text) {
    if (!s.pendingRerun) return false;

    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda)/.test(lower);
    const isCancel = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isCancel) {
      session.clearPendingRerun(chatId);
      await ctx.reply('Reprocessamento cancelado.');
      return true;
    }

    const rerunPayload = s.pendingRerun.payload;
    const sourceMatch = text.match(/^fonte\s+(brand|marca|api|free|gratis|stock|screenshot|captura|capturas|pasta|folder)(?:\s+(.+))?$/i);
    if (sourceMatch) {
      const nextSource = normalizeImageSource(sourceMatch[1]);
      const extra = (sourceMatch[2] || '').trim();
      rerunPayload.image_source = nextSource;

      if (nextSource === 'folder') {
        if (!extra) {
          await ctx.reply('Informe a pasta. Ex: <code>fonte pasta prj/inema/imgs</code>', { parse_mode: 'HTML' });
          return true;
        }
        rerunPayload.image_folder = normalizeProjectFolder(rerunPayload.project_dir || s.projectDir, extra);
        rerunPayload.screenshot_urls = [];
      } else if (nextSource === 'screenshot') {
        rerunPayload.image_folder = null;
        rerunPayload.screenshot_urls = extra
          ? extra.split(/[\s,]+/).filter(Boolean).map((url) => (url.startsWith('http') ? url : `https://${url}`))
          : (rerunPayload.screenshot_urls || []);
      } else {
        rerunPayload.image_folder = null;
        rerunPayload.screenshot_urls = [];
      }

      await ctx.reply(`✅ Fonte ajustada para <b>${sourceLabels[nextSource] || nextSource}</b>.`, { parse_mode: 'HTML' });
      await ctx.reply(describePendingRerun(rerunPayload, s.pendingRerun.stages), { parse_mode: 'HTML' });
      return true;
    }

    if ((lower.match(/^https?:\/\//) || lower.includes('.')) && !isConfirm) {
      const urls = text.split(/[\s,]+/).filter(Boolean).filter((token) => /^https?:\/\//i.test(token) || /\.\w{2,}(\/|$)/.test(token));
      if (urls.length > 0) {
        rerunPayload.image_source = 'screenshot';
        rerunPayload.image_folder = null;
        rerunPayload.screenshot_urls = urls.map((url) => (url.startsWith('http') ? url : `https://${url}`));
        await ctx.reply('✅ URLs de screenshot atualizadas.', { parse_mode: 'HTML' });
        await ctx.reply(describePendingRerun(rerunPayload, s.pendingRerun.stages), { parse_mode: 'HTML' });
        return true;
      }
    }

    if (!isConfirm) return false;

    const { payload, stages: rerunStages, campaignFolder } = s.pendingRerun;
    session.clearPendingRerun(chatId);

    const videoMode = payload.video_pro && payload.video_quick ? 'Quick + Pro'
      : payload.video_pro ? 'Pro' : 'Quick';
    session.setRunningTask(chatId, {
      taskName: campaignFolder,
      taskDate: payload.task_date,
      outputDir: payload.output_dir,
      startedAt: new Date().toISOString(),
      rerun: true,
      rerunStages,
      videoMode,
    });
    session.setCampaignV3(chatId, {
      payload,
      outputDir: payload.output_dir,
      approvalModes: payload.approval_modes || {},
      notifications: payload.notifications !== false,
    });
    session.setCampaignV3Stage(chatId, Math.min(...rerunStages) - 1);

    for (const stageNum of rerunStages) monitoredSignals.delete(`stage_done:${payload.output_dir}:${stageNum}`);
    for (const sig of [...monitoredSignals]) {
      if (sig.startsWith(`phase:${payload.output_dir}:`)) monitoredSignals.delete(sig);
    }

    const stageLabels = { 1: 'Brief', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const label = rerunStages.map((n) => (n === 3 ? `Video ${videoMode}` : stageLabels[n])).join(' + ');
    await ctx.reply(`Reprocessamento confirmado para <b>${campaignFolder}</b>.\nEnfileirando: ${label}...`, { parse_mode: 'HTML' });

    const absOutDir = path.resolve(projectRoot, payload.output_dir);
    if (payload.cleanFlags) {
      if (payload.cleanFlags.plan) {
        const videoDir = path.join(absOutDir, 'video');
        if (fs.existsSync(videoDir)) {
          for (const file of fs.readdirSync(videoDir)) {
            if (file.endsWith('_scene_plan.json') || file.endsWith('_scene_plan_motion.json') || file === 'photography_plan.json') {
              fs.unlinkSync(path.join(videoDir, file));
            }
          }
          await ctx.reply('🗑️ Planos de cena limpos.').catch(() => {});
        }
      }
      if (payload.cleanFlags.img) {
        const imgsDir = path.join(absOutDir, 'imgs');
        if (fs.existsSync(imgsDir)) {
          for (const file of fs.readdirSync(imgsDir)) {
            if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp')) {
              fs.unlinkSync(path.join(imgsDir, file));
            }
          }
          for (const file of ['approved.json', 'rejected.json', 'approval_needed.json', 'error_decision.json']) {
            const fullPath = path.join(imgsDir, file);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          }
          await ctx.reply('🗑️ Imagens limpas.').catch(() => {});
        }
      }
      if (payload.cleanFlags.audio) {
        const audioDir = path.join(absOutDir, 'audio');
        if (fs.existsSync(audioDir)) {
          for (const file of fs.readdirSync(audioDir)) {
            if (file.endsWith('.mp3') || file.endsWith('.wav') || file.endsWith('_timing.json')) {
              fs.unlinkSync(path.join(audioDir, file));
            }
          }
          await ctx.reply('🗑️ Áudio limpo.').catch(() => {});
        }
      }
    }

    const runRerunStages = async () => {
      for (const stageNum of rerunStages) {
        const stageKey = `stage${stageNum}`;
        const agentNames = stages[stageKey];
        if (!agentNames) continue;

        await ctx.reply(`Etapa ${stageNum}/5 — ${stageLabels[stageNum]}...`).catch(() => {});

        const worker = ensureWorker();
        let activeAgents = [...agentNames];
        if (stageNum === 3) {
          activeAgents = [];
          if (payload.video_quick !== false) activeAgents.push('video_quick');
          if (payload.video_pro === true) activeAgents.push('video_pro');
          if (activeAgents.length === 0) activeAgents.push('video_quick');
        }
        if (stageNum === 4) {
          const targets = payload.platform_targets || [];
          activeAgents = agentNames.filter((agent) => targets.includes(agent.replace('platform_', '')));
        }

        const logsDir = path.resolve(projectRoot, payload.output_dir, 'logs');
        fs.mkdirSync(logsDir, { recursive: true });
        for (const agent of activeAgents) {
          const logFile = path.join(logsDir, `${agent}.log`);
          if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
        }

        await enqueueStage(payload, agentNames);

        const expected = activeAgents.length;
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (!fs.existsSync(logsDir)) return;
            let done = 0;
            for (const agent of activeAgents) {
              const logFile = path.join(logsDir, `${agent}.log`);
              if (!fs.existsSync(logFile)) continue;
              const content = fs.readFileSync(logFile, 'utf-8');
              if (content.includes('Completed successfully') || content.includes('FAILED')) done += 1;
            }
            if (done >= expected) {
              clearInterval(checkInterval);
              if (worker) worker.kill('SIGTERM');
              resolve();
            }
          }, 5000);

          setTimeout(() => {
            clearInterval(checkInterval);
            if (worker) worker.kill('SIGTERM');
            resolve();
          }, 1800000);
        });
      }

      session.clearRunningTask(chatId);
      session.clearCampaignV3(chatId);
      await bot.api.sendMessage(chatId, `Reprocessamento de <b>${campaignFolder}</b> concluido!`, { parse_mode: 'HTML' }).catch(() => {});
    };

    runRerunStages().catch((err) => {
      session.clearRunningTask(chatId);
      session.clearCampaignV3(chatId);
      bot.api.sendMessage(chatId, `Erro no reprocessamento: ${err.message}`).catch(() => {});
    });

    return true;
  }

  async function handlePendingCampaign(ctx, chatId, s, text) {
    if (!s.pendingCampaign) return false;

    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda|rodar)/.test(lower);
    const isCancel = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isConfirm) {
      const payload = s.pendingCampaign;
      session.clearPendingCampaign(chatId);

      const baseName = payload.task_name;
      const outsDir = path.join(projectRoot, payload.project_dir, 'outputs');
      let nextCounter = 1;
      if (fs.existsSync(outsDir)) {
        for (const folder of fs.readdirSync(outsDir)) {
          const match = folder.match(/^c(\d{4})-/);
          if (match) nextCounter = Math.max(nextCounter, parseInt(match[1], 10) + 1);
        }
      }
      payload.task_name = `c${String(nextCounter).padStart(4, '0')}-${baseName}`;
      const outputDir = `${payload.project_dir}/outputs/${payload.task_name}`;
      payload.output_dir = outputDir;

      session.setRunningTask(chatId, {
        taskName: payload.task_name,
        taskDate: payload.task_date,
        outputDir,
        startedAt: new Date().toISOString(),
      });

      session.clearHistory(chatId);
      await ctx.reply(`Iniciando pipeline <b>${payload.task_name}</b>...\n\nUse /status para acompanhar.`, { parse_mode: 'HTML' });
      runPipelineV3(ctx, chatId, payload, outputDir);
      return true;
    }

    if (isCancel) {
      session.clearPendingCampaign(chatId);
      await ctx.reply('Campanha cancelada.');
      return true;
    }

    const replyAndRefresh = async (message) => {
      await ctx.reply(message, { parse_mode: 'HTML' }).catch(() => ctx.reply(message));
      showCampaignConfirmation({ ctx, chatId, payload: s.pendingCampaign, session, env });
    };

    if (/^auto$/.test(lower)) {
      s.pendingCampaign.approval_modes = { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' };
      await replyAndRefresh('✅ Todas as aprovações definidas como <b>auto</b>.');
      return true;
    }
    if (/^humano$/.test(lower)) {
      s.pendingCampaign.approval_modes = { stage1: 'humano', stage2: 'humano', stage3: 'humano', stage4: 'humano', stage5: 'humano' };
      await replyAndRefresh('✅ Todas as aprovações definidas como <b>humano</b>.');
      return true;
    }
    if (/^(notif|notifica).*(off|desativ|nao|não)/.test(lower)) {
      s.pendingCampaign.notifications = false;
      await replyAndRefresh('🔇 Notificações desativadas.');
      return true;
    }
    if (/^(notif|notifica).*(on|ativ|sim)/.test(lower)) {
      s.pendingCampaign.notifications = true;
      await replyAndRefresh('🔔 Notificações ativadas.');
      return true;
    }
    if (/^pro$/.test(lower)) {
      s.pendingCampaign.video_pro = true;
      s.pendingCampaign.video_quick = true;
      s.pendingCampaign.video_mode = 'both';
      await replyAndRefresh('✅ Video Pro adicionado.');
      return true;
    }
    if (/^sem\s*quick$/i.test(lower)) {
      s.pendingCampaign.video_quick = false;
      s.pendingCampaign.video_mode = s.pendingCampaign.video_pro ? 'pro' : 'quick';
      await replyAndRefresh('✅ Video Quick desativado.');
      return true;
    }
    if (/^pular\s+(pesquisa|research)$/i.test(lower)) {
      s.pendingCampaign.skip_research = true;
      await replyAndRefresh('✅ Pesquisa será pulada.');
      return true;
    }
    if (/^pular\s+(imagens?|image)$/i.test(lower)) {
      s.pendingCampaign.skip_image = true;
      await replyAndRefresh('✅ Imagens serão puladas.');
      return true;
    }
    if (/^fundo\s+(blur|desfoque|desfocado)/i.test(lower)) {
      s.pendingCampaign.image_bg_mode = 'blur';
      await replyAndRefresh('✅ Fundo do quick: <b>blur</b> (imagem desfocada)');
      return true;
    }
    if (/^fundo\s+(escuro|dark|black|preto)/i.test(lower)) {
      s.pendingCampaign.image_bg_mode = 'dark';
      await replyAndRefresh('✅ Fundo do quick: <b>escuro</b> (default)');
      return true;
    }
    if (/^idioma\s+(.+)$/i.test(lower)) {
      s.pendingCampaign.language = lower.match(/^idioma\s+(.+)$/i)[1].trim();
      await replyAndRefresh(`✅ Idioma: <b>${s.pendingCampaign.language}</b>`);
      return true;
    }
    if (/^narrad(or|ora)\s+(.+)$/i.test(lower)) {
      s.pendingCampaign.narrator = lower.match(/^narrad(?:or|ora)\s+(.+)$/i)[1].trim();
      await replyAndRefresh(`✅ Narrador: <b>${s.pendingCampaign.narrator}</b>`);
      return true;
    }
    if (/^estilo\s+(.+)$/i.test(lower)) {
      s.pendingCampaign.style_preset = lower.match(/^estilo\s+(.+)$/i)[1].trim();
      await replyAndRefresh(`✅ Estilo visual: <b>${s.pendingCampaign.style_preset}</b>`);
      return true;
    }
    if (/^dura[çc][aã]o\s+(\d+)/i.test(lower)) {
      s.pendingCampaign.video_duration = parseInt(lower.match(/^dura[çc][aã]o\s+(\d+)/i)[1], 10);
      await replyAndRefresh(`✅ Duração do vídeo Pro: <b>${s.pendingCampaign.video_duration}s</b>`);
      return true;
    }
    if (/^(provider|provedor)\s+(.+)$/i.test(lower)) {
      const prov = lower.match(/^(?:provider|provedor)\s+(.+)$/i)[1].trim();
      env.IMAGE_PROVIDER = prov;
      s.pendingCampaign.image_provider = prov;
      if (!s.pendingCampaign._modelExplicit) {
        s.pendingCampaign.image_model = prov === 'pollinations' ? 'flux' : 'z-image';
      }
      await replyAndRefresh(`✅ Provider de imagens: <b>${prov}</b>`);
      return true;
    }
    if (/^modelo?\s+(.+)$/i.test(lower)) {
      s.pendingCampaign.image_model = lower.match(/^modelo?\s+(.+)$/i)[1].trim();
      s.pendingCampaign._modelExplicit = true;
      await replyAndRefresh(`✅ Modelo de imagem: <b>${s.pendingCampaign.image_model}</b>`);
      return true;
    }
    if (/^foto\s+(simples|premium)$/i.test(lower)) {
      const quality = lower.match(/^foto\s+(simples|premium)$/i)[1].toLowerCase();
      s.pendingCampaign.photo_quality = quality;
      await replyAndRefresh(`✅ Fotografia: <b>${quality}</b> (${quality === 'premium' ? 'Opus — mais criativo, ~5min' : 'Sonnet — rápido, ~1min'})`);
      return true;
    }
    if (/^videoplan\s+(simples|premium)$/i.test(lower)) {
      const quality = lower.match(/^videoplan\s+(simples|premium)$/i)[1].toLowerCase();
      s.pendingCampaign.scene_quality = quality;
      await replyAndRefresh(`✅ Video Plan: <b>${quality}</b> (${quality === 'premium' ? 'Opus — mais detalhado, ~5min' : 'Sonnet — rápido, ~1min'})`);
      return true;
    }
    if (/^fonte\s+(brand|api|free|screenshot|pasta)$/i.test(lower)) {
      s.pendingCampaign.image_source = lower.match(/^fonte\s+(.+)$/i)[1].trim();
      await replyAndRefresh(`✅ Fonte de imagens: <b>${s.pendingCampaign.image_source}</b>`);
      return true;
    }

    if (lower.length > 5) {
      const originalBrief = s.pendingCampaign.campaign_brief || '';
      const combinedText = `${originalBrief}. Ajuste: ${text}`;
      await ctx.reply('Atualizando o briefing...');
      parseCampaignFromText({
        text: combinedText,
        projectDir: s.projectDir,
        projectRoot,
        runClaude,
        callback: (payload) => {
          if (payload) {
            const merged = { ...s.pendingCampaign, ...payload };
            merged.campaign_brief = payload.campaign_brief || combinedText;
            session.setPendingCampaign(chatId, merged);
            showCampaignConfirmation({ ctx, chatId, payload: merged, session, env });
          } else {
            ctx.reply('Nao entendi o ajuste. Responda <b>sim</b> para confirmar ou descreva o que quer mudar.', { parse_mode: 'HTML' });
          }
        },
        env,
      });
      return true;
    }

    return false;
  }

  return {
    handlePendingImageError,
    handlePendingVideoApproval,
    handlePendingRerun,
    handlePendingCampaign,
  };
}

module.exports = { createPendingTextHandlers };
