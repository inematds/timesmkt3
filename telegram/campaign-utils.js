const fs = require('fs');
const path = require('path');

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
    image_formats: ['carousel_1080x1080', 'story_1080x1920'],
    video_count: parseInt(opts.videos || '1', 10),
    image_source: opts['img-source'] || 'brand',
    screenshot_urls: opts['screenshot-urls'] ? opts['screenshot-urls'].split(',').map(u => u.trim()) : [],
    image_model: opts['img-model'] || env.KIE_DEFAULT_MODEL || (env.IMAGE_PROVIDER === 'pollinations' ? 'flux' : 'z-image'),
    use_brand_overlay: opts['brand-overlay'] !== 'false',
    campaign_brief: opts.brief || '',
    video_mode: opts['video-pro'] ? 'pro' : 'quick',
    approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
  };
}

function buildConfigTable(payload, title, env = process.env) {
  const imageSource = payload.image_source || 'brand';
  const providerLabel = (payload.image_provider || env.IMAGE_PROVIDER || 'kie').toUpperCase();
  const modelLabels = {
    'z-image': 'Z-Image', 'z-image-turbo': 'Z-Image Turbo',
    'flux-kontext-pro': 'Flux Pro', 'flux-kontext-max': 'Flux Max', 'gpt-image-1': 'GPT-Image-1',
    seedream: 'SeedReam', 'flux-2': 'FLUX 2', 'grok-imagine': 'Grok Imagine', 'nano-banana-2': 'Nano Banana 2',
    flux: 'FLUX Schnell', zimage: 'Z-Image Turbo', kontext: 'FLUX Kontext',
    gptimage: 'GPT Image Mini', 'nanobanana-pro': 'Gemini 3 Pro',
  };
  const modelLabel = modelLabels[payload.image_model] || payload.image_model || 'z-image';

  const DEFAULTS = {
    image_source: 'brand', image_model: 'z-image', image_provider: 'KIE',
    narrator: 'rachel', video_duration: 60, style_preset: 'inema_hightech',
    photo_quality: 'simples', scene_quality: 'simples',
    video_quick: true, video_pro: false, language: 'pt-BR',
    image_bg_mode: 'dark', notifications: true, approval: 'auto',
  };

  const vQuick = payload.video_quick !== false;
  const vPro = payload.video_pro === true;
  const bgLabel = payload.image_bg_mode === 'blur' ? 'blur' : 'escuro';
  const approvalAll = Object.values(payload.approval_modes || {});
  const approvalLabel = approvalAll.length > 0 && approvalAll.every(v => v === approvalAll[0]) ? approvalAll[0] : 'misto';
  const sourceLabel = imageSource === 'folder' && payload.image_folder
    ? `folder ${payload.image_folder}`
    : imageSource;

  const rows = [
    { setting: 'Fonte imgs', current: sourceLabel, def: DEFAULTS.image_source, opts: 'brand / api / free / screenshot / folder xxx' },
    { setting: 'Quick', current: vQuick ? 'sim' : 'nao', def: 'sim', opts: 'sim / sem quick' },
    { setting: 'Pro', current: vPro ? 'sim' : 'nao', def: 'nao', opts: 'pro' },
    { setting: 'Narrador', current: payload.narrator || 'rachel', def: DEFAULTS.narrator, opts: 'rachel / bella / domi / antoni / josh / arnold' },
    { setting: 'Duração', current: `${payload.video_duration || 60}s`, def: '60s', opts: '30 / 60' },
    { setting: 'Estilo', current: payload.style_preset || 'inema_hightech', def: DEFAULTS.style_preset, opts: 'inema_hightech / 01_hero_film / ...' },
    { setting: 'Dir.Foto', current: payload.photo_quality || 'simples', def: DEFAULTS.photo_quality, opts: 'simples / premium' },
    { setting: 'Scene plan', current: payload.scene_quality || 'simples', def: DEFAULTS.scene_quality, opts: 'simples / premium' },
    { setting: 'Fundo quick', current: bgLabel, def: 'escuro', opts: 'escuro / blur' },
    { setting: 'Idioma', current: payload.language || 'pt-BR', def: DEFAULTS.language, opts: 'pt-BR / en' },
    { setting: 'Aprovação', current: approvalLabel, def: DEFAULTS.approval, opts: 'humano / auto' },
    { setting: 'Notif', current: payload.notifications === false ? 'off' : 'on', def: 'on', opts: 'on / off' },
  ];

  if (imageSource === 'api') {
    rows.splice(1, 0,
      { setting: 'Provider', current: providerLabel, def: DEFAULTS.image_provider, opts: 'kie / pollinations' },
      { setting: 'Modelo', current: modelLabel, def: DEFAULTS.image_model, opts: 'z-image / flux / flux-2 / seedream' },
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
  "image_formats": ["carousel_1080x1080", "story_1080x1920"],
  "video_count": 1,
  "video_quick": true,
  "video_pro": false,
  "image_source": "brand",
  "image_model": "${env.KIE_DEFAULT_MODEL || 'z-image'}",
  "approval_modes": {
    "stage1": "auto",
    "stage2": "auto",
    "stage3": "auto",
    "stage4": "auto",
    "stage5": "auto"
  },
  "notifications": true,
  "video_audio": "narration",
  "campaign_brief": "full campaign brief in pt-BR summarizing the intent, audience, tone, key messages"
}

Rules:
- task_name: derive from the campaign theme, short and snake_case
- image_count: default 5 for carousel; use what user says
- video_count: how many videos requested (default 1)
- video_quick: always true unless user explicitly says "sem video quick" or "only pro"
- video_pro: true if user says "video pro", "video profissional", "remotion", "pro", "both", "2 videos"
- image_source: "brand" (or "marca") if user mentions brand images, project images, fotos da marca; "free" (or "gratis") if user mentions free stock photos, banco de imagens, pexels, unsplash, pixabay; "api" if user mentions AI generation, gerar imagens, criar imagens com IA; "folder" (or "pasta") if user specifies a folder path; "screenshot" (or "captura") if user mentions screenshot, captura de site, print do site, capturar pagina. When screenshot, also populate "screenshot_urls" with any URLs mentioned. Default "brand".
- image_model: only relevant when image_source is "api". Default is ALWAYS "${env.KIE_DEFAULT_MODEL || 'z-image'}" (from .env). Only change if the user explicitly requests a different model. Options: "z-image", "z-image-turbo", "flux-kontext-pro", "flux-kontext-max", "gpt-image-1".
- approval_modes: each stage can be "humano" (user must approve), "agente" (AI reviewer decides), or "auto" (advance automatically). Default "auto" for all. Set to "humano" if user explicitly asks for approval before each stage. Set to "agente" if user says "aprovação por agente", "agente revisa".
- notifications: false only if user explicitly says "sem notificações", "silencioso", "não notificar".
- video_audio: "narration" if user wants voiceover/narração (default), "music" if user wants background music only, "both" if user wants narration + music, "none" for silent/no audio.
- campaign_brief: comprehensive summary of everything the user described
- Return ONLY the JSON object, no markdown, no explanation`;

  runClaude(prompt, 'campaign_parser', (code, stdout) => {
    if (code !== 0 || !stdout.trim()) return callback(null);
    try {
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return callback(null);
      const payload = JSON.parse(jsonMatch[0]);
      const modelKeywords = ['z-image-turbo', 'flux-kontext-pro', 'flux-kontext-max', 'gpt-image-1', 'flux pro', 'flux max', 'gpt image'];
      const userPickedModel = modelKeywords.some(k => text.toLowerCase().includes(k));
      if (!userPickedModel) payload.image_model = env.KIE_DEFAULT_MODEL || 'z-image';
      payload.video_quick = true;
      payload.video_pro = payload.video_pro === true;
      payload.video_mode = payload.video_pro ? 'both' : 'quick';
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
