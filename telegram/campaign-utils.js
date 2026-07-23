const fs = require('fs');
const path = require('path');
const { getDefaultImageModel } = require('../config/env');

function resolveStageAlias(alias) {
  const map = {
    brief: 1, narrativa: 1, pesquisa: 1, research: 1, estrategia: 1,
    imagens: 2, imagem: 2, ads: 2, carousel: 2, carrossel: 2, designer: 2,
    video: 3, videos: 3, quick: 3, pro: 3,
    plataformas: 4, plataforma: 4, instagram: 4, youtube: 4, tiktok: 4, facebook: 4, threads: 4, linkedin: 4, copy: 4,
    distribuicao: 5, publicar: 5, publish: 5,
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
  };
  return map[String(alias).toLowerCase()] || null;
}

function buildPayload(taskName, opts, projectDir, today, env = process.env) {
  return {
    task_name: taskName.replace(/\s+/g, '_').toLowerCase(),
    task_date: opts.date || today,
    project_dir: projectDir,
    platform_targets: opts.platforms ? opts.platforms.split(',') : ['instagram', 'youtube', 'threads', 'facebook', 'tiktok', 'linkedin'],
    language: opts.lang || 'pt-BR',
    skip_research: opts['skip-research'] === true,
    skip_image: opts['skip-image'] === true,
    skip_video: opts['skip-video'] === true,
    image_count: parseInt(opts.images || '5', 10),
    image_formats: ['carousel_1080x1080'],
    video_count: parseInt(opts.videos || '1', 10),
    image_source: opts['img-source'] || 'brand',
    image_background_color: opts['img-bg-color'] || null,
    screenshot_urls: opts['screenshot-urls'] ? opts['screenshot-urls'].split(',').map(u => u.trim()) : [],
    image_model: opts['img-model'] || getDefaultImageModel(env.IMAGE_PROVIDER, env),
    use_brand_overlay: opts['brand-overlay'] !== 'false',
    campaign_brief: opts.brief || '',
    video_mode: opts['video-pro'] ? 'pro' : 'quick',
    approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
    tts_provider: opts['tts-provider'] || 'auto',
  };
}

function buildConfigTable(payload, title, env = process.env) {
  const imageSource = payload.image_source || 'brand';
  const providerLabel = (payload.image_provider || env.IMAGE_PROVIDER || 'inemaimg').toUpperCase();
  const modelLabels = {
    'z-image': 'Z-Image', 'z-image-turbo': 'Z-Image Turbo',
    'flux-kontext-pro': 'Flux Pro', 'flux-kontext-max': 'Flux Max', 'gpt-image-1': 'GPT-Image-1',
    seedream: 'SeedReam', 'flux-2': 'FLUX 2', 'grok-imagine': 'Grok Imagine', 'nano-banana-2': 'Nano Banana 2',
    flux: 'FLUX Schnell', zimage: 'Z-Image Turbo', kontext: 'FLUX Kontext',
    gptimage: 'GPT Image Mini', 'nanobanana-pro': 'Gemini 3 Pro',
    'flux2-klein': 'FLUX.2 Klein', 'flux2-dev': 'FLUX.2 Dev',
    'qwen-edit-2511': 'Qwen Edit 2511', ernie: 'ERNIE-Image',
  };
  const modelLabel = modelLabels[payload.image_model] || payload.image_model || 'flux2-klein';

  const DEFAULTS = {
    image_source: 'brand', image_model: 'flux2-klein', image_provider: 'INEMAIMG',
    narrator: 'rachel', video_duration: 60, style_preset: 'inema_hightech',
    photo_quality: 'simples', scene_quality: 'simples',
    video_quick: true, video_pro: false, video_template: 'auto', language: 'pt-BR',
    image_bg_mode: 'dark', notifications: true, approval: 'auto',
    tts_provider: 'auto',
  };

  const vQuick = payload.video_quick !== false;
  const vPro = payload.video_pro === true;
  const bgLabel = payload.image_bg_mode === 'blur' ? 'blur' : 'escuro';
  const approvalAll = Object.values(payload.approval_modes || {});
  const approvalLabel = approvalAll.length > 0 && approvalAll.every(v => v === approvalAll[0]) ? approvalAll[0] : 'misto';
  const sourceLabel = imageSource === 'folder' && payload.image_folder
    ? `folder ${payload.image_folder}`
    : imageSource === 'solid'
      ? `solid ${payload.image_background_color || '#0D0D0D'}`
    : imageSource;

  const rows = [
    { setting: 'Fonte imgs', current: sourceLabel, def: DEFAULTS.image_source, opts: 'brand / api / free / screenshot / folder xxx / solid [cor]' },
    { setting: 'Quick', current: vQuick ? 'sim' : 'nao', def: 'sim', opts: 'sim / sem quick' },
    { setting: 'Pro', current: vPro ? 'sim' : 'nao', def: 'nao', opts: 'pro' },
    { setting: 'Narrador', current: payload.narrator || 'rachel', def: DEFAULTS.narrator, opts: 'rachel / bella / domi / antoni / josh / arnold' },
    { setting: 'TTS', current: payload.tts_provider || 'auto', def: DEFAULTS.tts_provider, opts: 'auto / chatterbox / fish / elevenlabs / openai' },
    { setting: 'Duração', current: `${payload.video_duration || 60}s`, def: '60s', opts: '30 / 60' },
    { setting: 'Estilo', current: payload.style_preset || 'inema_hightech', def: DEFAULTS.style_preset, opts: 'inema_hightech / neon_futurista / premium_minimal / energetico / emocional / corporate / streetwear / nature / retro / bold_pop / dark_dramatic / playful / editorial' },
    { setting: 'Tipografia', current: payload.typography || 'auto', def: 'auto', opts: 'auto / serif / sans / condensed / mono' },
    { setting: 'Dir.Foto', current: payload.photo_quality || 'simples', def: DEFAULTS.photo_quality, opts: 'simples / premium' },
    { setting: 'Scene plan', current: payload.scene_quality || 'simples', def: DEFAULTS.scene_quality, opts: 'simples / premium' },
    { setting: 'Template', current: payload.video_template || 'auto', def: DEFAULTS.video_template, opts: 'auto / data_story / explainer / narrativo / brand_film / ⭐report / ⭐gatilhos' },
    { setting: 'Música', current: payload.video_music || 'nao', def: 'nao', opts: 'nao / sim / auto' },
    { setting: 'SFX', current: payload.video_sfx || 'nao', def: 'nao', opts: 'nao / sim / auto' },
    { setting: 'Fundo quick', current: bgLabel, def: 'escuro', opts: 'escuro / blur' },
    { setting: 'Idioma', current: payload.language || 'pt-BR', def: DEFAULTS.language, opts: 'pt-BR / en' },
    { setting: 'Aprovação', current: approvalLabel, def: DEFAULTS.approval, opts: 'humano / auto' },
    { setting: 'Notif', current: payload.notifications === false ? 'off' : 'on', def: 'on', opts: 'on / off' },
  ];

  if (imageSource === 'api') {
    rows.splice(1, 0,
      { setting: 'Provider', current: providerLabel, def: DEFAULTS.image_provider, opts: 'inemaimg / kie / pollinations / piramyd' },
      { setting: 'Modelo', current: modelLabel, def: DEFAULTS.image_model, opts: 'flux2-klein / qwen-edit-2511 / ernie / flux2-dev / z-image / flux' },
    );
  }

  const lines = [
    `<b>${title}</b>\n`,
    `<b>Nome:</b> <code>${payload.task_name}</code>`,
    `<b>Projeto:</b> <code>${payload.project_dir}</code>`,
    `<b>Plataformas:</b> ${(payload.platform_targets || []).join(', ')}`,
    '',
    `<code>Config       Atual         Opções</code>`,
    `<code>──────────── ───────────── ─────────────</code>`,
  ];

  for (const row of rows) {
    const changed = String(row.current) !== String(row.def);
    const indicator = changed ? '•' : ' ';
    const setting = row.setting.padEnd(12);
    const current = String(row.current).padEnd(13);
    lines.push(`<code>${indicator} ${setting} ${current}</code> <i>${row.opts}</i>`);
  }

  const skipFlags = [];
  if (payload.skip_research) skipFlags.push('pesquisa');
  if (payload.skip_image) skipFlags.push('imagens');
  if (payload.skip_video) skipFlags.push('video');
  if (skipFlags.length > 0) lines.push(`\n<b>Pular:</b> ${skipFlags.join(', ')}`);

  return lines;
}

async function showCampaignConfirmation({ ctx, chatId, payload, session, env = process.env }) {
  let nextPayload = payload;
  if (nextPayload.image_source === 'api' && nextPayload.use_brand_overlay === undefined) {
    nextPayload = { ...nextPayload, use_brand_overlay: true };
  }

  const lines = buildConfigTable(nextPayload, 'Campanha pronta — confirme:', env);
  lines.push(`\n<i>• = alterado do default</i>`);
  lines.push(`\nResponda <b>sim</b> para rodar ou ajuste antes.`);
  lines.push(`Digite o comando pra alterar (ex: <code>pro</code>, <code>narrador bella</code>, <code>modelo flux</code>)`);
  lines.push(`<code>não</code> — cancelar`);

  session.setPendingCampaign(chatId, nextPayload);
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

  if (nextPayload.campaign_brief) {
    await ctx.reply(`<b>Brief:</b>\n${nextPayload.campaign_brief}`, { parse_mode: 'HTML' });
  }
}

function parseCampaignFromText({ text, projectDir, projectRoot, runClaude, callback, env = process.env }) {
  const today = new Date().toISOString().slice(0, 10);
  const projectMatch = text.match(/projeto\s+([\w-]+)/i);
  if (projectMatch) {
    const mentioned = projectMatch[1].toLowerCase();
    const prjDir = path.join(projectRoot, 'prj');
    if (fs.existsSync(prjDir)) {
      const projects = fs.readdirSync(prjDir);
      const found = projects.find(p => p.toLowerCase().includes(mentioned) || mentioned.includes(p.toLowerCase()));
      if (found) projectDir = `prj/${found}`;
    }
  }

  const prompt = `Extract campaign parameters from this request and return ONLY a JSON object.

Request: "${text}"
Available project dir: ${projectDir}
Today: ${today}

Return a JSON object with these fields:
{
  "task_name": "snake_case name (e.g. pascoa_2026, dia_das_maes, natal)",
  "task_date": "YYYY-MM-DD (use today if not specified: ${today})",
  "project_dir": "${projectDir}",
  "platform_targets": ["instagram", "youtube", "threads"],
  "language": "pt-BR",
  "skip_research": false,
  "skip_image": false,
  "skip_video": false,
  "image_count": 5,
  "image_formats": ["carousel_1080x1080"],
  "video_count": 1,
  "video_quick": true,
  "video_pro": false,
  "video_template": "auto",
  "image_source": "brand",
  "image_background_color": null,
  "image_model": "${getDefaultImageModel(env.IMAGE_PROVIDER, env)}",
  "approval_modes": {
    "stage1": "auto",
    "stage2": "auto",
    "stage3": "auto",
    "stage4": "auto",
    "stage5": "auto"
  },
  "notifications": true,
  "video_audio": "narration",
  "tts_provider": "auto",
  "campaign_brief": "full campaign brief in pt-BR summarizing the intent, audience, tone, key messages"
}

Rules:
- task_name: derive from the campaign theme, short and snake_case
- image_count: default 5 for carousel; use what user says
- image_formats: default ["carousel_1080x1080"] only. Add "story_1080x1920" if user mentions stories or 9:16. Add "reels_1080x1920" if user mentions reels or reel. Only add what is explicitly requested.
- video_count: how many videos requested (default 1)
- video_quick: always true unless user explicitly says "sem video quick" or "only pro"
- video_pro: true if user says "video pro", "video profissional", "remotion", "pro", "both", "2 videos"
- video_template: "auto" (default, agent decides freely), "data_story" (data/statistics focused), "explainer" (step-by-step, process), "narrativo" (text-card narrative), "brand_film" (cinematic, photo-dominant). Set based on user request: "template data_story", "template explicativo", "template narrativo", "template cinematografico/filme".
- image_source: "brand" (or "marca") if user mentions brand images, project images, fotos da marca; "free" (or "gratis") if user mentions free stock photos, banco de imagens, pexels, unsplash, pixabay; "api" if user mentions AI generation, gerar imagens, criar imagens com IA; "folder" (or "pasta") if user specifies a folder path; "screenshot" (or "captura") if user mentions screenshot, captura de site, print do site, capturar pagina; "solid" (or "solido") if user wants no images, only solid/flat background. When screenshot, also populate "screenshot_urls" with any URLs mentioned. Default "brand".
- image_background_color: only relevant when image_source is "solid". If user says just "solido", default to "#0D0D0D". If they specify a color, preserve it (e.g. "#112233").
- image_model: only relevant when image_source is "api". Default is ALWAYS "${getDefaultImageModel(env.IMAGE_PROVIDER, env)}" (derived from IMAGE_PROVIDER + per-provider defaults in .env). Only change if the user explicitly requests a different model. Options depend on provider: inemaimg → "flux2-klein", "qwen-edit-2511", "ernie", "flux2-dev"; kie → "z-image", "z-image-turbo", "flux-kontext-pro", "flux-kontext-max", "gpt-image-1"; pollinations → "flux".
- approval_modes: each stage can be "humano" (user must approve), "agente" (AI reviewer decides), or "auto" (advance automatically). Default "auto" for all. Set to "humano" if user explicitly asks for approval before each stage. Set to "agente" if user says "aprovação por agente", "agente revisa".
- notifications: false only if user explicitly says "sem notificações", "silencioso", "não notificar".
- video_audio: "narration" if user wants voiceover/narração (default), "music" if user wants background music only, "both" if user wants narration + music, "none" for silent/no audio.
- tts_provider: "auto" by default (uses chatterbox-vc local daemon, falls back to fish then elevenlabs). Set to "chatterbox", "fish", "elevenlabs", or "openai" only if the user explicitly asks for that TTS provider.
- campaign_brief: comprehensive summary of everything the user described
- Return ONLY the JSON object, no markdown, no explanation`;

  runClaude(prompt, 'campaign_parser', (code, stdout) => {
    if (code !== 0 || !stdout.trim()) return callback(null);
    try {
      // Extract first complete JSON object (balanced braces), handling code blocks
      const source = stdout.replace(/```(?:json)?\s*/g, '').replace(/```/g, '');
      const start = source.indexOf('{');
      if (start === -1) return callback(null);
      let depth = 0, end = -1;
      for (let i = start; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) return callback(null);
      const payload = JSON.parse(source.slice(start, end + 1));
      const modelKeywords = ['z-image-turbo', 'flux-kontext-pro', 'flux-kontext-max', 'gpt-image-1', 'flux pro', 'flux max', 'gpt image', 'flux2-klein', 'flux2-dev', 'qwen-edit', 'ernie'];
      const userPickedModel = modelKeywords.some(k => text.toLowerCase().includes(k));
      if (!userPickedModel) payload.image_model = getDefaultImageModel(env.IMAGE_PROVIDER, env);
      payload.video_quick = true;
      payload.video_pro = payload.video_pro === true;
      payload.video_mode = payload.video_pro ? 'both' : 'quick';
      const validTemplates = ['auto', 'data_story', 'explainer', 'narrativo', 'brand_film', 'report', 'gatilhos'];
      payload.video_template = validTemplates.includes(payload.video_template) ? payload.video_template : 'auto';
      callback(payload);
    } catch {
      callback(null);
    }
  });
}

module.exports = {
  resolveStageAlias,
  buildPayload,
  buildConfigTable,
  showCampaignConfirmation,
  parseCampaignFromText,
};
