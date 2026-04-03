const fs = require('fs');
const path = require('path');
const { InputFile } = require('grammy');

function startContinuousMonitor(deps) {
  const {
    bot,
    session,
    projectRoot,
    monitoredSignals,
    readChatContext,
    writeImageApproval,
    writeVideoApproval,
    sendImageApprovalRequest,
    sendVideoApprovalRequest,
    sendStageApprovalRequest,
    enqueueStage,
    stages,
  } = deps;

  return setInterval(async () => {
    const prjRoot = path.resolve(projectRoot, 'prj');
    if (!fs.existsSync(prjRoot)) return;

    for (const prj of fs.readdirSync(prjRoot)) {
      const outRoot = path.join(prjRoot, prj, 'outputs');
      if (!fs.existsSync(outRoot)) continue;

      for (const campaign of fs.readdirSync(outRoot)) {
        const campDir = path.join(outRoot, campaign);
        const relDir = `prj/${prj}/outputs/${campaign}`;
        const chatContext = readChatContext(campDir);
        if (!chatContext?.chatId) continue;

        const chatId = chatContext.chatId;
        const sess = session.get(chatId);
        const cv = sess?.campaignV3;
        const hasActiveSession = sess?.runningTask?.outputDir === relDir;

        const imgErrorLog = path.join(campDir, 'logs', 'api_image_gen.log');
        const imgDecision = path.join(campDir, 'imgs', 'error_decision.json');
        const imgErrorKey = `img_error:${relDir}`;
        if (fs.existsSync(imgErrorLog) && !fs.existsSync(imgDecision) && !monitoredSignals.has(imgErrorKey)) {
          const logContent = fs.readFileSync(imgErrorLog, 'utf-8');
          if (logContent.includes('[IMAGE_GEN_ERROR]') && logContent.includes('waiting for user decision')) {
            monitoredSignals.add(imgErrorKey);
            const errorLine = logContent.split('\n').reverse().find((line) => line.includes('Failed image')) || 'Todas as imagens falharam';
            const errorMsg = errorLine.replace(/.*Failed image \d+: /, '');
            session.setPendingImageError(chatId, { outputDir: relDir });
            bot.api.sendMessage(
              chatId,
              `⚠️ <b>Erro na geração de imagens</b>\n\n<code>${errorMsg}</code>\n\n`
                + `O que deseja fazer?\n`
                + `• <b>avançar</b> — continuar sem imagens (CSS)\n`
                + `• <b>tentar novamente</b> — repetir a geração\n`
                + `• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n`
                + `• <b>cancelar</b> — cancelar a campanha`,
              { parse_mode: 'HTML' },
            ).catch((err) => console.error('[monitor] img error send failed:', err.message));
          }
        }
        if (fs.existsSync(imgDecision) && monitoredSignals.has(imgErrorKey)) {
          monitoredSignals.delete(imgErrorKey);
        }

        const videoSignal = path.join(campDir, 'video', 'approval_needed.json');
        const videoApproved = path.join(campDir, 'video', 'approved.json');
        const videoRejected = path.join(campDir, 'video', 'rejected.json');
        const videoKey = `video_approval:${relDir}`;
        if (fs.existsSync(videoSignal) && !fs.existsSync(videoApproved) && !fs.existsSync(videoRejected) && !monitoredSignals.has(videoKey)) {
          monitoredSignals.add(videoKey);
          const videoApprovalMode = cv?.payload?.approval_modes?.stage3 || 'humano';
          if (videoApprovalMode === 'auto') {
            writeVideoApproval(projectRoot, relDir, true, 'auto-approved');
            console.log(`[monitor] Video auto-approved for ${relDir}`);
            if (cv?.notifications !== false) {
              bot.api.sendMessage(chatId, '⚡ Roteiro aprovado automaticamente').catch(() => {});
            }
          } else {
            session.setPendingVideoApproval(chatId, { outputDir: relDir, type: 'video' });
            sendVideoApprovalRequest(bot, chatId, relDir).catch((err) => console.error('[monitor] video approval send failed:', err.message));
          }
        }
        if ((fs.existsSync(videoApproved) || fs.existsSync(videoRejected)) && monitoredSignals.has(videoKey)) {
          monitoredSignals.delete(videoKey);
        }

        const imgApprovalSignal = path.join(campDir, 'imgs', 'approval_needed.json');
        const imgApproved = path.join(campDir, 'imgs', 'approved.json');
        const imgRejected = path.join(campDir, 'imgs', 'rejected.json');
        const imgApprovalKey = `img_approval:${relDir}`;
        if (fs.existsSync(imgApprovalSignal) && !fs.existsSync(imgApproved) && !fs.existsSync(imgRejected) && !monitoredSignals.has(imgApprovalKey)) {
          monitoredSignals.add(imgApprovalKey);
          const imgApprovalMode = cv?.payload?.approval_modes?.stage2 || 'humano';
          if (imgApprovalMode === 'auto') {
            writeImageApproval(projectRoot, relDir, true, 'auto-approved');
            console.log(`[monitor] Images auto-approved for ${relDir}`);
            if (cv?.notifications !== false) {
              bot.api.sendMessage(chatId, '⚡ Imagens aprovadas automaticamente').catch(() => {});
            }
          } else {
            session.setPendingVideoApproval(chatId, { outputDir: relDir, type: 'images' });
            sendImageApprovalRequest(bot, chatId, relDir).catch((err) => console.error('[monitor] img approval send failed:', err.message));
          }
        }
        if ((fs.existsSync(imgApproved) || fs.existsSync(imgRejected)) && monitoredSignals.has(imgApprovalKey)) {
          monitoredSignals.delete(imgApprovalKey);
        }

        if (hasActiveSession && sess?.campaignV3?.notifications !== false) {
          const logsDir = path.join(campDir, 'logs');
          const phaseNotifs = [
            { file: 'video_pro.log', phases: [
              { key: 'Generating narration', msg: '🎙️ <b>Pro:</b> Gerando narração...', order: 1 },
              { key: 'Analyzing narration', msg: '⏱️ <b>Pro:</b> Analisando timing do áudio...', order: 2 },
              { key: 'Photography Director', msg: '📷 <b>Pro:</b> Diretor de Fotografia...', order: 3 },
              { key: 'Creating scene plan', msg: '🎬 <b>Pro:</b> Criando plano de cenas...', order: 4 },
              { key: 'Typography validation', msg: '🔤 <b>Pro:</b> Validando tipografia...', order: 5 },
              { key: 'Starting video render', msg: '🎥 <b>Pro:</b> Renderizando...', order: 6 },
              { key: 'Completed successfully', msg: '✅ <b>Pro:</b> Concluído!', order: 7 },
            ] },
            { file: 'video_quick.log', phases: [
              { key: 'Invoking Claude CLI', msg: '🎬 <b>Quick:</b> Criando plano de cenas...', order: 1 },
              { key: 'Starting video render', msg: '🎥 <b>Quick:</b> Renderizando...', order: 2 },
              { key: 'render_start', msg: '🎥 <b>Quick:</b> Renderizando...', order: 2 },
              { key: 'Completed successfully', msg: '✅ <b>Quick:</b> Concluído!', order: 3 },
            ] },
            { file: 'ad_creative_designer.log', phases: [
              { key: 'Generating image', msg: '🖼️ Gerando imagens...' },
              { key: 'Rendering HTML', msg: '🎨 Montando criativos...' },
            ] },
          ];

          for (const phaseNotif of phaseNotifs) {
            const logFile = path.join(logsDir, phaseNotif.file);
            if (!fs.existsSync(logFile)) continue;
            const logContent = fs.readFileSync(logFile, 'utf-8');
            const sorted = [...phaseNotif.phases].sort((a, b) => (a.order || 0) - (b.order || 0));
            for (const phase of sorted) {
              const phaseKey = `phase:${relDir}:${phaseNotif.file}:${phase.key}`;
              if (monitoredSignals.has(phaseKey)) continue;
              if (!logContent.includes(phase.key)) break;
              monitoredSignals.add(phaseKey);
              bot.api.sendMessage(chatId, phase.msg, { parse_mode: 'HTML' }).catch(() => {});
            }
          }
        }

        if (!hasActiveSession || !cv) continue;

        const logsDir = path.join(campDir, 'logs');
        if (!fs.existsSync(logsDir)) continue;

        const stageAgentMap = {
          1: ['research_agent', 'creative_director', 'copywriter_agent'],
          2: ['ad_creative_designer'],
          3: ['video_quick', 'video_pro'],
          4: ['platform_instagram', 'platform_youtube', 'platform_tiktok', 'platform_facebook', 'platform_threads', 'platform_linkedin'],
          5: ['distribution_agent'],
        };

        for (const [stageNum, agents] of Object.entries(stageAgentMap)) {
          const num = Number(stageNum);
          const stageKey = `stage_done:${relDir}:${num}`;
          if (monitoredSignals.has(stageKey)) continue;

          let activeAgents = agents;
          activeAgents = activeAgents.filter((agent) => {
            if ((agent === 'research_agent' || agent === 'creative_director') && cv.payload?.skip_research) return false;
            if (agent === 'ad_creative_designer' && cv.payload?.skip_image) return false;
            if ((agent === 'video_quick' || agent === 'video_pro') && cv.payload?.skip_video) return false;
            return true;
          });
          if (num === 3) {
            const adsDir = path.join(campDir, 'ads');
            const hasAdImages = fs.existsSync(adsDir)
              && fs.readdirSync(adsDir).some((file) => /\.(png|jpg|jpeg)$/i.test(file));
            const vq = cv.payload?.video_quick !== false && (!cv.payload?.skip_image || hasAdImages);
            const vp = cv.payload?.video_pro === true;
            activeAgents = [];
            if (vq) activeAgents.push('video_quick');
            if (vp) activeAgents.push('video_pro');
            if (activeAgents.length === 0 && !cv.payload?.skip_video && !cv.payload?.skip_image) activeAgents = ['video_quick'];
            activeAgents = activeAgents.filter((agent) => !cv.payload?.skip_video || !['video_quick', 'video_pro'].includes(agent));
          }
          if (num === 4) {
            const targets = cv.payload?.platform_targets || [];
            activeAgents = agents.filter((agent) => targets.includes(agent.replace('platform_', '')));
          }

          let allDone = true;
          let anyStarted = activeAgents.length === 0;
          for (const agent of activeAgents) {
            const logFile = path.join(logsDir, `${agent}.log`);
            if (!fs.existsSync(logFile)) {
              allDone = false;
              continue;
            }
            anyStarted = true;
            const tail = fs.readFileSync(logFile, 'utf-8').split('\n').filter((line) => line.trim()).slice(-3).join('\n');
            if (!tail.includes('Completed successfully')) allDone = false;
          }

          if (!allDone || !anyStarted) continue;

          monitoredSignals.add(stageKey);
          console.log(`[monitor] Stage ${num} completed for ${relDir}`);

          if (cv.notifications !== false) {
            const stageNames = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuição' };
            bot.api.sendMessage(chatId, `✅ Etapa ${num} concluída — ${stageNames[num]}`, { parse_mode: 'HTML' }).catch(() => {});
          }

          let canAdvance = true;
          for (let prevStage = 1; prevStage < num; prevStage += 1) {
            if (!monitoredSignals.has(`stage_done:${relDir}:${prevStage}`)) {
              canAdvance = false;
              break;
            }
          }
          if (!canAdvance) continue;

          if (cv.notifications !== false) {
            if (num === 1) {
              const reportPath = path.join(campDir, 'interactive_report.html');
              const briefMdPath = path.join(campDir, 'research_brief.md');
              if (fs.existsSync(reportPath)) {
                bot.api.sendDocument(chatId, new InputFile(reportPath), { caption: '📊 Relatório interativo da pesquisa' }).catch(() => {});
              }
              if (fs.existsSync(briefMdPath)) {
                bot.api.sendDocument(chatId, new InputFile(briefMdPath), { caption: '📋 Research Brief' }).catch(() => {});
              }
            }
            if (num === 3) {
              const videoDir = path.join(campDir, 'video');
              if (fs.existsSync(videoDir)) {
                for (const file of fs.readdirSync(videoDir)) {
                  if (!file.endsWith('.mp4') || file.includes('draft')) continue;
                  const videoPath = path.join(videoDir, file);
                  const sizeMB = fs.statSync(videoPath).size / (1024 * 1024);
                  if (sizeMB > 50) {
                    await bot.api.sendMessage(
                      chatId,
                      `🎬 <b>${file}</b> (${sizeMB.toFixed(1)}MB — muito grande para Telegram)\nUse <code>/enviar ${path.basename(path.dirname(campDir))} videos</code>`,
                      { parse_mode: 'HTML' },
                    ).catch(() => {});
                  } else {
                    await bot.api.sendVideo(chatId, new InputFile(videoPath), {
                      caption: `🎬 ${file} (${sizeMB.toFixed(1)}MB)`,
                      supports_streaming: true,
                    }).catch(() => (
                      bot.api.sendDocument(chatId, new InputFile(videoPath), {
                        caption: `🎬 ${file} (${sizeMB.toFixed(1)}MB)`,
                      }).catch(() => {})
                    ));
                  }
                }
              }
            }
          }

          const approvalMode = cv.payload?.approval_modes?.[`stage${num}`] || 'auto';
          if (num < 5) {
            if (approvalMode === 'auto') {
              const nextStage = num + 1;
              const nextAgents = stages[`stage${nextStage}`];
              if (nextAgents) {
                console.log(`[monitor] Auto-advancing to stage ${nextStage}`);
                session.setCampaignV3Stage(chatId, nextStage);
                enqueueStage(cv.payload, nextAgents)
                  .then(() => {
                    const stageNames = { 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuição' };
                    if (cv.notifications !== false) {
                      bot.api.sendMessage(chatId, `▶️ Etapa ${nextStage} iniciando — ${stageNames[nextStage]}`, { parse_mode: 'HTML' }).catch(() => {});
                    }
                  })
                  .catch((err) => console.error(`[monitor] Failed to enqueue stage ${nextStage}:`, err.message));
              }
            } else if (approvalMode === 'humano') {
              console.log(`[monitor] Stage ${num} needs human approval — sending request`);
              const fakeCtx = { reply: (text, opts) => bot.api.sendMessage(chatId, text, opts) };
              sendStageApprovalRequest(fakeCtx, chatId, num + 1).catch((err) => {
                console.error(`[monitor] Failed to send approval request for stage ${num}:`, err.message);
              });
            }
          }

          if (num === 5) {
            const taskName = sess.runningTask?.taskName || campaign;
            session.clearRunningTask(chatId);
            session.clearCampaignV3(chatId);
            bot.api.sendMessage(chatId, `🎉 Campanha <b>${taskName}</b> concluída!`, { parse_mode: 'HTML' }).catch(() => {});
          }
        }
      }
    }
  }, 10000);
}

module.exports = { startContinuousMonitor };
