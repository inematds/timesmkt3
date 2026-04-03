const fs = require('fs');
const path = require('path');

function registerRerunCommands(bot, deps) {
  const {
    projectRoot,
    session,
    findCampaign,
    findCampaignAcrossProjects,
    resolveStageAlias,
    buildConfigTable,
  } = deps;

  bot.command('continue', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (s.runningTask) {
      return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
    }

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/continue — Continuar campanha de onde parou</b>\n\n'
        + 'Uso: <code>/continue &lt;campanha&gt;</code>\n\n'
        + 'Detecta automaticamente quais etapas faltam e continua.\n'
        + 'Aceita flags de imagem: screenshot, api, free\n\n'
        + 'Exemplos:\n'
        + '<code>/continue c16</code>\n'
        + '<code>/continue c16 screenshot</code>\n'
        + '<code>/continue c16 inema.club</code>',
        { parse_mode: 'HTML' },
      );
    }

    const tokens = raw.split(/\s+/);
    const campaignQuery = tokens[0];

    let imageSource = 'brand';
    let userRequestedPro = false;
    let userRequestedQuick = false;
    let userRequestedDraft = false;
    const screenshotUrls = [];
    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i].toLowerCase();
      if (token === 'pro') { userRequestedPro = true; continue; }
      if (token === 'quick') { userRequestedQuick = true; continue; }
      if (token === 'draft') { userRequestedDraft = true; continue; }
      if (token === 'screenshot' || token === 'screenshots' || token === 'captura' || token === 'capturas') { imageSource = 'screenshot'; continue; }
      if (token === 'api') { imageSource = 'api'; continue; }
      if (token === 'free' || token === 'gratis' || token === 'stock') { imageSource = 'free'; continue; }
      if (token.match(/^https?:\/\//) || token.match(/\.\w{2,4}$/)) {
        screenshotUrls.push(token.startsWith('http') ? token : `https://${token}`);
        if (imageSource === 'brand') imageSource = 'screenshot';
      }
    }

    let projectDir = s.projectDir;
    let campaignFolder = findCampaign(projectRoot, projectDir, campaignQuery);
    if (!campaignFolder) {
      const result = findCampaignAcrossProjects(projectRoot, campaignQuery);
      if (result) {
        projectDir = result.projectDir;
        campaignFolder = result.campaignFolder;
      }
    }
    if (!campaignFolder) {
      return ctx.reply(`Campanha "${campaignQuery}" nao encontrada em nenhum projeto.`);
    }
    if (projectDir !== s.projectDir) session.setProject(chatId, projectDir);

    const outputDir = `${projectDir}/outputs/${campaignFolder}`;
    const absOutputDir = path.resolve(projectRoot, outputDir);

    const has = (rel) => fs.existsSync(path.join(absOutputDir, rel));
    const hasAny = (dir, ext) => {
      const fullDir = path.join(absOutputDir, dir);
      if (!fs.existsSync(fullDir)) return false;
      return fs.readdirSync(fullDir).some((file) => file.endsWith(ext));
    };

    const stageStatus = {
      1: has('creative/creative_brief.json') && has('copy/narrative.json'),
      2: hasAny('ads', '.png'),
      3: hasAny('video', '.mp4'),
      4: hasAny('platforms', '.json'),
      5: has(`Publish ${campaignFolder} ${new Date().toISOString().slice(0, 10)}.md`) || fs.readdirSync(absOutputDir).some((file) => file.startsWith('Publish ')),
    };

    const missingStages = [];
    for (let stage = 1; stage <= 5; stage += 1) {
      if (!stageStatus[stage]) missingStages.push(stage);
    }

    if (missingStages.length === 0) {
      return ctx.reply(`Campanha <b>${campaignFolder}</b> esta completa! Todos os 5 estagios ja foram executados.\n\nUse /rerun para reprocessar etapas especificas.`, { parse_mode: 'HTML' });
    }

    let briefData = {};
    const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
    if (fs.existsSync(briefPath)) {
      try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
    }

    let originalPayload = null;
    const savedPayloadPath = path.join(absOutputDir, 'campaign_payload.json');
    if (fs.existsSync(savedPayloadPath)) {
      try { originalPayload = JSON.parse(fs.readFileSync(savedPayloadPath, 'utf-8')); } catch {}
    }

    let videoPro;
    let videoQuick;
    if (userRequestedPro || userRequestedQuick) {
      videoPro = userRequestedPro;
      videoQuick = true;
    } else if (originalPayload?.video_mode) {
      videoPro = originalPayload.video_pro === true;
      videoQuick = originalPayload.video_quick !== false;
    } else {
      const videoDir = path.join(absOutputDir, 'video');
      const audioDir = path.join(absOutputDir, 'audio');
      const hasScenePlan = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some((file) => file.includes('scene_plan'));
      const hasNarration = fs.existsSync(audioDir) && fs.readdirSync(audioDir).some((file) => file.includes('narration'));
      videoPro = hasScenePlan || hasNarration;
      videoQuick = true;
    }
    const videoMode = videoPro ? 'both' : 'quick';

    const payload = {
      task_name: campaignFolder,
      task_date: new Date().toISOString().slice(0, 10),
      project_dir: projectDir,
      output_dir: outputDir,
      platform_targets: briefData.platforms || ['instagram'],
      language: 'pt-BR',
      image_count: 5,
      image_formats: ['carousel_1080x1080', 'story_1080x1920'],
      video_count: 1,
      image_source: imageSource,
      image_folder: null,
      image_model: process.env.KIE_DEFAULT_MODEL || 'z-image',
      screenshot_urls: screenshotUrls,
      use_brand_overlay: true,
      campaign_brief: briefData.campaign_angle || '',
      video_mode: videoMode,
      video_quick: videoQuick,
      video_pro: videoPro,
      video_draft: userRequestedDraft,
      approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
      notifications: true,
      skip_dependencies: true,
      skip_completed: true,
    };

    const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const statusLines = [];
    for (let stage = 1; stage <= 5; stage += 1) {
      const icon = stageStatus[stage] ? '✅' : '⏳';
      if (stage === 3) {
        const quickIcon = stageStatus[3] ? '✅' : '▶️';
        const proIcon = stageStatus[3] ? '✅' : (videoPro ? '▶️' : '⬜');
        statusLines.push(`${icon} <b>${stage}.</b> Video`);
        statusLines.push(`    ${quickIcon} Quick`);
        if (videoPro) statusLines.push(`    ${proIcon} Pro`);
      } else {
        statusLines.push(`${icon} <b>${stage}.</b> ${stageLabels[stage]}`);
      }
    }

    const imgLabels = { brand: 'marca', screenshot: 'screenshots do site', api: 'IA (API)', free: 'banco gratis' };
    const imgInfo = imageSource !== 'brand' ? `\nImagens: <b>${imgLabels[imageSource] || imageSource}</b>` : '';
    const urlInfo = screenshotUrls.length > 0 ? `\nURLs: ${screenshotUrls.join(', ')}` : '';
    const videoInfo = `\nVideo Quick: <b>${videoQuick ? '1' : '0'}</b> | Video Pro: <b>${videoPro ? '1' : '0'}</b>`;

    await ctx.reply(
      `<b>Continuar: ${campaignFolder}</b>\n`
      + `Projeto: <code>${projectDir}</code>${imgInfo}${videoInfo}${urlInfo}\n\n`
      + statusLines.join('\n')
      + '\n\n'
      + `Vai executar ${missingStages.length} etapa(s) pendente(s).\n`
      + 'Responda <b>sim</b> para iniciar.',
      { parse_mode: 'HTML' },
    );

    session.setPendingRerun(chatId, { payload, stages: missingStages, campaignFolder });
  });

  bot.command('rerun', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const s = session.get(chatId);

    if (s.runningTask) {
      return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
    }

    const raw = ctx.match?.trim();
    if (!raw) {
      return ctx.reply(
        '<b>/rerun — Reprocessar etapas de campanha existente</b>\n\n'
        + 'Uso: <code>/rerun &lt;campanha&gt; &lt;etapas&gt;</code>\n\n'
        + 'Exemplos:\n'
        + '<code>/rerun c13 imagens</code>\n'
        + '<code>/rerun c13 video quick</code>\n'
        + '<code>/rerun c13 video pro</code>\n'
        + '<code>/rerun c13 video pro screenshot</code>\n'
        + '<code>/rerun c13 video pro inema.club</code>\n'
        + '<code>/rerun c13 imagens api</code>\n'
        + '<code>/rerun c13 2,3</code>\n'
        + '<code>/rerun c13 video pro cleanplan</code>\n'
        + '<code>/rerun c13 video pro cleanall</code>\n\n'
        + 'Fonte de imagens: <i>brand</i> (default), <i>screenshot</i>, <i>api</i>, <i>free</i>, <i>pasta</i>\n'
        + 'Limpeza: <i>cleanplan</i>, <i>cleanimg</i>, <i>cleanaudio</i>, <i>cleanall</i>',
        { parse_mode: 'HTML' },
      );
    }

    const args = raw.split(/\s+/);
    const campaignQuery = args[0];
    const stageArgs = args.slice(1).join(' ').split(',').map((item) => item.trim()).filter(Boolean);

    let projectDir = s.projectDir;
    let campaignFolder = findCampaign(projectRoot, projectDir, campaignQuery);
    if (!campaignFolder) {
      const result = findCampaignAcrossProjects(projectRoot, campaignQuery);
      if (result) {
        projectDir = result.projectDir;
        campaignFolder = result.campaignFolder;
      }
    }
    if (!campaignFolder) {
      return ctx.reply(`Campanha "${campaignQuery}" nao encontrada em nenhum projeto.`);
    }

    if (projectDir !== s.projectDir) {
      session.setProject(chatId, projectDir);
    }

    const outputDir = `${projectDir}/outputs/${campaignFolder}`;
    const absOutputDir = path.resolve(projectRoot, outputDir);

    if (stageArgs.length === 0) {
      return ctx.reply('Especifique quais etapas. Ex: <code>/rerun c13 video quick</code>', { parse_mode: 'HTML' });
    }

    const allTokens = stageArgs.join(' ').toLowerCase().split(/[\s,]+/);
    const stageNumbers = new Set();
    let videoQuick = false;
    let videoPro = false;
    let videoDraft = false;

    const origPayloadPath = path.join(absOutputDir, 'campaign_payload.json');
    let origPayload = {};
    try { origPayload = JSON.parse(fs.readFileSync(origPayloadPath, 'utf-8')); } catch {}
    let imageSource = origPayload.image_source || 'brand';
    let payloadImageFolder = null;
    const screenshotUrls = [];
    const cleanFlags = { plan: false, img: false, audio: false };

    for (let i = 0; i < allTokens.length; i += 1) {
      const token = allTokens[i];
      const next = allTokens[i + 1];

      if ((token === 'video' || token === 'videos') && next === 'quick') {
        stageNumbers.add(3); videoQuick = true; i += 1; continue;
      }
      if ((token === 'video' || token === 'videos') && next === 'pro') {
        stageNumbers.add(3); videoPro = true; i += 1; continue;
      }
      if (token === 'quick') { stageNumbers.add(3); videoQuick = true; continue; }
      if (token === 'pro') { stageNumbers.add(3); videoPro = true; continue; }
      if (token === 'draft') { videoDraft = true; continue; }

      if (token === 'cleanplan' || token === 'limparplano') { cleanFlags.plan = true; continue; }
      if (token === 'cleanimg' || token === 'limparimagens') { cleanFlags.img = true; continue; }
      if (token === 'cleanaudio' || token === 'limparaudio') { cleanFlags.audio = true; continue; }
      if (token === 'cleanall' || token === 'limpartudo') { cleanFlags.plan = true; cleanFlags.img = true; cleanFlags.audio = true; continue; }

      if (token === 'screenshot' || token === 'screenshots' || token === 'captura' || token === 'capturas') {
        imageSource = 'screenshot'; continue;
      }
      if (token === 'api') { imageSource = 'api'; continue; }
      if (token === 'free' || token === 'gratis' || token === 'stock') { imageSource = 'free'; continue; }
      if (token === 'pasta' || token === 'folder') {
        imageSource = 'folder';
        if (next && !resolveStageAlias(next) && !['quick', 'pro', 'screenshot', 'api', 'free'].includes(next)) {
          payloadImageFolder = next;
          i += 1;
        }
        continue;
      }

      if (token.match(/^https?:\/\//) || token.match(/\.\w{2,4}$/)) {
        screenshotUrls.push(token.startsWith('http') ? token : `https://${token}`);
        if (imageSource === 'brand') imageSource = 'screenshot';
        continue;
      }

      const resolved = resolveStageAlias(token);
      if (resolved) {
        stageNumbers.add(resolved);
        if (resolved === 3 && !videoQuick && !videoPro) videoQuick = true;
      }
    }

    const sortedStages = [...stageNumbers].sort();
    if (sortedStages.length === 0) {
      return ctx.reply('Etapas nao reconhecidas. Use: brief, imagens, video quick, video pro, plataformas, distribuicao.');
    }

    let briefData = {};
    const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
    if (fs.existsSync(briefPath)) {
      try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
    }

    if (videoPro) videoQuick = true;
    const videoMode = videoPro ? 'both' : 'quick';

    const payload = {
      task_name: campaignFolder,
      task_date: new Date().toISOString().slice(0, 10),
      project_dir: projectDir,
      output_dir: outputDir,
      platform_targets: briefData.platforms || ['instagram'],
      language: 'pt-BR',
      image_count: 5,
      image_formats: ['carousel_1080x1080', 'story_1080x1920'],
      video_count: 1,
      image_source: imageSource,
      image_folder: payloadImageFolder,
      image_model: process.env.KIE_DEFAULT_MODEL || 'z-image',
      screenshot_urls: screenshotUrls,
      use_brand_overlay: true,
      campaign_brief: briefData.campaign_angle || '',
      video_mode: videoMode,
      video_quick: videoQuick,
      video_pro: videoPro,
      video_draft: videoDraft,
      approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
      notifications: true,
      skip_dependencies: true,
      skip_completed: false,
    };

    const stageLabelsMap = { 1: 'Brief', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    const stageLabel = sortedStages.map((stage) => (
      stage === 3
        ? `Video ${payload.video_pro && payload.video_quick ? 'Quick + Pro' : payload.video_pro ? 'Pro' : 'Quick'}`
        : stageLabelsMap[stage]
    )).join(' + ');

    if (cleanFlags.plan || cleanFlags.img || cleanFlags.audio) {
      payload.cleanFlags = cleanFlags;
    }

    const configLines = buildConfigTable(payload, `Reprocessar: ${campaignFolder}`);
    configLines.push(`\n<b>Etapas:</b> ${stageLabel}`);
    if (payload.cleanFlags) {
      const cleans = [];
      if (payload.cleanFlags.plan) cleans.push('planos');
      if (payload.cleanFlags.img) cleans.push('imagens');
      if (payload.cleanFlags.audio) cleans.push('áudio');
      if (cleans.length) configLines.push(`<b>Limpar:</b> ${cleans.join(', ')}`);
    }
    configLines.push('\n<i>• = alterado do default</i>');
    configLines.push('Responda <b>sim</b> para iniciar ou ajuste antes.');
    configLines.push('<code>não</code> — cancelar');

    await ctx.reply(configLines.join('\n'), { parse_mode: 'HTML' });
    session.setPendingRerun(chatId, { payload, stages: sortedStages, campaignFolder });
  });
}

module.exports = { registerRerunCommands };
