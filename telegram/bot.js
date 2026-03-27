/**
 * Telegram Bot for timesmkt2
 *
 * Receives instructions via Telegram, dispatches pipeline jobs,
 * and returns results (text, images, videos) to the chat.
 *
 * Usage: node telegram/bot.js
 */

const { Bot, InputFile } = require('grammy');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const config = require('./config');
const session = require('./session');
const { toTelegramHTML, splitMessage } = require('./formatter');
const { sendPhoto, sendVideo, sendDocument, sendCampaignOutputs } = require('./media');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const bot = new Bot(config.botToken);

const BOT_ACK = 'inemamkt >';

// ── Auth middleware ──────────────────────────────────────────────────────────

bot.use(async (ctx, next) => {
  // If allowedChatIds is empty, allow all (dev mode)
  if (config.allowedChatIds.length > 0) {
    const chatId = String(ctx.chat?.id);
    if (!config.allowedChatIds.includes(chatId)) {
      return ctx.reply('Acesso nao autorizado.');
    }
  }

  // Send ack before processing any message
  if (ctx.message?.text) {
    const text = ctx.message.text;
    // Skip ack for help commands (instant responses)
    const skipAck = /^\/(start|help|projetos|outputs|status)/.test(text);
    if (!skipAck) {
      await ctx.reply(BOT_ACK);
    }
  }

  await next();
});

// ── /start ──────────────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  await ctx.reply(
    `Ola! Sou o bot do <b>Times MKT</b>.\n\n` +
    `Projeto ativo: <code>${s.projectDir}</code>\n\n` +
    `Comandos:\n` +
    `/projetos — listar projetos\n` +
    `/projeto &lt;nome&gt; — selecionar projeto\n` +
    `/campanha &lt;nome&gt; — rodar pipeline completo\n` +
    `/status — ver status do pipeline\n` +
    `/outputs — listar campanhas geradas\n` +
    `/enviar &lt;pasta&gt; — receber arquivos da campanha\n` +
    `/novochat — limpar historico\n` +
    `/help — este menu\n\n` +
    `Ou simplesmente escreva uma mensagem e eu respondo como o Claude.`,
    { parse_mode: 'HTML' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `<b>TIMES MKT — Menu Principal</b>\n\n` +

    `<b>Projetos</b>\n` +
    `/projetos — lista projetos\n` +
    `/projeto &lt;nome&gt; — muda projeto ativo\n\n` +

    `<b>Pipeline</b>\n` +
    `/campanha &lt;nome&gt; [opcoes] — pipeline completo\n` +
    `/status — status do pipeline\n` +
    `/outputs — lista campanhas\n` +
    `/enviar &lt;pasta&gt; — receber arquivos\n\n` +

    `<b>Agentes</b>\n` +
    `/pesquisa &lt;tema&gt; — Research Agent\n` +
    `/copy &lt;campanha&gt; — Copywriter Agent\n\n` +

    `<b>Midia</b>\n` +
    `/img-api, /img-free, /img-svg, /img-pasta\n` +
    `/video-api, /video-fmt, /video-clip-pasta\n` +
    `/musica-free, /musica-api\n` +
    `/sfx-free\n` +
    `/tts-api, /tts-free\n` +
    `/media-status\n\n` +

    `<b>Conversa</b>\n` +
    `/novochat — limpa historico\n` +
    `Texto livre = conversa com Claude\n\n` +

    `<b>Detalhes por tema:</b>\n` +
    `/helpcampanha — pipeline e opcoes\n` +
    `/helpimagens — geracao e busca de imagens\n` +
    `/helpvideos — criacao de videos\n` +
    `/helpaudio — musica, SFX e narracao\n` +
    `/helpcustos — tabela de custos por comando`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpcampanha ──────────────────────────────────────────────────────────

bot.command('helpcampanha', async (ctx) => {
  await ctx.reply(
    `<b>PIPELINE COMPLETO — /campanha</b>\n\n` +

    `Roda todos os agentes em ordem:\n` +
    `Pesquisa → Ads + Video + Copy (paralelo) → Distribuicao\n\n` +

    `<b>Uso:</b>\n` +
    `<code>/campanha &lt;nome&gt; [opcoes]</code>\n\n` +

    `<b>Opcoes:</b>\n` +
    `  --date YYYY-MM-DD (padrao: hoje)\n` +
    `  --lang pt-BR|en (padrao: pt-BR)\n` +
    `  --platforms instagram,youtube,threads\n` +
    `  --images N — qtd de imagens (padrao: 1)\n` +
    `  --videos N — qtd de videos (padrao: 1)\n` +
    `  --skip-research — pula pesquisa\n` +
    `  --skip-image — pula imagens\n` +
    `  --skip-video — pula videos\n\n` +

    `<b>Exemplos:</b>\n` +
    `<code>/campanha dia_das_maes --date 2026-05-10 --images 5 --videos 2</code>\n` +
    `<code>/campanha black_friday --skip-research --images 3</code>\n` +
    `<code>/campanha lancamento --platforms instagram --videos 1</code>\n\n` +

    `<b>Agentes individuais:</b>\n` +
    `/pesquisa &lt;tema&gt; — so o Research Agent\n` +
    `/copy &lt;campanha&gt; — so o Copywriter\n\n` +

    `<b>Acompanhamento:</b>\n` +
    `/status — ve qual agente esta rodando\n` +
    `/outputs — lista campanhas prontas\n` +
    `/enviar &lt;pasta&gt; — recebe os arquivos aqui`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpimagens ───────────────────────────────────────────────────────────

bot.command('helpimagens', async (ctx) => {
  await ctx.reply(
    `<b>IMAGENS — Comandos</b>\n\n` +

    `<b>/img-api [prompt]</b> — Gera imagem via IA (~$0.004)\n` +
    `  --provider: kie (padrao), dalle, stability\n` +
    `  --ratio: 1:1, 4:3, 3:4, 16:9, 9:16\n` +
    `  --quality: standard, hd\n` +
    `Exemplos:\n` +
    `<code>/img-api mae e filha tomando cafe juntas</code>\n` +
    `<code>/img-api --provider dalle cafe em estilo cartoon</code>\n` +
    `<code>/img-api --ratio 9:16 cold brew em fundo escuro</code>\n\n` +

    `<b>/img-free [busca]</b> — Foto stock gratuita\n` +
    `  --provider: pexels (padrao), unsplash, pixabay\n` +
    `  --orientation: landscape, portrait, square\n` +
    `Exemplos:\n` +
    `<code>/img-free cafe da manha com familia</code>\n` +
    `<code>/img-free --provider pixabay --orientation portrait cafe</code>\n\n` +

    `<b>/img-svg [descricao]</b> — HTML→PNG via Playwright (gratis)\n` +
    `  --size: 1080x1080 (padrao), 1080x1920, 1920x1080\n` +
    `Exemplos:\n` +
    `<code>/img-svg card de produto com fundo escuro e texto dourado</code>\n` +
    `<code>/img-svg --size 1080x1920 story com headline bold</code>\n\n` +

    `<b>/img-pasta [caminho]</b> — Usa imagens locais\n` +
    `<code>/img-pasta prj/coldbrew-coffee-co/assets/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpvideos ────────────────────────────────────────────────────────────

bot.command('helpvideos', async (ctx) => {
  await ctx.reply(
    `<b>VIDEOS — Comandos</b>\n\n` +

    `<b>/video-api [prompt]</b> — Gera video completo (gratis)\n` +
    `O Claude cria um scene plan → Remotion renderiza o video.\n` +
    `  --count: quantidade (padrao: 1)\n` +
    `  --fmt: v (vertical), q (quadrado), h (horizontal)\n` +
    `  --duration: 10, 15, 20, 30 segundos\n` +
    `Exemplos:\n` +
    `<code>/video-api mae e filha preparando cold brew</code>\n` +
    `<code>/video-api --count 2 --fmt v campanha de Pascoa</code>\n` +
    `<code>/video-api --duration 15 --fmt v,q campanha de Natal</code>\n\n` +

    `<b>/video-fmt [formato]</b> — Define formato\n` +
    `  v = 1080x1920 — Reels, Stories, Shorts\n` +
    `  q = 1080x1080 — Feed Instagram\n` +
    `  h = 1920x1080 — YouTube\n` +
    `  v,q = gera nos dois formatos\n\n` +

    `<b>/video-clip-pasta [caminho]</b> — Clips locais como assets\n` +
    `<code>/video-clip-pasta prj/coldbrew-coffee-co/assets/clips/</code>\n\n` +

    `<b>Como funciona o video:</b>\n` +
    `1. Claude gera um scene_plan.json com cenas, textos, cores\n` +
    `2. Remotion renderiza cada cena em video MP4\n` +
    `3. Cenas: Hook (0-3s) → Produto (3-8s) → Beneficio (8-12s) → CTA (12-15s)\n` +
    `4. Todas as animacoes usam o brand palette do projeto`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpaudio ─────────────────────────────────────────────────────────────

bot.command('helpaudio', async (ctx) => {
  await ctx.reply(
    `<b>AUDIO — Musica, SFX e Narracao</b>\n\n` +

    `<b>MUSICA</b>\n\n` +
    `<b>/musica-free [busca]</b> — Royalty-free (gratis)\n` +
    `  --provider: pixabay (padrao), freesound\n` +
    `  --duration: duracao max em segundos\n` +
    `<code>/musica-free lo-fi piano suave</code>\n` +
    `<code>/musica-free --duration 30 piano acustico</code>\n\n` +

    `<b>/musica-api [prompt]</b> — Musica via IA (~$0.05)\n` +
    `  --provider: suno | --duration: 15, 30, 60\n` +
    `<code>/musica-api lo-fi para video de Dia das Maes</code>\n\n` +

    `<b>EFEITOS SONOROS</b>\n\n` +
    `<b>/sfx-free [busca]</b> — SFX gratuito\n` +
    `  --provider: pixabay (padrao), freesound\n` +
    `<code>/sfx-free cafe sendo servido</code>\n` +
    `<code>/sfx-free whoosh transition</code>\n\n` +

    `<b>NARRACAO / TTS</b>\n\n` +
    `<b>/tts-api [texto]</b> — Voz IA premium (~$0.30/1k chars)\n` +
    `  --provider: elevenlabs (padrao), openai, minimax\n` +
    `  --voice:\n` +
    `    ElevenLabs: Rachel (fem, quente), Bella (fem, suave),\n` +
    `    Antoni (masc), Josh (masc, grave), Arnold (masc, forte)\n` +
    `    OpenAI: nova (fem), shimmer (fem), echo (quente),\n` +
    `    onyx (masc, grave), alloy (neutra), fable (expressiva)\n` +
    `  --lang: pt-BR, en, es\n` +
    `<code>/tts-api --voice Rachel Presente perfeito.</code>\n\n` +

    `<b>/tts-free [texto]</b> — TTS local (Piper, gratis)\n` +
    `<code>/tts-free Cada gole e um abraco.</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpcustos ────────────────────────────────────────────────────────────

bot.command('helpcustos', async (ctx) => {
  await ctx.reply(
    `<b>REFERENCIA DE CUSTOS</b>\n\n` +
    `<pre>` +
    `Comando        Custo          Provider\n` +
    `─────────────────────────────────────────\n` +
    `/img-api       ~$0.004/img    Kie.ai\n` +
    `/img-free      gratis         Pexels\n` +
    `/img-svg       gratis         Playwright\n` +
    `/video-api     gratis         Remotion\n` +
    `/musica-free   gratis         Pixabay\n` +
    `/musica-api    ~$0.05         Suno\n` +
    `/sfx-free      gratis         Pixabay\n` +
    `/tts-api       ~$0.30/1k ch   ElevenLabs\n` +
    `/tts-free      gratis         Piper\n` +
    `/campanha      variavel       todos` +
    `</pre>\n\n` +
    `O pipeline (/campanha) usa Claude Sonnet para cada agente.\n` +
    `Custo depende do numero de agentes e tamanho dos outputs.`,
    { parse_mode: 'HTML' }
  );
});

// ── /projetos ───────────────────────────────────────────────────────────────

bot.command('projetos', async (ctx) => {
  const prjDir = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjDir)) {
    return ctx.reply('Nenhum projeto encontrado. Pasta prj/ nao existe.');
  }

  const projects = fs.readdirSync(prjDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  if (projects.length === 0) {
    return ctx.reply('Nenhum projeto encontrado em prj/.');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const current = s.projectDir;

  const lines = projects.map(p => {
    const full = `prj/${p}`;
    const marker = full === current ? ' (ativo)' : '';
    return `- <code>${p}</code>${marker}`;
  });

  await ctx.reply(
    `<b>Projetos:</b>\n\n${lines.join('\n')}\n\nUse /projeto &lt;nome&gt; para mudar.`,
    { parse_mode: 'HTML' }
  );
});

// ── /projeto <nome> ─────────────────────────────────────────────────────────

bot.command('projeto', async (ctx) => {
  const name = ctx.match?.trim();
  if (!name) {
    return ctx.reply('Use: /projeto <nome>\nExemplo: /projeto coldbrew-coffee-co');
  }

  const fullPath = path.join(PROJECT_ROOT, 'prj', name);
  if (!fs.existsSync(fullPath)) {
    return ctx.reply(`Projeto nao encontrado: prj/${name}`);
  }

  const chatId = String(ctx.chat.id);
  session.setProject(chatId, `prj/${name}`);

  await ctx.reply(`Projeto ativo: <code>prj/${name}</code>`, { parse_mode: 'HTML' });
});

// ── /outputs ────────────────────────────────────────────────────────────────

bot.command('outputs', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const outputsDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs');

  if (!fs.existsSync(outputsDir)) {
    return ctx.reply('Nenhuma campanha gerada ainda.');
  }

  const folders = fs.readdirSync(outputsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
    .reverse();

  if (folders.length === 0) {
    return ctx.reply('Nenhuma campanha gerada ainda.');
  }

  const lines = folders.map(f => `- <code>${f}</code>`);
  await ctx.reply(
    `<b>Campanhas em ${s.projectDir}:</b>\n\n${lines.join('\n')}\n\nUse /enviar &lt;pasta&gt; para receber os arquivos.`,
    { parse_mode: 'HTML' }
  );
});

// ── /enviar <pasta> ─────────────────────────────────────────────────────────

bot.command('enviar', async (ctx) => {
  const folder = ctx.match?.trim();
  if (!folder) {
    return ctx.reply('Use: /enviar <nome_da_campanha>\nExemplo: /enviar dia_das_maes_2026-05-10');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', folder);

  if (!fs.existsSync(outputDir)) {
    return ctx.reply(`Pasta nao encontrada: ${s.projectDir}/outputs/${folder}`);
  }

  await ctx.reply(`Enviando arquivos de <code>${folder}</code>...`, { parse_mode: 'HTML' });
  await sendCampaignOutputs(ctx, outputDir);
  await ctx.reply('Todos os arquivos enviados.');
});

// ── /campanha ───────────────────────────────────────────────────────────────

bot.command('campanha', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (s.runningTask) {
    return ctx.reply(`Ja existe um pipeline rodando: ${s.runningTask.taskName}. Use /status para acompanhar.`);
  }

  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      'Use: /campanha <nome> [opcoes]\n\n' +
      'Opcoes:\n' +
      '  --date YYYY-MM-DD (padrao: hoje)\n' +
      '  --lang pt-BR|en (padrao: pt-BR)\n' +
      '  --platforms instagram,youtube,threads\n' +
      '  --images N (padrao: 1)\n' +
      '  --videos N (padrao: 1)\n' +
      '  --skip-research\n' +
      '  --skip-image\n' +
      '  --skip-video\n\n' +
      'Exemplo:\n/campanha dia_das_maes --date 2026-05-10 --lang pt-BR --images 5 --videos 2'
    );
  }

  // Parse arguments
  const args = raw.split(/\s+/);
  const taskName = args[0];
  const opts = parseArgs(args.slice(1));

  const today = new Date().toISOString().slice(0, 10);
  const taskDate = opts.date || today;
  const language = opts.lang || 'pt-BR';
  const platforms = opts.platforms ? opts.platforms.split(',') : ['instagram', 'youtube', 'threads'];
  const imageCount = parseInt(opts.images || '1', 10);
  const videoCount = parseInt(opts.videos || '1', 10);

  const payload = {
    task_name: taskName,
    task_date: taskDate,
    project_dir: s.projectDir,
    platform_targets: platforms,
    language,
    skip_research: opts['skip-research'] === true,
    skip_image: opts['skip-image'] === true,
    skip_video: opts['skip-video'] === true,
    image_count: imageCount,
    video_count: videoCount,
    campaign_brief: opts.brief || '',
  };

  const outputDir = `${s.projectDir}/outputs/${taskName}_${taskDate}`;

  session.setRunningTask(chatId, {
    taskName,
    taskDate,
    outputDir,
    startedAt: new Date().toISOString(),
  });

  await ctx.reply(
    `Pipeline iniciado!\n\n` +
    `Tarefa: <code>${taskName}</code>\n` +
    `Data: ${taskDate}\n` +
    `Projeto: <code>${s.projectDir}</code>\n` +
    `Plataformas: ${platforms.join(', ')}\n` +
    `Imagens: ${imageCount} | Videos: ${videoCount}\n` +
    `Idioma: ${language}\n\n` +
    `Use /status para acompanhar.`,
    { parse_mode: 'HTML' }
  );

  // Run orchestrator + worker
  runPipeline(ctx, chatId, payload, outputDir);
});

// ── /status ─────────────────────────────────────────────────────────────────

bot.command('status', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (!s.runningTask) {
    return ctx.reply('Nenhum pipeline rodando no momento.');
  }

  const logsDir = path.join(PROJECT_ROOT, s.runningTask.outputDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    return ctx.reply(
      `Pipeline: <code>${s.runningTask.taskName}</code>\n` +
      `Iniciado: ${s.runningTask.startedAt}\n` +
      `Status: aguardando inicio dos agentes...`,
      { parse_mode: 'HTML' }
    );
  }

  const agents = [
    'research_agent',
    'ad_creative_designer',
    'video_ad_specialist',
    'copywriter_agent',
    'distribution_agent',
  ];

  const lines = agents.map(a => {
    const logFile = path.join(logsDir, `${a}.log`);
    if (!fs.existsSync(logFile)) return `  ${a}: aguardando`;

    const content = fs.readFileSync(logFile, 'utf-8');
    if (content.includes('Completed successfully')) return `  ${a}: completo`;
    if (content.includes('FAILED')) return `  ${a}: FALHOU`;
    if (content.includes('Invoking Claude')) return `  ${a}: rodando...`;
    return `  ${a}: em progresso`;
  });

  await ctx.reply(
    `<b>Pipeline: ${s.runningTask.taskName}</b>\n` +
    `Iniciado: ${s.runningTask.startedAt}\n\n` +
    `<pre>${lines.join('\n')}</pre>`,
    { parse_mode: 'HTML' }
  );
});

// ── /pesquisa <tema> ────────────────────────────────────────────────────────

bot.command('pesquisa', async (ctx) => {
  const tema = ctx.match?.trim();
  if (!tema) {
    return ctx.reply('Use: /pesquisa <tema>\nExemplo: /pesquisa cold brew coffee trends');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  await ctx.reply(`Iniciando pesquisa: "${tema}"...`);

  const today = new Date().toISOString().slice(0, 10);
  const folderName = tema.replace(/\s+/g, '_').toLowerCase();
  const outputDir = path.join(s.projectDir, 'outputs', `${folderName}_${today}`);

  const prompt = `You are the Marketing Research Agent. Follow skills/marketing-research-agent/SKILL.md.
Task: Research "${tema}".
Date: ${today}
Output directory: ${outputDir}/
IMPORTANT: All output files MUST be in Brazilian Portuguese (pt-BR).
Read ${s.projectDir}/knowledge/brand_identity.md and ${s.projectDir}/knowledge/product_campaign.md for brand context.
Save: research_results.json, research_brief.md, interactive_report.html to ${outputDir}/`;

  runClaude(prompt, 'research_agent', (code, stdout) => {
    if (code === 0) {
      ctx.reply(`Pesquisa concluida! Use /enviar ${folderName}_${today} para receber os arquivos.`);
    } else {
      ctx.reply(`Pesquisa falhou (exit code ${code}).`);
    }
  });
});

// ── /copy <campanha> ────────────────────────────────────────────────────────

bot.command('copy', async (ctx) => {
  const campanha = ctx.match?.trim();
  if (!campanha) {
    return ctx.reply('Use: /copy <nome_da_campanha>\nExemplo: /copy dia_das_maes_2026-05-10');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const outputDir = path.join(s.projectDir, 'outputs', campanha);

  if (!fs.existsSync(path.join(PROJECT_ROOT, outputDir))) {
    return ctx.reply(`Campanha nao encontrada: ${outputDir}`);
  }

  await ctx.reply(`Gerando copy para "${campanha}"...`);

  const prompt = `You are the Copywriter Agent. Follow skills/copywriter-agent/SKILL.md.
Task: Write copy for campaign "${campanha}".
Platforms: instagram, youtube, threads
Research input: ${outputDir}/research_results.json
IMPORTANT: ALL copy MUST be in Brazilian Portuguese (pt-BR).
Read ${s.projectDir}/knowledge/brand_identity.md, ${s.projectDir}/knowledge/product_campaign.md, ${s.projectDir}/knowledge/platform_guidelines.md.
Save to ${outputDir}/copy/: threads_post.txt, instagram_caption.txt, youtube_metadata.json, copy_output.json`;

  runClaude(prompt, 'copywriter_agent', (code) => {
    if (code === 0) {
      ctx.reply(`Copy gerado! Use /enviar ${campanha} para receber os arquivos.`);
    } else {
      ctx.reply(`Geracao de copy falhou (exit code ${code}).`);
    }
  });
});

// ── /novochat ───────────────────────────────────────────────────────────────

bot.command('novochat', async (ctx) => {
  const chatId = String(ctx.chat.id);
  session.clearHistory(chatId);
  await ctx.reply('Historico limpo. Nova conversa iniciada.');
});

// ── Free text → Claude conversation ─────────────────────────────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  // Ignore commands (already handled above)
  if (text.startsWith('/')) return;

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  // Don't stack requests
  if (s.processing) {
    return ctx.reply('Aguarde, ainda estou processando a mensagem anterior...');
  }

  s.processing = true;

  // Show typing indicator
  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});
  }, 4000);
  ctx.api.sendChatAction(ctx.chat.id, 'typing').catch(() => {});

  // Add user message to history
  session.addToHistory(chatId, 'user', text);

  // Build conversation context for Claude
  const history = session.getHistory(chatId);
  const conversationContext = history.slice(0, -1).map(m => {
    const prefix = m.role === 'user' ? 'User' : 'Assistant';
    return `${prefix}: ${m.content}`;
  }).join('\n\n');

  const systemContext = `You are the assistant for the Times MKT marketing automation system.
The active project is: ${s.projectDir}
Project root contains: skills/ (agent skills), pipeline/ (BullMQ orchestrator), prj/ (client projects).
Each project in prj/ has: assets/, knowledge/ (brand_identity.md, product_campaign.md, platform_guidelines.md), outputs/.
Respond in the same language the user writes in (usually Brazilian Portuguese).
Be concise and helpful. You have full access to the codebase.`;

  const prompt = conversationContext
    ? `${systemContext}\n\nConversation so far:\n${conversationContext}\n\nUser: ${text}\n\nRespond to the user's latest message.`
    : `${systemContext}\n\nUser: ${text}`;

  try {
    runClaude(prompt, 'chat', (code, stdout) => {
      clearInterval(typingInterval);
      s.processing = false;

      if (code !== 0 || !stdout.trim()) {
        ctx.reply('Desculpe, tive um problema ao processar. Tente novamente.');
        return;
      }

      const response = stdout.trim();
      session.addToHistory(chatId, 'assistant', response);

      // Send response, splitting if needed
      const parts = splitMessage(toTelegramHTML(response));
      (async () => {
        for (const part of parts) {
          try {
            await ctx.reply(part, { parse_mode: 'HTML' });
          } catch {
            // Fallback to plain text if HTML fails
            await ctx.reply(part);
          }
        }
      })();
    });
  } catch (err) {
    clearInterval(typingInterval);
    s.processing = false;
    await ctx.reply(`Erro: ${err.message}`);
  }
});

// ── Pipeline runner ─────────────────────────────────────────────────────────

function runPipeline(ctx, chatId, payload, outputDir) {
  const payloadStr = JSON.stringify(payload);

  // Step 1: enqueue jobs
  const orch = spawn('node', [
    'pipeline/orchestrator.js',
    '--payload', payloadStr,
  ], { cwd: PROJECT_ROOT });

  let orchOut = '';
  orch.stdout.on('data', d => { orchOut += d.toString(); });
  orch.stderr.on('data', d => { orchOut += d.toString(); });

  orch.on('close', (code) => {
    if (code !== 0) {
      ctx.reply(`Orchestrator falhou:\n<pre>${orchOut.slice(0, 2000)}</pre>`, { parse_mode: 'HTML' });
      session.clearRunningTask(chatId);
      return;
    }

    ctx.reply('Jobs enfileirados. Iniciando worker...');

    // Step 2: start worker
    const worker = spawn('node', ['pipeline/worker.js'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env },
    });

    let lastUpdate = '';
    worker.stdout.on('data', (d) => {
      const text = d.toString();

      // Notify on agent completions
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
    });

    worker.stderr.on('data', (d) => {
      const text = d.toString();
      if (text.includes('Error') || text.includes('error')) {
        ctx.reply(`Worker erro: ${text.slice(0, 500)}`);
      }
    });

    // Monitor for completion — check every 30s if all agents are done
    const monitor = setInterval(() => {
      const logsDir = path.join(PROJECT_ROOT, outputDir, 'logs');
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

      const allDone = agents.every(a => {
        if (skipFlags[a]) return true;
        const logFile = path.join(logsDir, `${a}.log`);
        if (!fs.existsSync(logFile)) return false;
        const content = fs.readFileSync(logFile, 'utf-8');
        return content.includes('Completed successfully') || content.includes('FAILED');
      });

      if (allDone) {
        clearInterval(monitor);
        worker.kill('SIGTERM');
        session.clearRunningTask(chatId);

        ctx.reply(
          `Pipeline <b>${payload.task_name}</b> concluido!\n\n` +
          `Use /enviar ${payload.task_name}_${payload.task_date} para receber os arquivos.\n` +
          `Use /status para ver o resumo.`,
          { parse_mode: 'HTML' }
        );
      }
    }, 30000);

    // Timeout after 30 min
    setTimeout(() => {
      clearInterval(monitor);
      worker.kill('SIGTERM');
      session.clearRunningTask(chatId);
      ctx.reply('Pipeline timeout (30 min). Verifique /status.');
    }, 1800000);
  });
}

// ── Claude CLI runner (for individual agents) ───────────────────────────────

function runClaude(prompt, agentName, callback) {
  const child = spawn('claude', [
    '-p', prompt,
    '--dangerously-skip-permissions',
    '--model', 'sonnet',
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { /* ignore */ });

  child.on('close', (code) => {
    callback(code, stdout);
  });

  // 10 min timeout
  setTimeout(() => { child.kill('SIGTERM'); }, 600000);
}

// ── Arg parser ──────────────────────────────────────────────────────────────

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];
      if (!nextArg || nextArg.startsWith('--')) {
        opts[key] = true; // flag
      } else {
        opts[key] = nextArg;
        i++;
      }
    }
  }
  return opts;
}

// ── Start bot ───────────────────────────────────────────────────────────────

bot.catch((err) => {
  console.error('Bot error:', err.message);
});

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot @${botInfo.username} rodando (long-polling)`);
    console.log(`Projeto padrao: ${session.DEFAULT_PROJECT}`);
    console.log('Ctrl+C para parar.\n');
  },
});
