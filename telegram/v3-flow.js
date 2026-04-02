const fs = require('fs');
const path = require('path');
const { InputFile } = require('grammy');

function createV3Flow(deps) {
  const {
    session,
    bot,
    projectRoot,
    stages,
    enqueueStage,
    runClaude,
    splitMessage,
    toTelegramHTML,
    escapeHtml,
    sendStageApprovalRequestRef,
  } = deps;

  async function runStage(ctx, chatId, stageNumber) {
    const cv = session.getCampaignV3(chatId);
    const send = (text, opts) => bot.api.sendMessage(chatId, text, opts).catch(() => {});
    if (!cv) {
      await send('Nenhuma campanha v3 ativa.');
      return;
    }

    session.setCampaignV3Stage(chatId, stageNumber);
    session.clearPendingStageApproval(chatId);

    const stageKey = `stage${stageNumber}`;
    const agentNames = stages[stageKey];
    if (!agentNames) {
      await send('Pipeline v3 completo!');
      return;
    }

    const labels = { 2: 'Imagens (Ads)', 3: 'Video', 4: 'Copy de plataforma', 5: 'Distribuicao' };
    await send(`Avancando para etapa ${stageNumber}/5 — ${labels[stageNumber] || `Etapa ${stageNumber}`}...`);

    try {
      await enqueueStage(cv.payload, agentNames);
      await send(`Etapa ${stageNumber} na fila. Processando...`);
    } catch (e) {
      await send(`Erro ao enfileirar etapa ${stageNumber}: ${e.message}`);
    }
  }

  function runAgentReview(ctx, chatId, stage, outputDir) {
    const cv = session.getCampaignV3(chatId);
    if (!cv) return;

    const stageLabels = { 1: 'Brief & Narrativa', 2: 'Visuais (Imagens & Vídeo)', 3: 'Copy de Plataforma', 4: 'Distribuição' };

    const prompt = `You are the Agente Revisor. Follow the skill defined in skills/agente-revisor/SKILL.md exactly.

Review Stage ${stage} (${stageLabels[stage] || `Stage ${stage}`}) outputs.

Project dir: ${cv.payload.project_dir}
Output dir: ${outputDir}

Read the relevant files for Stage ${stage} as specified in the skill.
Then print your decision in exactly the required format: [AGENTE_APROVADO] or [AGENTE_AJUSTE].`;

    runClaude(prompt, 'agente_revisor', (code, stdout) => {
      if (code !== 0) {
        ctx.reply(`Agente Revisor encontrou um erro na etapa ${stage}. Enviando para revisão humana...`)
          .then(() => sendStageApprovalRequestRef.current(ctx, chatId, stage))
          .catch(() => {});
        return;
      }

      const approvedMatch = stdout.match(/\[AGENTE_APROVADO\][^\n]*\nRaz[ãa]o:\s*(.+)/i);
      const adjustMatch = stdout.match(/\[AGENTE_AJUSTE\][^\n]*\nFeedback:\s*([\s\S]+)/i);

      if (approvedMatch) {
        const reason = approvedMatch[1].trim();
        ctx.reply(
          `<b>Agente Revisor — Etapa ${stage} aprovada ✅</b>\n\n<i>${escapeHtml(reason)}</i>`,
          { parse_mode: 'HTML' }
        ).then(() => runStage(ctx, chatId, stage + 1)).catch(() => {});
      } else if (adjustMatch) {
        const feedback = adjustMatch[1].trim().slice(0, 800);
        ctx.reply(
          `<b>Agente Revisor — Etapa ${stage} precisa de ajustes</b>\n\n` +
          `<i>${escapeHtml(feedback)}</i>\n\n` +
          `Responda <b>sim</b> para ignorar e continuar, <b>não</b> para cancelar, ` +
          `ou descreva como corrigir.`,
          { parse_mode: 'HTML' }
        ).then(() => {
          session.setPendingStageApproval(chatId, { stage, type: 'agente_feedback', feedback });
        }).catch(() => {});
      } else {
        ctx.reply(`Agente Revisor não retornou decisão clara na etapa ${stage}. Enviando para revisão humana...`)
          .then(() => sendStageApprovalRequestRef.current(ctx, chatId, stage))
          .catch(() => {});
      }
    });
  }

  async function handleV3StageApproval(ctx, chatId, s, text) {
    const cv = s.campaignV3;
    if (!cv?.pendingApproval) return false;

    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda)/.test(lower);
    const isCancel = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);
    const stage = cv.pendingApproval.stage;

    if (stage === 3) {
      const allPlatforms = ['instagram', 'youtube', 'tiktok', 'facebook', 'threads', 'linkedin'];
      const platformMatch = lower.match(/^([\w,]+)$/);
      if (platformMatch && !isConfirm && !isCancel) {
        const requested = platformMatch[1].split(',').map(p => p.trim()).filter(p => allPlatforms.includes(p));
        if (requested.length > 0) {
          cv.payload.platform_targets = requested;
          await ctx.reply(
            `Plataformas atualizadas: <b>${requested.join(', ')}</b>\nResponda <b>sim</b> para confirmar e avancar.`,
            { parse_mode: 'HTML' }
          );
          return true;
        }
      }
    }

    if (isConfirm) {
      await runStage(ctx, chatId, stage + 1);
      return true;
    }

    if (isCancel) {
      session.clearPendingStageApproval(chatId);
      session.clearCampaignV3(chatId);
      session.clearRunningTask(chatId);
      await ctx.reply(`Campanha cancelada na etapa ${stage}.`);
      return true;
    }

    if (lower.length > 10) {
      if (stage === 1) {
        await ctx.reply('Revisando o brief criativo...');
        const adjustPrompt = `Revise the creative brief based on this feedback: "${text}"

Read current brief at ${path.join(projectRoot, cv.outputDir, 'creative', 'creative_brief.md')} and ${path.join(projectRoot, cv.outputDir, 'creative', 'creative_brief.json')}.
Apply the feedback, save updated versions to the same paths.
After saving both files, print exactly: [STAGE1_DONE] ${cv.outputDir}`;
        runClaude(adjustPrompt, 'brief_adjustment', (code) => {
          if (code !== 0) ctx.reply('Erro ao ajustar o brief.').catch(() => {});
        });
      } else if (stage === 2) {
        await ctx.reply('Ajustando copy com seu feedback...');
        const copyDir = path.join(projectRoot, cv.outputDir, 'copy');
        const adjustPrompt = `You are the Copywriter Agent. Adjust the existing copy based on this feedback: "${text}"

Read the current copy files:
- ${path.join(copyDir, 'instagram_caption.txt')}
- ${path.join(copyDir, 'threads_post.txt')}
- ${path.join(copyDir, 'youtube_metadata.json')}

Also read the brand guidelines at ${path.join(projectRoot, cv.payload.project_dir, 'knowledge', 'brand_identity.md')}

Apply the feedback, update only what was asked. Save the revised files to the same paths. Keep the same file format.`;
        runClaude(adjustPrompt, 'copy_adjustment', (code) => {
          const _ctx = { reply: (t, o) => bot.api.sendMessage(chatId, t, o).catch(() => {}), chat: { id: chatId }, api: bot.api };
          if (code !== 0) {
            _ctx.reply('Erro ao ajustar o copy.');
            return;
          }
          sendStageApprovalRequestRef.current(_ctx, chatId, 2).catch(() => {});
        });
      } else if (stage === 3) {
        await ctx.reply('Ajustando o roteiro do vídeo...');
        const videoDir = path.join(projectRoot, cv.outputDir, 'video');
        const planFiles = fs.existsSync(videoDir)
          ? fs.readdirSync(videoDir).filter(f => f.endsWith('_scene_plan.json')).map(f => path.join(videoDir, f))
          : [];
        if (planFiles.length === 0) {
          await ctx.reply('Nenhum roteiro encontrado para ajustar.');
          return true;
        }
        const adjustPrompt = `Adjust the video scene plans based on this feedback: "${text}"
Scene plan files:\n${planFiles.join('\n')}
Read each, apply feedback, save to same paths. Keep same JSON structure.`;
        runClaude(adjustPrompt, 'video_adjustment', (code) => {
          if (code !== 0) {
            ctx.reply('Erro ao ajustar o roteiro.').catch(() => {});
            return;
          }
          sendStageApprovalRequestRef.current(ctx, chatId, 3).catch(() => {});
        });
      } else if (stage === 4) {
        await ctx.reply('Responda <b>sim</b> para distribuir ou <b>não</b> para cancelar.', { parse_mode: 'HTML' });
      }
      return true;
    }

    return true;
  }

  return {
    runStage,
    runAgentReview,
    handleV3StageApproval,
  };
}

module.exports = { createV3Flow };
