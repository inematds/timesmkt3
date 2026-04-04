const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { InputFile } = require('grammy');

function createBotRuntime(deps) {
  const {
    bot,
    session,
    projectRoot,
    ensureWorker,
    enqueueStage,
    stages,
    splitMessage,
    toTelegramHTML,
    sendCampaignReport,
    sendImageApprovalRequest,
    sendVideoApprovalRequest,
    runClaude,
  } = deps;

  function handleChatMessage(ctx, chatId, s, text) {
    if (s.processing) {
      ctx.reply('Aguarde, ainda estou processando a mensagem anterior...');
      return;
    }

    s.processing = true;

    const typingInterval = setInterval(() => {
      ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
    }, 4000);
    ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

    session.addToHistory(chatId, 'user', text);

    const history = session.getHistory(chatId);
    const conversationContext = history.slice(0, -1).map((message) => {
      const prefix = message.role === 'user' ? 'User' : 'Assistant';
      return `${prefix}: ${message.content}`;
    }).join('\n\n');

    const systemContext = `You are the assistant for the timesmkt3 marketing automation system.
The active project is: ${s.projectDir}
Project root contains: skills/ (agent skills), pipeline/ (BullMQ orchestrator), prj/ (client projects).
Each project in prj/ has: assets/, knowledge/ (brand_identity.md, product_campaign.md, platform_guidelines.md), outputs/.
Respond in the same language the user writes in (usually Brazilian Portuguese).
Be concise and helpful. You have full access to the codebase.`;

    const prompt = conversationContext
      ? `${systemContext}\n\nConversation so far:\n${conversationContext}\n\nUser: ${text}\n\nRespond to the user's latest message.`
      : `${systemContext}\n\nUser: ${text}`;

    runClaude(prompt, 'chat', (code, stdout) => {
      clearInterval(typingInterval);
      s.processing = false;

      if (code !== 0 || !stdout.trim()) {
        ctx.reply('Desculpe, tive um problema ao processar. Tente novamente.');
        return;
      }

      const response = stdout.trim();
      session.addToHistory(chatId, 'assistant', response);

      const parts = splitMessage(toTelegramHTML(response));
      (async () => {
        for (const part of parts) {
          try {
            await ctx.reply(part, { parse_mode: 'HTML' });
          } catch {
            await ctx.reply(part);
          }
        }
      })();
    });
  }

  function runPipeline(ctx, chatId, payload, outputDir) {
    const payloadStr = JSON.stringify(payload);
    const absOutputDir = path.resolve(projectRoot, outputDir);
    fs.mkdirSync(absOutputDir, { recursive: true });
    fs.writeFileSync(
      path.join(absOutputDir, 'chat_context.json'),
      JSON.stringify({ chatId: String(chatId), ts: Date.now() }),
    );
    fs.writeFileSync(
      path.join(absOutputDir, 'campaign_payload.json'),
      JSON.stringify(payload, null, 2),
    );

    const orch = spawn('node', [
      'pipeline/orchestrator.js',
      '--payload', payloadStr,
    ], { cwd: projectRoot });

    let orchOut = '';
    orch.stdout.on('data', (data) => { orchOut += data.toString(); });
    orch.stderr.on('data', (data) => { orchOut += data.toString(); });

    orch.on('close', (code) => {
      if (code !== 0) {
        ctx.reply(`Orchestrator falhou:\n<pre>${orchOut.slice(0, 2000)}</pre>`, { parse_mode: 'HTML' });
        session.clearRunningTask(chatId);
        return;
      }

      ctx.reply('Jobs enfileirados. Iniciando worker...');

      const worker = ensureWorker();
      if (!worker) {
        ctx.reply('Worker já rodando — jobs serão processados automaticamente.');
        return;
      }

      worker.stdout.on('data', (data) => {
        const text = data.toString();

        if (text.includes('Job completed:')) {
          const match = text.match(/Job completed:\s*(\S+)/);
          if (match) {
            ctx.reply(`Agente concluido: <code>${match[1]}</code>`, { parse_mode: 'HTML' });
          }
        }

        if (text.includes('Job failed:')) {
          const match = text.match(/Job failed:\s*(\S+)/);
          if (match) {
            ctx.reply(`Agente FALHOU: <code>${match[1]}</code>`, { parse_mode: 'HTML' });
          }
        }

        if (text.includes('[IMAGE_APPROVAL_NEEDED]')) {
          const match = text.match(/\[IMAGE_APPROVAL_NEEDED\]\s*(\S+)/);
          if (match) {
            sendImageApprovalRequest(null, chatId, match[1]).catch((err) => {
              console.error('Error sending image approval:', err.message);
            });
          }
        }

        if (text.includes('[VIDEO_APPROVAL_NEEDED]')) {
          const match = text.match(/\[VIDEO_APPROVAL_NEEDED\]\s*(\S+)/);
          if (match) {
            ctx.reply('Roteiro de vídeo pronto. Preparando para revisão...').then(() => {
              sendVideoApprovalRequest(ctx, chatId, match[1]).catch((err) => {
                console.error('Error sending video approval:', err.message);
              });
            });
          }
        }

        if (text.includes('[VIDEO_QUICK_AUDIO_MISSING]')) {
          const match = text.match(/\[VIDEO_QUICK_AUDIO_MISSING\]\s*(\S+)\s+(\S+)/);
          if (match) {
            ctx.reply(`⚠️ Video Quick parou por falta de narração reaproveitável (${match[2]}). Refaça a TTS ou gere novo áudio antes do rerun.`);
          }
        }
      });

      worker.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.includes('Error') || text.includes('error')) {
          ctx.reply(`Worker erro: ${text.slice(0, 500)}`);
        }
      });

      const monitor = setInterval(() => {
        const logsDir = path.join(projectRoot, outputDir, 'logs');
        if (!fs.existsSync(logsDir)) return;

        const agents = [
          'research_agent', 'ad_creative_designer', 'video_ad_specialist',
          'copywriter_agent', 'distribution_agent',
        ];

        const skipFlags = {
          research_agent: payload.skip_research,
          ad_creative_designer: payload.skip_image,
          video_ad_specialist: payload.skip_video,
        };

        const allDone = agents.every((agent) => {
          if (skipFlags[agent]) return true;
          const logFile = path.join(logsDir, `${agent}.log`);
          if (!fs.existsSync(logFile)) return false;
          const content = fs.readFileSync(logFile, 'utf-8');
          return content.includes('Completed successfully') || content.includes('FAILED');
        });

        if (allDone) {
          clearInterval(monitor);
          worker.kill('SIGTERM');
          session.clearRunningTask(chatId);

          ctx.reply(
            `Pipeline <b>${payload.task_name}</b> concluido!`,
            { parse_mode: 'HTML' },
          ).then(() => sendCampaignReport(ctx, path.join(projectRoot, outputDir), payload.task_name)).catch(() => {});
        }
      }, 30000);

      setTimeout(() => {
        clearInterval(monitor);
        worker.kill('SIGTERM');
        session.clearRunningTask(chatId);
        ctx.reply('Pipeline timeout (30 min). Verifique /status.');
      }, 1800000);
    });
  }

  function runPipelineV3(ctx, chatId, payload, outputDir) {
    const absOutputDir = path.resolve(projectRoot, outputDir);
    fs.mkdirSync(absOutputDir, { recursive: true });
    fs.writeFileSync(
      path.join(absOutputDir, 'chat_context.json'),
      JSON.stringify({ chatId: String(chatId), ts: Date.now() }),
    );
    fs.writeFileSync(
      path.join(absOutputDir, 'campaign_payload.json'),
      JSON.stringify(payload, null, 2),
    );

    const approvalModes = payload.approval_modes || {
      stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto',
    };

    session.setCampaignV3(chatId, {
      payload,
      outputDir,
      currentStage: 1,
      pendingApproval: null,
      stageResults: { stage1: null, stage2: null, stage3: null, stage4: null, stage5: null },
      approvalModes,
      notifications: payload.notifications !== false,
    });

    const worker = ensureWorker();

    if (worker) {
      worker.stdout.on('data', (data) => {
        const text = data.toString();
        console.log('[worker]', text.slice(0, 200));

        if (text.includes('[STAGE1_DONE]')) {
          console.log('[v3] STAGE1_DONE received (monitor will advance)');
        }

        if (text.includes('[STAGE2_IMAGE_READY]')) {
          const match = text.match(/\[STAGE2_IMAGE_READY\]\s*\S+\s+(\S+)/);
          if (match && fs.existsSync(match[1])) {
            bot.api.sendPhoto(chatId, new InputFile(match[1]), {
              caption: path.basename(match[1]),
            }).catch((err) => console.error('[v3 photo]', err.message));
          }
        }

        if (text.includes('[IMAGE_GEN_ERROR]')) {
          const match = text.match(/\[IMAGE_GEN_ERROR\]\s*(\S+)\s+(.+)/);
          if (match) {
            const failingOutputDir = match[1];
            const errorMsg = match[2].trim();
            session.setPendingImageError(chatId, { outputDir: failingOutputDir });
            bot.api.sendMessage(
              chatId,
              `⚠️ <b>Erro na geração de imagens</b>\n\n<code>${errorMsg}</code>\n\n`
                + `O que deseja fazer?\n`
                + `• <b>avançar</b> — continuar sem imagens (CSS)\n`
                + `• <b>tentar novamente</b> — repetir a geração\n`
                + `• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n`
                + `• <b>cancelar</b> — cancelar a campanha`,
              { parse_mode: 'HTML' },
            ).catch(() => {});
          }
        }

        if (text.includes('[IMAGE_APPROVAL_NEEDED]')) {
          const match = text.match(/(?:^|\n)\[IMAGE_APPROVAL_NEEDED\]\s*(\S+)/);
          if (match) {
            const approvedPath = path.resolve(projectRoot, match[1], 'imgs', 'approved.json');
            fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
            fs.writeFileSync(approvedPath, JSON.stringify({ approved: true, by: 'v3_stage_gate', ts: Date.now() }));
            console.log('[v3] auto-approved worker image gate:', match[1]);
          }
        }

        if (text.includes('[VIDEO_APPROVAL_NEEDED]')) {
          const match = text.match(/(?:^|\n)\[VIDEO_APPROVAL_NEEDED\]\s*(\S+)/);
          if (match) {
            const approvedPath = path.resolve(projectRoot, match[1], 'video', 'approved.json');
            fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
            fs.writeFileSync(approvedPath, JSON.stringify({ approved: true, by: 'v3_stage_gate', ts: Date.now() }));
            console.log('[v3] auto-approved worker video gate:', match[1]);
          }
        }

        if (text.includes('[VIDEO_PRO_PROGRESS]')) {
          const match = text.match(/\[VIDEO_PRO_PROGRESS\]\s*\S+\s+(\S+)/);
          if (match) {
            const phase = match[1];
            const labels = {
              plan_ready: '📋 Video Pro: roteiro pronto, gerando draft...',
              images_start: '🖼 Video Pro: gerando imagens...',
              render_start: '🎬 Video Pro: renderizando vídeo final...',
            };
            bot.api.sendMessage(chatId, labels[phase] || `🎬 Video Pro: ${phase}`).catch(() => {});
          }
        }

        if (text.includes('[VIDEO_QUICK_AUDIO_MISSING]')) {
          const match = text.match(/\[VIDEO_QUICK_AUDIO_MISSING\]\s*(\S+)\s+(\S+)/);
          if (match) {
            bot.api.sendMessage(
              chatId,
              `⚠️ <b>Video Quick parado</b>\nSem narração reaproveitável para <code>${match[2]}</code>.\nRefaça a TTS ou gere novo áudio antes do rerun.`,
              { parse_mode: 'HTML' },
            ).catch(() => {});
          }
        }

        if (text.includes('[STAGE3_DRAFT_READY]')) {
          const match = text.match(/\[STAGE3_DRAFT_READY\]\s*\S+\s+(\S+)/);
          if (match && fs.existsSync(match[1])) {
            bot.api.sendVideo(chatId, new InputFile(match[1]), {
              caption: '📹 Draft do Video Pro — confira o roteiro e timing',
            }).catch((err) => console.error('[video_pro draft]', err.message));
          }
        }

        if (text.includes('Job completed:')) {
          const match = text.match(/Job completed:\s*(\S+)/);
          if (match) {
            const cv = session.getCampaignV3(chatId);
            if (cv?.notifications) {
              bot.api.sendMessage(chatId, `✅ Agente concluído: <code>${match[1]}</code>`, { parse_mode: 'HTML' })
                .catch(() => {});
            }
          }
        }

        if (text.includes('Job failed:')) {
          const match = text.match(/Job failed:\s*(\S+)/);
          if (match) {
            console.error('[v3] Job failed:', match[1]);
            bot.api.sendMessage(chatId, `❌ Agente FALHOU: <code>${match[1]}</code>`, { parse_mode: 'HTML' })
              .catch(() => {});
          }
        }
      });

      worker.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.includes('Error') || text.includes('error')) {
          console.error('[worker stderr]', text.slice(0, 200));
          bot.api.sendMessage(chatId, `Worker erro: ${text.slice(0, 500)}`).catch(() => {});
        }
      });
    }

    setTimeout(() => {
      const cv = session.getCampaignV3(chatId);
      if (cv) {
        worker.kill('SIGTERM');
        session.clearRunningTask(chatId);
        session.clearCampaignV3(chatId);
        bot.api.sendMessage(chatId, 'Pipeline v3 timeout (90 min). Verifique /status.').catch(() => {});
      }
    }, 5400000);

    ctx.reply('Iniciando etapa 1/5 — Pesquisa & Brief Criativo...').then(() => {
      enqueueStage(payload, stages.stage1)
        .then(() => ctx.reply('Pesquisa em andamento. Aguarde o brief criativo...').catch(() => {}))
        .catch((err) => ctx.reply(`Erro ao enfileirar etapa 1: ${err.message}`).catch(() => {}));
    }).catch(() => {});
  }

  return {
    handleChatMessage,
    runPipeline,
    runPipelineV3,
  };
}

module.exports = { createBotRuntime };
