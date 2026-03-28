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
const { spawn, execFileSync } = require('child_process');

const https = require('https');
const config = require('./config');
const session = require('./session');
const { toTelegramHTML, splitMessage } = require('./formatter');
const { sendPhoto, sendVideo, sendDocument, sendCampaignOutputs } = require('./media');

const PROJECT_ROOT = path.resolve(__dirname, '..');

const { enqueueStage: _enqueueStage, STAGES } = require('../pipeline/orchestrator');

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
    const skipAck = /^\/(start|help|projetos|outputs|status)/.test(text);
    if (!skipAck) await ctx.reply(BOT_ACK);
  } else if (ctx.message?.photo || ctx.message?.document) {
    await ctx.reply(BOT_ACK);
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
    `/modos [etapa] [humano|agente|auto] — modos de aprovacao\n` +
    `/fix &lt;descricao&gt; — corrigir algo no sistema\n` +
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
    `/relatorio &lt;campanha&gt; — resumo + inventario de arquivos\n` +
    `/enviar &lt;campanha&gt; [imagens|videos|audio|copy|tudo]\n` +
    `/aprovar — re-verificar aprovações pendentes\n` +
    `/modos [etapa] [humano|agente|auto] — modos de aprovação\n\n` +

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

    `<b>Fotos (upload)</b>\n` +
    `/fotoprojeto [pasta] — proximas fotos vao para o projeto\n` +
    `/fotocampanha [pasta] — proximas fotos vao para a campanha ativa\n` +
    `Envie foto com legenda "campanha" ou "projeto" para override\n\n` +

    `<b>Conversa</b>\n` +
    `/novochat — limpa historico\n` +
    `Texto livre = conversa com Claude\n\n` +

    `<b>Detalhes por tema:</b>\n` +
    `/helpcampanha — pipeline e etapas v3\n` +
    `/helpaprovacoes — modos de aprovação e Agente Revisor\n` +
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
    `<b>PIPELINE COMPLETO — ATMKT v3</b>\n\n` +

    `O pipeline roda em <b>4 etapas com aprovação</b>:\n` +
    `  <b>1.</b> Pesquisa + Brief Criativo\n` +
    `  <b>2.</b> Imagens + Copy (paralelo)\n` +
    `  <b>3.</b> Vídeo\n` +
    `  <b>4.</b> Distribuição\n\n` +

    `A cada etapa o bot envia o resultado e aguarda sua confirmação antes de avançar (modo padrão). Veja /helpaprovacoes para mudar isso.\n\n` +

    `<b>Como iniciar:</b>\n` +
    `Descreva sua campanha em linguagem natural:\n` +
    `<i>"quero uma campanha de páscoa para o projeto coldbrew com 5 imagens geradas por IA"</i>\n\n` +
    `Ou via comando:\n` +
    `<code>/campanha &lt;nome&gt; [opcoes]</code>\n\n` +

    `<b>Opções:</b>\n` +
    `  --date YYYY-MM-DD (padrão: hoje)\n` +
    `  --lang pt-BR|en (padrão: pt-BR)\n` +
    `  --platforms instagram,youtube,threads\n` +
    `  --images N — qtd de imagens (padrão: 5)\n` +
    `  --videos N — qtd de vídeos (padrão: 1)\n` +
    `  --skip-research — pula pesquisa\n` +
    `  --skip-image — pula imagens\n` +
    `  --skip-video — pula vídeo\n\n` +

    `<b>Exemplos:</b>\n` +
    `<code>/campanha pascoa_2026 --images 5</code>\n` +
    `<code>/campanha black_friday --skip-research --images 3</code>\n` +
    `<code>/campanha lancamento --platforms instagram --videos 1</code>\n\n` +

    `<b>Acompanhamento:</b>\n` +
    `/status — etapa atual e agentes rodando\n` +
    `/outputs — lista campanhas prontas\n` +
    `/enviar &lt;pasta&gt; — recebe os arquivos aqui\n` +
    `/helpaprovacoes — configurar modos de aprovação`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpaprovacoes ────────────────────────────────────────────────────────

bot.command('helpaprovacoes', async (ctx) => {
  await ctx.reply(
    `<b>APROVAÇÕES — Como funciona</b>\n\n` +

    `O pipeline v3 tem <b>4 pontos de aprovação</b>, um por etapa:\n\n` +
    `  <b>Etapa 1</b> — Brief Criativo\n` +
    `  O Diretor de Criação entrega o ângulo estratégico da campanha.\n` +
    `  Você aprova antes das imagens e copy serem gerados.\n\n` +
    `  <b>Etapa 2</b> — Imagens & Copy\n` +
    `  Imagens chegam ao vivo à medida que são geradas.\n` +
    `  Copy (Instagram, Threads, YouTube) é mostrado para aprovação.\n\n` +
    `  <b>Etapa 3</b> — Vídeo\n` +
    `  Roteiro cena a cena é enviado para revisão antes da renderização.\n\n` +
    `  <b>Etapa 4</b> — Distribuição\n` +
    `  Confirmação final antes de publicar nas plataformas.\n\n` +

    `<b>Modos por etapa:</b>\n\n` +
    `  👤 <b>humano</b> — você recebe o resultado e responde <b>sim</b> ou <b>não</b> (padrão)\n` +
    `  🤖 <b>agente</b> — Agente Revisor avalia e decide automaticamente; só notifica se pedir ajuste\n` +
    `  ⚡ <b>auto</b> — avança sem nenhuma aprovação\n\n` +

    `<b>Configurar antes de rodar:</b>\n` +
    `Descreva no briefing:\n` +
    `<i>"campanha de páscoa, aprovação por agente em tudo"</i>\n` +
    `<i>"campanha sem aprovações, notificações desativadas"</i>\n` +
    `<i>"aprovação humana só no brief e na distribuição"</i>\n\n` +

    `<b>Configurar durante a campanha:</b>\n` +
    `<code>/modos todas auto</code> — sem aprovações\n` +
    `<code>/modos todas agente</code> — Agente Revisor em tudo\n` +
    `<code>/modos 1 humano</code> — só etapa 1 com aprovação humana\n` +
    `<code>/modos 3 auto</code> — vídeo sem aprovação\n` +
    `<code>/modos notificacoes off</code> — silencia notificações de agentes\n\n` +

    `<b>O Agente Revisor:</b>\n` +
    `Quando modo <code>agente</code> está ativo, o revisor lê os outputs e decide:\n` +
    `  ✅ Aprovado → avança automaticamente\n` +
    `  ⚠️ Ajuste necessário → manda o feedback para você decidir\n\n` +

    `<b>Respostas aceitas nas aprovações:</b>\n` +
    `  <b>sim</b> / ok / confirma / vai / bora → avança\n` +
    `  <b>não</b> / cancela → cancela a campanha\n` +
    `  Qualquer texto longo → ajuste (ex: "deixa o copy mais direto")`,
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
  const prjRoot = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjRoot)) return ctx.reply('Nenhuma campanha gerada ainda.');

  const projects = fs.readdirSync(prjRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const lines = [];
  for (const prj of projects) {
    const outputsDir = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outputsDir)) continue;
    const folders = fs.readdirSync(outputsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse();
    if (folders.length > 0) {
      lines.push(`<b>${prj}:</b>`);
      folders.forEach(f => lines.push(`  - <code>${f}</code>`));
    }
  }

  if (lines.length === 0) return ctx.reply('Nenhuma campanha gerada ainda.');

  await ctx.reply(
    `<b>Campanhas disponíveis:</b>\n\n${lines.join('\n')}\n\nUse /relatorio &lt;pasta&gt; ou /enviar &lt;pasta&gt; [tipo]`,
    { parse_mode: 'HTML' }
  );
});

// ── /relatorio <campanha> ────────────────────────────────────────────────────
// Send the Publish MD summary + list of available files for download

bot.command('relatorio', async (ctx) => {
  const folder = ctx.match?.trim();
  if (!folder) {
    return ctx.reply('Use: /relatorio <campanha>\nExemplo: /relatorio dia_das_maes_2026-05-10');
  }

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  let outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', folder);

  if (!fs.existsSync(outputDir)) {
    // Try to find the campaign in any project
    const prjRoot = path.join(PROJECT_ROOT, 'prj');
    const projects = fs.existsSync(prjRoot) ? fs.readdirSync(prjRoot) : [];
    let found = null;
    for (const prj of projects) {
      const candidate = path.join(prjRoot, prj, 'outputs', folder);
      if (fs.existsSync(candidate)) { found = candidate; session.setProject(chatId, `prj/${prj}`); break; }
    }
    if (!found) return ctx.reply(`Campanha nao encontrada: ${folder}\n\nUse /outputs para listar campanhas disponíveis.`);
    outputDir = found;
  }

  await sendCampaignReport(ctx, outputDir, folder);
});

// ── /enviar <campanha> [tipo] ────────────────────────────────────────────────
// Download specific file types from a campaign
// tipo: imagens | videos | audio | copy | tudo

bot.command('enviar', async (ctx) => {
  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      'Use: /enviar &lt;campanha&gt; [tipo]\n\n' +
      'Tipos: <code>imagens</code>, <code>videos</code>, <code>audio</code>, <code>copy</code>, <code>tudo</code>\n\n' +
      'Exemplos:\n' +
      '<code>/enviar dia_das_maes_2026-05-10 imagens</code>\n' +
      '<code>/enviar dia_das_maes_2026-05-10 videos</code>\n' +
      '<code>/enviar dia_das_maes_2026-05-10 tudo</code>',
      { parse_mode: 'HTML' }
    );
  }

  const parts = raw.split(/\s+/);
  const folder = parts[0];
  const tipo = parts[1] || 'tudo';

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  let outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', folder);

  if (!fs.existsSync(outputDir)) {
    // Try to find the campaign in any project
    const prjRoot = path.join(PROJECT_ROOT, 'prj');
    const projects = fs.existsSync(prjRoot) ? fs.readdirSync(prjRoot) : [];
    let found = null;
    for (const prj of projects) {
      const candidate = path.join(prjRoot, prj, 'outputs', folder);
      if (fs.existsSync(candidate)) { found = candidate; session.setProject(chatId, `prj/${prj}`); break; }
    }
    if (!found) return ctx.reply(`Campanha nao encontrada: ${folder}\n\nUse /outputs para listar campanhas disponíveis.`);
    outputDir = found;
  }

  await ctx.reply(`Enviando <b>${tipo}</b> de <code>${folder}</code>...`, { parse_mode: 'HTML' });
  await sendCampaignFiles(ctx, outputDir, tipo);
});

// ── Campaign report sender ───────────────────────────────────────────────────

async function sendCampaignReport(ctx, outputDir, folderName) {
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
  const videoExts = ['.mp4', '.mov', '.webm'];
  const audioExts = ['.mp3', '.wav', '.ogg'];

  // Count available files
  const countFiles = (subdir, exts) => {
    const d = path.join(outputDir, subdir);
    if (!fs.existsSync(d)) return 0;
    return fs.readdirSync(d).filter(f => exts.includes(path.extname(f).toLowerCase())).length;
  };

  const imgCount = countFiles('ads', imageExts);
  const vidCount = countFiles('video', videoExts);
  const audioCount = countFiles('audio', audioExts);

  // Send Publish MD if exists
  const publishFiles = fs.readdirSync(outputDir).filter(f => f.startsWith('Publish') && f.endsWith('.md'));
  if (publishFiles.length > 0) {
    const publishPath = path.join(outputDir, publishFiles[0]);
    const publishContent = fs.readFileSync(publishPath, 'utf-8');
    // Send first 3000 chars as text
    const preview = publishContent.slice(0, 3000) + (publishContent.length > 3000 ? '\n\n...' : '');
    const parts = splitMessage(toTelegramHTML(preview));
    for (const part of parts) {
      try {
        await ctx.reply(part, { parse_mode: 'HTML' });
      } catch {
        await ctx.reply(part);
      }
    }
  }

  // Send file inventory
  await ctx.reply(
    `<b>Arquivos disponíveis — ${folderName}</b>\n\n` +
    `🖼 Imagens: <b>${imgCount}</b> arquivos em ads/\n` +
    `🎬 Videos: <b>${vidCount}</b> arquivos em video/\n` +
    `🔊 Audio: <b>${audioCount}</b> arquivos em audio/\n\n` +
    `Para baixar, use:\n` +
    `<code>/enviar ${folderName} imagens</code>\n` +
    `<code>/enviar ${folderName} videos</code>\n` +
    `<code>/enviar ${folderName} audio</code>\n` +
    `<code>/enviar ${folderName} copy</code>\n` +
    `<code>/enviar ${folderName} tudo</code>`,
    { parse_mode: 'HTML' }
  );
}

// ── Campaign file sender by type ─────────────────────────────────────────────

async function sendCampaignFiles(ctx, outputDir, tipo) {
  const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
  const videoExts = ['.mp4', '.mov', '.webm'];
  const audioExts = ['.mp3', '.wav', '.ogg'];

  const sendDir = async (subdir, exts, sendFn) => {
    const d = path.join(outputDir, subdir);
    if (!fs.existsSync(d)) return 0;
    const files = fs.readdirSync(d).filter(f => exts.includes(path.extname(f).toLowerCase()));
    for (const f of files) {
      await sendFn(ctx, path.join(d, f), f);
    }
    return files.length;
  };

  let sent = 0;

  if (tipo === 'imagens' || tipo === 'tudo') {
    sent += await sendDir('ads', imageExts, sendPhoto);
  }
  if (tipo === 'videos' || tipo === 'tudo') {
    sent += await sendDir('video', videoExts, sendVideo);
  }
  if (tipo === 'audio' || tipo === 'tudo') {
    sent += await sendDir('audio', audioExts, sendDocument);
  }
  if (tipo === 'copy' || tipo === 'tudo') {
    sent += await sendDir('copy', ['.txt', '.json', '.md'], sendDocument);
    // Also send Publish MD
    const publishFiles = fs.readdirSync(outputDir).filter(f => f.startsWith('Publish') && f.endsWith('.md'));
    for (const f of publishFiles) {
      await sendDocument(ctx, path.join(outputDir, f), f);
      sent++;
    }
  }

  if (sent === 0) {
    await ctx.reply(`Nenhum arquivo encontrado para o tipo: ${tipo}`);
  } else {
    await ctx.reply(`${sent} arquivo(s) enviado(s).`);
  }
}

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
      '  --date YYYY-MM-DD\n' +
      '  --lang pt-BR|en\n' +
      '  --platforms instagram,youtube,threads\n' +
      '  --images N\n' +
      '  --videos N\n' +
      '  --img-source brand|pexels|api\n' +
      '  --img-model flux-kontext-pro|flux-kontext-max|gpt-image-1\n' +
      '  --skip-research / --skip-image / --skip-video\n\n' +
      'Ou escreva livremente o que quer na campanha — eu organizo e confirmo antes de rodar.'
    );
  }

  const args = raw.split(/\s+/);
  const taskName = args[0];
  const opts = parseArgs(args.slice(1));

  const today = new Date().toISOString().slice(0, 10);
  const payload = buildPayload(taskName, opts, s.projectDir, today);

  await showCampaignConfirmation(ctx, chatId, payload);
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
    'creative_director',
    'ad_creative_designer',
    'copywriter_agent',
    'video_ad_specialist',
    'motion_director',
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

  const cv = s.campaignV3;
  let approvalStatus = '';
  if (cv?.pendingApproval) {
    const stageLabels = { 1: 'Brief Criativo', 2: 'Imagens & Copy', 3: 'Roteiro de Vídeo', 4: 'Distribuição' };
    approvalStatus = `\n⏳ <b>Aguardando aprovação — Etapa ${cv.pendingApproval.stage}: ${stageLabels[cv.pendingApproval.stage] || ''}</b>`;
  }

  await ctx.reply(
    `<b>Pipeline: ${s.runningTask.taskName}</b>\n` +
    `Iniciado: ${s.runningTask.startedAt}` +
    approvalStatus + '\n\n' +
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

// ── /foto-projeto [pasta] ────────────────────────────────────────────────────
// Route next photos to project-level folder (default: imgs/)

bot.command('fotoprojeto', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const folder = ctx.match?.trim() || 'imgs';

  session.setPhotoTarget(chatId, 'project', folder);

  await ctx.reply(
    `Fotos enviadas serao salvas em:\n<code>${s.projectDir}/${folder}/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── /foto-campanha [pasta] ───────────────────────────────────────────────────
// Route next photos to current campaign's assets folder

bot.command('fotocampanha', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const folder = ctx.match?.trim() || 'assets';

  if (!s.runningTask) {
    return ctx.reply(
      'Nenhuma campanha ativa. Use /campanha para iniciar uma ou use /fotoprojeto para salvar no projeto.'
    );
  }

  session.setPhotoTarget(chatId, 'campaign', folder);

  await ctx.reply(
    `Fotos enviadas serao salvas em:\n<code>${s.runningTask.outputDir}/${folder}/</code>`,
    { parse_mode: 'HTML' }
  );
});

// ── Photo/document handler ───────────────────────────────────────────────────

bot.on('message:photo', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const caption = ctx.message.caption?.trim() || '';

  // Allow inline destination override: "campanha" or "projeto [pasta]"
  let { destination, folder } = s.photoTarget;
  if (/^campanha/i.test(caption)) {
    destination = 'campaign';
    folder = caption.split(/\s+/)[1] || 'assets';
  } else if (/^projeto/i.test(caption)) {
    destination = 'project';
    folder = caption.split(/\s+/)[1] || 'imgs';
  }

  // Resolve destination folder
  let destDir;
  if (destination === 'campaign') {
    if (!s.runningTask) {
      return ctx.reply(
        'Nenhuma campanha ativa. Enviando para o projeto.\n' +
        `Use /fotocampanha apos iniciar uma campanha.`
      );
    }
    destDir = path.join(PROJECT_ROOT, s.runningTask.outputDir, folder);
  } else {
    destDir = path.join(PROJECT_ROOT, s.projectDir, folder);
  }

  fs.mkdirSync(destDir, { recursive: true });

  // Get highest resolution photo
  const photo = ctx.message.photo.at(-1);
  const file = await ctx.api.getFile(photo.file_id);
  const ext = path.extname(file.file_path) || '.jpg';
  const filename = `foto_${Date.now()}${ext}`;
  const savePath = path.join(destDir, filename);

  // Download file from Telegram
  await downloadTelegramFile(file.file_path, savePath);

  const relPath = path.relative(PROJECT_ROOT, savePath);
  await ctx.reply(
    `Foto salva em:\n<code>${relPath}</code>\n\n` +
    `Use /fotoprojeto ou /fotocampanha para mudar o destino.`,
    { parse_mode: 'HTML' }
  );
});

// ── Telegram file downloader ─────────────────────────────────────────────────

function downloadTelegramFile(filePath, savePath) {
  const url = `https://api.telegram.org/file/bot${config.botToken}/${filePath}`;
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(savePath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      }
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    }).on('error', reject);
  });
}

// ── /novochat ───────────────────────────────────────────────────────────────

bot.command('novochat', async (ctx) => {
  const chatId = String(ctx.chat.id);
  session.clearHistory(chatId);
  await ctx.reply('Historico limpo. Nova conversa iniciada.');
});

// ── Free text → campaign confirmation or Claude conversation ─────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  // Ignore commands (already handled above)
  if (text.startsWith('/')) return;

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  // ── V3 stage approval ──────────────────────────────────────────────────
  if (s.campaignV3?.pendingApproval) {
    const handled = await handleV3StageApproval(ctx, chatId, s, text);
    if (handled) return;
  }

  // ── Video storyboard approval ───────────────────────────────────────────
  if (s.pendingVideoApproval) {
    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda|rodar|renderiza|renderizar)/.test(lower);
    const isCancel  = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isConfirm) {
      const { outputDir } = s.pendingVideoApproval;
      session.clearPendingVideoApproval(chatId);
      writeVideoApproval(outputDir, true);
      await ctx.reply('Aprovado! Renderizando os vídeos agora...');
      return;
    }

    if (isCancel) {
      const { outputDir } = s.pendingVideoApproval;
      session.clearPendingVideoApproval(chatId);
      writeVideoApproval(outputDir, false);
      await ctx.reply('Vídeos cancelados. Os outros arquivos da campanha continuam disponíveis.');
      return;
    }

    // User wants to adjust — rewrite scene plans via Claude then re-show
    if (lower.length > 10) {
      const { outputDir, absOutputDir } = s.pendingVideoApproval;
      await ctx.reply('Entendido — ajustando o roteiro...');

      const planFiles = fs.existsSync(path.join(absOutputDir, 'video'))
        ? fs.readdirSync(path.join(absOutputDir, 'video')).filter(f => f.endsWith('_scene_plan.json'))
        : [];

      const adjustPrompt = `Adjust the video scene plans based on this feedback: "${text}"

Scene plan files to update:
${planFiles.map(f => path.join(absOutputDir, 'video', f)).join('\n')}

Read each scene plan, apply the feedback, and save the updated versions to the same file paths.
Keep the same JSON structure. Only modify what the feedback requests.`;

      runClaude(adjustPrompt, 'video_adjustment', (code) => {
        if (code !== 0) {
          ctx.reply('Erro ao ajustar o roteiro.');
          return;
        }
        sendVideoApprovalRequest(ctx, chatId, outputDir).catch(() => {});
      });
      return;
    }
  }

  // ── Confirmation replies for pending campaign ───────────────────────────
  if (s.pendingCampaign) {
    const lower = text.toLowerCase().trim();

    // Handle brand overlay question (only when awaiting that answer)
    if (s.pendingCampaign._awaiting_brand_answer) {
      const withBrand    = /\bcom\s*marca\b|\bsim\b.*\bcom\b|\bcom\b/i.test(lower);
      const withoutBrand = /\bsem\s*marca\b|\bsim\b.*\bsem\b|\bsem\b/i.test(lower);
      const isCancel     = /^(nao|não|cancela|cancel)/.test(lower);

      if (isCancel) {
        session.clearPendingCampaign(chatId);
        await ctx.reply('Campanha cancelada.');
        return;
      }

      if (withBrand || withoutBrand || /^sim/.test(lower)) {
        const updatedPayload = { ...s.pendingCampaign, _awaiting_brand_answer: undefined };
        updatedPayload.use_brand_overlay = withoutBrand ? false : true;
        session.setPendingCampaign(chatId, updatedPayload);
        const brandMsg = updatedPayload.use_brand_overlay
          ? 'Ótimo — as imagens usarão as cores e estilo da marca.'
          : 'Ok — as imagens serão geradas sem identidade de marca.';
        await ctx.reply(`${brandMsg}\n\nResponda <b>sim</b> para rodar ou <b>não</b> para cancelar.`, { parse_mode: 'HTML' });
        return;
      }
    }

    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda|rodar)/.test(lower);
    const isCancel  = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isConfirm) {
      const payload = s.pendingCampaign;
      session.clearPendingCampaign(chatId);

      // Assign a global sequential counter per project: c0001-{name}, c0002-{name}, ...
      const baseName = payload.task_name;
      const outsDir = path.join(PROJECT_ROOT, payload.project_dir, 'outputs');
      let nextCounter = 1;
      if (fs.existsSync(outsDir)) {
        const existing = fs.readdirSync(outsDir);
        const re = /^c(\d{4})-/;
        for (const folder of existing) {
          const m = folder.match(re);
          if (m) nextCounter = Math.max(nextCounter, parseInt(m[1], 10) + 1);
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

      await ctx.reply(`Iniciando pipeline <b>${payload.task_name}</b>...\n\nUse /status para acompanhar.`, { parse_mode: 'HTML' });
      runPipelineV3(ctx, chatId, payload, outputDir);
      return;
    }

    if (isCancel) {
      session.clearPendingCampaign(chatId);
      await ctx.reply('Campanha cancelada.');
      return;
    }

    // User is refining the brief — re-parse with updated text
    if (lower.length > 10) {
      await ctx.reply('Atualizando o briefing...');
      parseCampaignFromText(text, s.projectDir, (payload) => {
        if (payload) {
          session.setPendingCampaign(chatId, payload);
          showCampaignConfirmation(ctx, chatId, payload);
        }
      });
      return;
    }
  }

  // ── Detect campaign intent in free text ────────────────────────────────
  const campaignKeywords = /\b(campanha|campaign|pascoa|natal|ano.?novo|dia.das.maes|black.friday|lancamento|carrossel|carousel|video|imagem|post|reel|story|stories|publici|anuncio|anúncio)\b/i;
  const campaignIntent = campaignKeywords.test(text) && text.length > 30;

  if (campaignIntent && !s.processing) {
    if (s.runningTask) {
      // Has active campaign — treat as chat
    } else {
      await ctx.reply('Entendi — vou organizar o briefing da campanha...');
      parseCampaignFromText(text, s.projectDir, (payload) => {
        if (payload) {
          session.setPendingCampaign(chatId, payload);
          showCampaignConfirmation(ctx, chatId, payload);
        } else {
          // Fall through to regular Claude chat
          handleChatMessage(ctx, chatId, s, text);
        }
      });
      return;
    }
  }

  handleChatMessage(ctx, chatId, s, text);
});

// ── Campaign payload builder ─────────────────────────────────────────────────

function buildPayload(taskName, opts, projectDir, today) {
  return {
    task_name: taskName.replace(/\s+/g, '_').toLowerCase(),
    task_date: opts.date || today,
    project_dir: projectDir,
    platform_targets: opts.platforms ? opts.platforms.split(',') : ['instagram', 'youtube', 'threads'],
    language: opts.lang || 'pt-BR',
    skip_research: opts['skip-research'] === true,
    skip_image: opts['skip-image'] === true,
    skip_video: opts['skip-video'] === true,
    image_count: parseInt(opts.images || '5', 10),
    image_formats: ['carousel_1080x1080', 'story_1080x1920'],
    video_count: parseInt(opts.videos || '1', 10),
    image_source: opts['img-source'] || 'brand',
    image_model: opts['img-model'] || process.env.KIE_DEFAULT_MODEL || 'z-image',
    use_brand_overlay: opts['brand-overlay'] !== 'false',
    campaign_brief: opts.brief || '',
  };
}

// ── Campaign confirmation display ────────────────────────────────────────────

async function showCampaignConfirmation(ctx, chatId, payload) {
  const skipFlags = [];
  if (payload.skip_research) skipFlags.push('pesquisa');
  if (payload.skip_image)    skipFlags.push('imagens');
  if (payload.skip_video)    skipFlags.push('video');

  const imgSource = { brand: 'pasta do projeto', pexels: 'Pexels (gratis)', api: 'KIE API (geração)' };
  const modelLabels = {
    'z-image': 'Z-Image', 'z-image-turbo': 'Z-Image Turbo',
    'flux-kontext-pro': 'Flux Pro', 'flux-kontext-max': 'Flux Max', 'gpt-image-1': 'GPT-Image-1',
  };

  const isApi = payload.image_source === 'api';
  const modelLabel = modelLabels[payload.image_model] || payload.image_model || 'Z-Image';
  const brandOverlay = payload.use_brand_overlay !== false;

  const lines = [
    `<b>Campanha pronta para rodar — confirme:</b>\n`,
    `<b>Nome:</b> <code>${payload.task_name}</code>`,
    `<b>Projeto:</b> <code>${payload.project_dir}</code>`,
    `<b>Data:</b> ${payload.task_date}`,
    `<b>Plataformas:</b> ${payload.platform_targets.join(', ')}`,
    `<b>Imagens:</b> ${payload.image_count} (${imgSource[payload.image_source] || payload.image_source}${isApi ? ` — ${modelLabel}` : ''})`,
  ];

  if (isApi) {
    lines.push(`<b>Marca nas imagens:</b> ${brandOverlay ? 'sim (cores e estilo da marca)' : 'não (estilo neutro)'}`);
    lines.push(`<b>Fluxo:</b> gerar imagens → você aprova → montar criativos e vídeo`);
  }

  const audioLabels = { narration: '🎙 Narração (voz)', music: '🎵 Música de fundo', both: '🎙🎵 Narração + Música', none: '🔇 Sem áudio' };
  lines.push(
    `<b>Videos:</b> ${payload.video_count}`,
    `<b>Áudio do vídeo:</b> ${audioLabels[payload.video_audio] || '🎙 Narração (padrão)'}`,
    `<b>Idioma:</b> ${payload.language}`,
  );

  if (skipFlags.length > 0) lines.push(`<b>Pular:</b> ${skipFlags.join(', ')}`);

  // Approval modes summary
  const modes = payload.approval_modes || {};
  const modeLabel = { humano: '👤', agente: '🤖', auto: '⚡' };
  const modeNames = { humano: 'humano', agente: 'agente', auto: 'auto' };
  const stageNames = { stage1: 'Brief', stage2: 'Criativos', stage3: 'Vídeo', stage4: 'Distribuição' };
  const modeParts = Object.entries(stageNames).map(([key, label]) => {
    const m = modes[key] || 'humano';
    return `${modeLabel[m] || '👤'} ${label}`;
  });
  lines.push(`<b>Aprovações:</b> ${modeParts.join(' → ')}`);
  lines.push(`<b>Notificações:</b> ${payload.notifications === false ? 'desativadas' : 'ativadas'}`);

  if (isApi && payload.use_brand_overlay === undefined) {
    // brand_overlay not explicitly set — ask
    lines.push(`\n<b>A marca deve aparecer nas imagens geradas?</b>`);
    lines.push(`Responda <b>sim com marca</b>, <b>sim sem marca</b>, ou <b>não</b> para cancelar.`);
    lines.push(`Ou ajuste o que quiser e eu reorganizo.`);
    session.setPendingCampaign(chatId, { ...payload, _awaiting_brand_answer: true });
  } else {
    lines.push(`\nResponda <b>sim</b> para rodar ou <b>não</b> para cancelar.`);
    lines.push(`Ou ajuste o que quiser e eu reorganizo.`);
    session.setPendingCampaign(chatId, payload);
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

  if (payload.campaign_brief) {
    await ctx.reply(`<b>Brief:</b>\n${payload.campaign_brief}`, { parse_mode: 'HTML' });
  }
}

// ── Parse campaign from free text via Claude ─────────────────────────────────

function parseCampaignFromText(text, projectDir, callback) {
  const today = new Date().toISOString().slice(0, 10);

  // Detect project mentioned in text (e.g. "no projeto inema", "projeto coldbrew")
  const projectMatch = text.match(/projeto\s+([\w-]+)/i);
  if (projectMatch) {
    const mentioned = projectMatch[1].toLowerCase();
    const prjDir = path.join(PROJECT_ROOT, 'prj');
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
  "image_source": "brand",
  "image_model": "${process.env.KIE_DEFAULT_MODEL || 'z-image'}",
  "approval_modes": {
    "stage1": "humano",
    "stage2": "humano",
    "stage3": "humano",
    "stage4": "humano"
  },
  "notifications": true,
  "video_audio": "narration",
  "campaign_brief": "full campaign brief in pt-BR summarizing the intent, audience, tone, key messages"
}

Rules:
- task_name: derive from the campaign theme, short and snake_case
- image_count: default 5 for carousel; use what user says
- video_count: how many videos requested (default 1)
- image_source: "brand" if user mentions brand images; "pexels" if free stock photos; "api" if paid AI image generation
- image_model: only relevant when image_source is "api". Default is ALWAYS "${process.env.KIE_DEFAULT_MODEL || 'z-image'}" (from .env). Only change if the user explicitly requests a different model. Options: "z-image", "z-image-turbo", "flux-kontext-pro", "flux-kontext-max", "gpt-image-1".
- approval_modes: each stage can be "humano" (user must approve), "agente" (AI reviewer decides), or "auto" (advance automatically). Default "humano" for all. Set to "auto" if user says "sem aprovações", "automático", "full auto". Set to "agente" if user says "aprovação por agente", "agente revisa".
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

      // Always use .env default model unless user explicitly named one in the text
      const modelKeywords = ['z-image-turbo', 'flux-kontext-pro', 'flux-kontext-max', 'gpt-image-1', 'flux pro', 'flux max', 'gpt image'];
      const userPickedModel = modelKeywords.some(k => text.toLowerCase().includes(k));
      if (!userPickedModel) {
        payload.image_model = process.env.KIE_DEFAULT_MODEL || 'z-image';
      }

      callback(payload);
    } catch {
      callback(null);
    }
  });
}

// ── Refactored chat message handler ─────────────────────────────────────────

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

// ── Pipeline runner ─────────────────────────────────────────────────────────

function runPipeline(ctx, chatId, payload, outputDir) {
  const payloadStr = JSON.stringify(payload);

  // Store chatId in output dir so bot can notify the right chat after restart
  const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
  fs.mkdirSync(absOutputDir, { recursive: true });
  fs.writeFileSync(path.join(absOutputDir, 'chat_context.json'),
    JSON.stringify({ chatId: String(chatId), ts: Date.now() }));

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

      // Image approval handshake
      if (text.includes('[IMAGE_APPROVAL_NEEDED]')) {
        const match = text.match(/\[IMAGE_APPROVAL_NEEDED\]\s*(\S+)/);
        if (match) {
          const approvalOutputDir = match[1];
          sendImageApprovalRequest(null, chatId, approvalOutputDir).catch(e => {
            console.error('Error sending image approval:', e.message);
          });
        }
      }

      // Video approval handshake
      if (text.includes('[VIDEO_APPROVAL_NEEDED]')) {
        const match = text.match(/\[VIDEO_APPROVAL_NEEDED\]\s*(\S+)/);
        if (match) {
          const approvalOutputDir = match[1];
          ctx.reply('Roteiro de vídeo pronto. Preparando para revisão...').then(() => {
            sendVideoApprovalRequest(ctx, chatId, approvalOutputDir).catch(e => {
              console.error('Error sending video approval:', e.message);
            });
          });
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

        const folderName = payload.task_name;
        const absOutputDir = path.join(PROJECT_ROOT, outputDir);

        ctx.reply(
          `Pipeline <b>${payload.task_name}</b> concluido!`,
          { parse_mode: 'HTML' }
        ).then(() => sendCampaignReport(ctx, absOutputDir, folderName)).catch(() => {});
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

// ── V3 Pipeline runner ───────────────────────────────────────────────────────

function runPipelineV3(ctx, chatId, payload, outputDir) {
  const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
  fs.mkdirSync(absOutputDir, { recursive: true });
  fs.writeFileSync(path.join(absOutputDir, 'chat_context.json'),
    JSON.stringify({ chatId: String(chatId), ts: Date.now() }));

  const approvalModes = payload.approval_modes || {
    stage1: 'humano', stage2: 'humano', stage3: 'humano', stage4: 'humano',
  };

  session.setCampaignV3(chatId, {
    payload,
    outputDir,
    currentStage: 1,
    pendingApproval: null,
    stageResults: { stage1: null, stage2: null, stage3: null, stage4: null },
    approvalModes,
    notifications: payload.notifications !== false,
  });

  // Track which stage-2/3/4 agents have completed (in-memory, not in session)
  const stageAgentsDone = { stage2: new Set(), stage3: new Set(), stage4: new Set() };

  // ctx expires after the Telegram update — use bot.api for async messages
  const botCtx = {
    reply: (text, opts) => bot.api.sendMessage(chatId, text, opts).catch(e => console.error('[v3 send]', e.message)),
    replyWithPhoto: (photo, opts) => bot.api.sendPhoto(chatId, photo, opts).catch(e => console.error('[v3 photo]', e.message)),
    chat: { id: chatId },
    api: bot.api,
  };

  // Start worker — stays alive for the entire campaign
  const worker = spawn('node', ['pipeline/worker.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
  });

  worker.stdout.on('data', (d) => {
    const text = d.toString();
    console.log('[worker]', text.slice(0, 200));

    // Stage 1 complete — creative brief ready
    if (text.includes('[STAGE1_DONE]')) {
      console.log('[v3] STAGE1_DONE received');
      session.updateCampaignV3Stage(chatId, 1, { status: 'done' });
      sendStageApprovalRequest(botCtx, chatId, 1).catch(e =>
        console.error('[v3] stage1 approval error:', e.message)
      );
    }

    // Live image streaming — forward each image as it arrives
    if (text.includes('[STAGE2_IMAGE_READY]')) {
      const match = text.match(/\[STAGE2_IMAGE_READY\]\s*\S+\s+(\S+)/);
      if (match) {
        const imgPath = match[1];
        if (fs.existsSync(imgPath)) {
          bot.api.sendPhoto(chatId, new InputFile(imgPath), {
            caption: path.basename(imgPath),
          }).catch(e => console.error('[v3 photo]', e.message));
        }
      }
    }

    // In v3, image/video approval happens at stage level — unblock the worker immediately
    // Anchored to line-start to avoid matching the [AGENT] log prefix lines
    if (text.includes('[IMAGE_APPROVAL_NEEDED]')) {
      const match = text.match(/(?:^|\n)\[IMAGE_APPROVAL_NEEDED\]\s*(\S+)/);
      if (match) {
        const approvedPath = path.resolve(PROJECT_ROOT, match[1], 'imgs', 'approved.json');
        fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
        fs.writeFileSync(approvedPath, JSON.stringify({ approved: true, by: 'v3_stage_gate', ts: Date.now() }));
        console.log('[v3] auto-approved worker image gate:', match[1]);
      }
    }

    if (text.includes('[VIDEO_APPROVAL_NEEDED]')) {
      const match = text.match(/(?:^|\n)\[VIDEO_APPROVAL_NEEDED\]\s*(\S+)/);
      if (match) {
        const approvedPath = path.resolve(PROJECT_ROOT, match[1], 'video', 'approved.json');
        fs.mkdirSync(path.dirname(approvedPath), { recursive: true });
        fs.writeFileSync(approvedPath, JSON.stringify({ approved: true, by: 'v3_stage_gate', ts: Date.now() }));
        console.log('[v3] auto-approved worker video gate:', match[1]);
      }
    }

    // Track agent completions for stage advancement
    if (text.includes('Job completed:')) {
      const match = text.match(/Job completed:\s*(\S+)/);
      if (match) {
        const agentName = match[1];
        console.log('[v3] Job completed:', agentName);
        const cv = session.getCampaignV3(chatId);
        if (!cv) return;

        if (cv.notifications) {
          bot.api.sendMessage(chatId, `✅ Agente concluído: <code>${agentName}</code>`, { parse_mode: 'HTML' })
            .catch(() => {});
        }

        // Stage 2: ad_creative_designer + copywriter_agent
        if (STAGES.stage2.includes(agentName)) {
          stageAgentsDone.stage2.add(agentName);
          const active2 = STAGES.stage2.filter(a =>
            !(a === 'ad_creative_designer' && cv.payload.skip_image)
          );
          if (active2.every(a => stageAgentsDone.stage2.has(a))) {
            session.updateCampaignV3Stage(chatId, 2, { status: 'done' });
            sendStageApprovalRequest(botCtx, chatId, 2).catch(e =>
              console.error('[v3] stage2 approval error:', e.message)
            );
          }
        }

        // Stage 3: video_ad_specialist
        if (STAGES.stage3.includes(agentName)) {
          stageAgentsDone.stage3.add(agentName);
          const active3 = STAGES.stage3.filter(a =>
            !(a === 'video_ad_specialist' && cv.payload.skip_video)
          );
          if (active3.every(a => stageAgentsDone.stage3.has(a))) {
            session.updateCampaignV3Stage(chatId, 3, { status: 'done' });
            sendStageApprovalRequest(botCtx, chatId, 3).catch(e =>
              console.error('[v3] stage3 approval error:', e.message)
            );
          }
        }

        // Stage 4: distribution complete
        if (STAGES.stage4.includes(agentName)) {
          stageAgentsDone.stage4.add(agentName);
          if (STAGES.stage4.every(a => stageAgentsDone.stage4.has(a))) {
            worker.kill('SIGTERM');
            session.clearRunningTask(chatId);
            session.clearCampaignV3(chatId);
            const folderName = payload.task_name;
            bot.api.sendMessage(chatId, `🎉 Campanha <b>${payload.task_name}</b> publicada!`, { parse_mode: 'HTML' })
              .then(() => sendCampaignReport(botCtx, absOutputDir, folderName))
              .catch(() => {});
          }
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

  worker.stderr.on('data', (d) => {
    const text = d.toString();
    if (text.includes('Error') || text.includes('error')) {
      console.error('[worker stderr]', text.slice(0, 200));
      bot.api.sendMessage(chatId, `Worker erro: ${text.slice(0, 500)}`).catch(() => {});
    }
  });

  // Timeout after 90 min
  setTimeout(() => {
    const cv = session.getCampaignV3(chatId);
    if (cv) {
      worker.kill('SIGTERM');
      session.clearRunningTask(chatId);
      session.clearCampaignV3(chatId);
      bot.api.sendMessage(chatId, 'Pipeline v3 timeout (90 min). Verifique /status.').catch(() => {});
    }
  }, 5400000);

  // Enqueue stage 1
  ctx.reply('Iniciando etapa 1/4 — Pesquisa & Brief Criativo...').then(() => {
    _enqueueStage(payload, STAGES.stage1)
      .then(() => ctx.reply('Pesquisa em andamento. Aguarde o brief criativo...').catch(() => {}))
      .catch(e => ctx.reply(`Erro ao enfileirar etapa 1: ${e.message}`).catch(() => {}));
  }).catch(() => {});
}

async function runStage(ctx, chatId, stageNumber) {
  const cv = session.getCampaignV3(chatId);
  const send = (t, o) => bot.api.sendMessage(chatId, t, o).catch(() => {});
  if (!cv) { await send('Nenhuma campanha v3 ativa.'); return; }

  session.setCampaignV3Stage(chatId, stageNumber);
  session.clearPendingStageApproval(chatId);

  const stageKey = `stage${stageNumber}`;
  const agentNames = STAGES[stageKey];
  if (!agentNames) { await send('Pipeline v3 completo!'); return; }

  const labels = { 2: 'Criação de imagens & copy', 3: 'Produção de vídeo', 4: 'Distribuição' };
  await send(`Avançando para etapa ${stageNumber}/4 — ${labels[stageNumber] || `Etapa ${stageNumber}`}...`);

  try {
    await _enqueueStage(cv.payload, agentNames);
    await send(`Etapa ${stageNumber} na fila. Processando...`);
  } catch (e) {
    await send(`Erro ao enfileirar etapa ${stageNumber}: ${e.message}`);
  }
}

function runAgentReview(ctx, chatId, stage, outputDir) {
  const cv = session.getCampaignV3(chatId);
  if (!cv) return;

  const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
  const stageLabels = { 1: 'Brief Criativo', 2: 'Imagens & Copy', 3: 'Vídeo', 4: 'Distribuição' };

  const prompt = `You are the Agente Revisor. Follow the skill defined in skills/agente-revisor/SKILL.md exactly.

Review Stage ${stage} (${stageLabels[stage] || `Stage ${stage}`}) outputs.

Project dir: ${cv.payload.project_dir}
Output dir: ${outputDir}

Read the relevant files for Stage ${stage} as specified in the skill.
Then print your decision in exactly the required format: [AGENTE_APROVADO] or [AGENTE_AJUSTE].`;

  runClaude(prompt, 'agente_revisor', (code, stdout) => {
    if (code !== 0) {
      // Fallback to human approval on agent error
      ctx.reply(`Agente Revisor encontrou um erro na etapa ${stage}. Enviando para revisão humana...`)
        .then(() => sendStageApprovalRequest(ctx, chatId, stage))
        .catch(() => {});
      return;
    }

    const approvedMatch = stdout.match(/\[AGENTE_APROVADO\][^\n]*\nRaz[ãa]o:\s*(.+)/i);
    const adjustMatch  = stdout.match(/\[AGENTE_AJUSTE\][^\n]*\nFeedback:\s*([\s\S]+)/i);

    if (approvedMatch) {
      const reason = approvedMatch[1].trim();
      ctx.reply(
        `<b>Agente Revisor — Etapa ${stage} aprovada ✅</b>\n\n<i>${escapeHtml(reason)}</i>`,
        { parse_mode: 'HTML' }
      ).then(() => runStage(ctx, chatId, stage + 1)).catch(() => {});
    } else if (adjustMatch) {
      const feedback = adjustMatch[1].trim().slice(0, 800);
      // Notify user of agent feedback, then fall to human to decide
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
      // Could not parse agent output — escalate to human
      ctx.reply(`Agente Revisor não retornou decisão clara na etapa ${stage}. Enviando para revisão humana...`)
        .then(() => sendStageApprovalRequest(ctx, chatId, stage))
        .catch(() => {});
    }
  });
}

async function sendStageApprovalRequest(ctx, chatId, stage) {
  const cv = session.getCampaignV3(chatId);
  if (!cv) return;

  const mode = cv.approvalModes[`stage${stage}`] || 'humano';
  const outputDir = cv.outputDir;

  // Auto mode — advance without any review
  if (mode === 'auto') {
    await ctx.reply(`Etapa ${stage} concluída — avançando automaticamente...`).catch(() => {});
    await runStage(ctx, chatId, stage + 1);
    return;
  }

  // Agente mode — Agente Revisor evaluates and decides
  if (mode === 'agente') {
    await ctx.reply(`Etapa ${stage} concluída — Agente Revisor avaliando...`).catch(() => {});
    runAgentReview(ctx, chatId, stage, outputDir);
    return;
  }

  // humano mode
  session.setPendingStageApproval(chatId, { stage, type: 'humano' });

  if (stage === 1) {
    const briefPath = path.join(PROJECT_ROOT, outputDir, 'creative', 'creative_brief.md');
    if (fs.existsSync(briefPath)) {
      const brief = fs.readFileSync(briefPath, 'utf-8');
      for (const part of splitMessage(toTelegramHTML(brief))) {
        await ctx.reply(part, { parse_mode: 'HTML' }).catch(() => ctx.reply(part));
      }
    }
    await ctx.reply(
      '<b>Brief criativo pronto — Etapa 1/4 ✅</b>\n\n' +
      'Responda <b>sim</b> para avançar para imagens e copy.\n' +
      '<b>não</b> para cancelar a campanha.\n' +
      'Ou descreva ajustes.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 2) {
    // 1. Copy first
    const lines = ['<b>Imagens e copy prontos — Etapa 2/4 ✅</b>\n'];
    const captionPath = path.join(PROJECT_ROOT, outputDir, 'copy', 'instagram_caption.txt');
    const threadsPath = path.join(PROJECT_ROOT, outputDir, 'copy', 'threads_post.txt');
    if (fs.existsSync(captionPath)) {
      lines.push('<b>📝 Instagram:</b>');
      lines.push(`<i>${escapeHtml(fs.readFileSync(captionPath, 'utf-8').slice(0, 300))}</i>\n`);
    }
    if (fs.existsSync(threadsPath)) {
      lines.push('<b>📝 Threads:</b>');
      lines.push(`<i>${escapeHtml(fs.readFileSync(threadsPath, 'utf-8').slice(0, 200))}</i>\n`);
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    // 2. Images after copy
    const imgsDir = path.join(PROJECT_ROOT, outputDir, 'imgs');
    if (fs.existsSync(imgsDir)) {
      const imgFiles = fs.readdirSync(imgsDir)
        .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && f !== 'approved.json')
        .sort();
      for (const f of imgFiles) {
        await bot.api.sendPhoto(chatId, new InputFile(path.join(imgsDir, f)), {
          caption: `🖼 ${f}`,
        }).catch(e => console.error('[stage2 img]', e.message));
      }
    }

    // 3. Approval question
    await ctx.reply(
      'Responda <b>sim</b> para avançar para vídeo.\nOu descreva o que ajustar nas imagens ou no copy.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 3) {
    const msg = formatStoryboardMessage(path.join(PROJECT_ROOT, outputDir));
    if (msg) {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(
        '<b>Etapa 3/4 ✅ — Vídeo pronto</b>\n\n' +
        'Responda <b>sim</b> para avançar para distribuição.\n<b>não</b> para cancelar.',
        { parse_mode: 'HTML' }
      );
    }
  } else if (stage === 4) {
    await ctx.reply(
      '<b>Pronto para distribuição — Etapa 4/4</b>\n\n' +
      'Tudo certo para publicar nas plataformas configuradas.\n' +
      'Responda <b>sim</b> para iniciar a distribuição.\n<b>não</b> para cancelar.',
      { parse_mode: 'HTML' }
    );
  }
}

async function handleV3StageApproval(ctx, chatId, s, text) {
  const cv = s.campaignV3;
  if (!cv?.pendingApproval) return false;

  const lower = text.toLowerCase().trim();
  const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda)/.test(lower);
  const isCancel  = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);
  const stage = cv.pendingApproval.stage;

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

  // Adjustment requests
  if (lower.length > 10) {
    if (stage === 1) {
      await ctx.reply('Revisando o brief criativo...');
      const adjustPrompt = `Revise the creative brief based on this feedback: "${text}"

Read current brief at ${path.join(PROJECT_ROOT, cv.outputDir, 'creative', 'creative_brief.md')} and ${path.join(PROJECT_ROOT, cv.outputDir, 'creative', 'creative_brief.json')}.
Apply the feedback, save updated versions to the same paths.
After saving both files, print exactly: [STAGE1_DONE] ${cv.outputDir}`;
      runClaude(adjustPrompt, 'brief_adjustment', (code) => {
        if (code !== 0) ctx.reply('Erro ao ajustar o brief.').catch(() => {});
        // [STAGE1_DONE] re-triggers approval flow via worker stdout handler
      });
    } else if (stage === 2) {
      await ctx.reply('Ajustando copy com seu feedback...');
      const copyDir = path.join(PROJECT_ROOT, cv.outputDir, 'copy');
      const adjustPrompt = `You are the Copywriter Agent. Adjust the existing copy based on this feedback: "${text}"

Read the current copy files:
- ${path.join(copyDir, 'instagram_caption.txt')}
- ${path.join(copyDir, 'threads_post.txt')}
- ${path.join(copyDir, 'youtube_metadata.json')}

Also read the brand guidelines at ${path.join(PROJECT_ROOT, cv.payload.project_dir, 'knowledge', 'brand_identity.md')}

Apply the feedback, update only what was asked. Save the revised files to the same paths. Keep the same file format.`;
      runClaude(adjustPrompt, 'copy_adjustment', (code) => {
        const _ctx = { reply: (t, o) => bot.api.sendMessage(chatId, t, o).catch(() => {}), chat: { id: chatId }, api: bot.api };
        if (code !== 0) { _ctx.reply('Erro ao ajustar o copy.'); return; }
        sendStageApprovalRequest(_ctx, chatId, 2).catch(() => {});
      });
    } else if (stage === 3) {
      await ctx.reply('Ajustando o roteiro do vídeo...');
      const videoDir = path.join(PROJECT_ROOT, cv.outputDir, 'video');
      const planFiles = fs.existsSync(videoDir)
        ? fs.readdirSync(videoDir).filter(f => f.endsWith('_scene_plan.json'))
          .map(f => path.join(videoDir, f))
        : [];
      if (planFiles.length === 0) {
        await ctx.reply('Nenhum roteiro encontrado para ajustar.');
        return true;
      }
      const adjustPrompt = `Adjust the video scene plans based on this feedback: "${text}"
Scene plan files:\n${planFiles.join('\n')}
Read each, apply feedback, save to same paths. Keep same JSON structure.`;
      runClaude(adjustPrompt, 'video_adjustment', (code) => {
        if (code !== 0) { ctx.reply('Erro ao ajustar o roteiro.').catch(() => {}); return; }
        sendStageApprovalRequest(ctx, chatId, 3).catch(() => {});
      });
    } else if (stage === 4) {
      await ctx.reply('Responda <b>sim</b> para distribuir ou <b>não</b> para cancelar.', { parse_mode: 'HTML' });
    }
    return true;
  }

  return true; // consumed
}

// ── Claude CLI runner (for individual agents) ───────────────────────────────

function runClaude(prompt, agentName, callback) {
  const claudePath = '/home/nmaldaner/.local/bin/claude';
  const child = spawn(claudePath, [
    '-p', prompt,
    '--dangerously-skip-permissions',
    '--model', 'sonnet',
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('error', (err) => {
    console.error(`Claude spawn error: ${err.message}`);
    callback(1, '');
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Claude exit ${code}: ${stderr.slice(0, 500)}`);
    }
    callback(code, stdout);
  });

  // 10 min timeout
  setTimeout(() => { child.kill('SIGTERM'); }, 600000);
}

// ── /fix <description> ──────────────────────────────────────────────────────
// Runs Claude Code autonomously to fix something in the codebase.
// Reports back with what changed (git diff summary).

bot.command('fix', async (ctx) => {
  const description = ctx.match?.trim();
  if (!description) {
    return ctx.reply(
      'Use: /fix <descricao do problema>\n\n' +
      'Exemplos:\n' +
      '<code>/fix o brief esta sendo cortado no card de confirmacao</code>\n' +
      '<code>/fix adicionar suporte a reels no gerador de imagens</code>\n' +
      '<code>/fix o video nao segue o timing do audio</code>',
      { parse_mode: 'HTML' }
    );
  }

  const chatId = String(ctx.chat.id);

  await ctx.reply(
    `Entendido. Vou analisar e corrigir:\n\n<i>"${description}"</i>\n\nAguarde — isso pode levar alguns minutos...`,
    { parse_mode: 'HTML' }
  );

  const claudePath = '/home/nmaldaner/.local/bin/claude';

  const prompt = `You are Claude Code working on the Times MKT social media automation project at ${PROJECT_ROOT}.

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
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  // Progress ping every 30s
  const ping = setInterval(() => {
    ctx.api.sendChatAction(chatId, 'typing').catch(() => {});
  }, 30000);

  // Timeout: 10 min
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

    // Get git diff summary of what changed
    let diffSummary = '';
    try {
      // execFileSync already imported at top
      diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD'], {
        cwd: PROJECT_ROOT, encoding: 'utf-8',
      }).trim();
      if (!diffSummary) {
        diffSummary = execFileSync('git', ['diff', '--stat'], {
          cwd: PROJECT_ROOT, encoding: 'utf-8',
        }).trim();
      }
    } catch (_) {}

    if (code !== 0) {
      const errSnippet = stderr.slice(-500) || stdout.slice(-500);
      return ctx.reply(
        `Correcao falhou (exit ${code}).\n\n<pre>${escapeHtml(errSnippet)}</pre>`,
        { parse_mode: 'HTML' }
      );
    }

    // Build response
    const lines = [`✅ <b>Correcao concluida</b>`];

    if (diffSummary) {
      lines.push(`\n<b>Arquivos alterados:</b>\n<pre>${escapeHtml(diffSummary)}</pre>`);
    } else {
      lines.push('\nNenhum arquivo alterado — pode ser que ja estava correto.');
    }

    // Show last meaningful lines of Claude output (skip tool call noise)
    const outputLines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('{') && !l.startsWith('['));
    const summary = outputLines.slice(-8).join('\n').trim();
    if (summary) {
      lines.push(`\n<b>Resumo:</b>\n<pre>${escapeHtml(summary.slice(0, 800))}</pre>`);
    }

    // Auto-restart bot if bot.js was changed
    const botChanged = diffSummary.includes('bot.js') || diffSummary.includes('session.js');
    if (botChanged) {
      lines.push('\n<i>bot.js foi alterado — reiniciando em 3s...</i>');
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    if (botChanged) {
      setTimeout(() => {
        const { spawn: spawnRestart } = require('child_process');
        spawnRestart('node', ['telegram/bot.js'], {
          cwd: PROJECT_ROOT,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env },
        }).unref();
        process.exit(0);
      }, 3000);
    }
  });
});

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Image approval ───────────────────────────────────────────────────────────

async function sendImageApprovalRequest(_ctx, chatId, outputDir) {
  const absImgsDir = path.join(PROJECT_ROOT, outputDir, 'imgs');
  if (!fs.existsSync(absImgsDir)) {
    writeImageApproval(outputDir, true);
    return;
  }

  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const images = fs.readdirSync(absImgsDir)
    .filter(f => imageExts.includes(path.extname(f).toLowerCase()) && f.startsWith('generated_'))
    .sort()
    .map(f => path.join(absImgsDir, f));

  if (images.length === 0) {
    writeImageApproval(outputDir, true);
    return;
  }

  session.setPendingVideoApproval(chatId, { outputDir, type: 'images' });

  await bot.api.sendMessage(chatId,
    `🖼 <b>${images.length} imagens geradas — aprove antes de montar os criativos</b>\n\nEnviando uma por uma...`,
    { parse_mode: 'HTML' }
  );

  for (const imgPath of images) {
    try {
      await bot.api.sendPhoto(chatId, new InputFile(imgPath), {
        caption: path.basename(imgPath),
      });
    } catch (e) {
      await bot.api.sendMessage(chatId, `(não foi possível enviar ${path.basename(imgPath)})`).catch(() => {});
    }
  }

  await bot.api.sendMessage(chatId,
    `Responda <b>sim</b> para usar estas imagens e continuar.\n` +
    `<b>não</b> para cancelar.\n` +
    `Ou descreva o que ajustar e vou regenerar.`,
    { parse_mode: 'HTML' }
  );
}

function writeImageApproval(outputDir, approved, feedback = null) {
  const imgsDir = path.join(PROJECT_ROOT, outputDir, 'imgs');
  fs.mkdirSync(imgsDir, { recursive: true });
  const file = approved ? 'approved.json' : 'rejected.json';
  fs.writeFileSync(path.join(imgsDir, file), JSON.stringify({ approved, feedback, ts: new Date().toISOString() }));
}

// ── Video storyboard formatter ───────────────────────────────────────────────

function formatStoryboardMessage(outputDir) {
  const videoDir = path.join(outputDir, 'video');
  if (!fs.existsSync(videoDir)) return null;

  const planFiles = fs.readdirSync(videoDir)
    .filter(f => f.endsWith('_scene_plan.json'))
    .sort();

  if (planFiles.length === 0) return null;

  const lines = [`🎬 <b>Roteiro gerado — confirme antes de renderizar</b>\n`];

  for (const file of planFiles) {
    try {
      const plan = JSON.parse(fs.readFileSync(path.join(videoDir, file), 'utf-8'));
      const voiceLabel = { rachel: 'Rachel (emocional)', bella: 'Bella (amigável)', antoni: 'Antoni (profissional)' };
      lines.push(`<b>${plan.titulo || file}</b>`);
      lines.push(`Voz: ${voiceLabel[plan.voice] || plan.voice || 'padrão'} | Duração: ~${plan.video_length || '?'}s\n`);

      if (plan.narration_script) {
        const preview = plan.narration_script.slice(0, 120);
        lines.push(`<i>"${escapeHtml(preview)}${plan.narration_script.length > 120 ? '...' : ''}"</i>\n`);
      }

      lines.push(`<b>Cenas:</b>`);
      (plan.scenes || []).forEach((s, i) => {
        const imgName = s.image ? path.basename(s.image) : '(sem imagem)';
        const crop = s.image_crop_focus ? ` crop:${s.image_crop_focus}` : '';
        lines.push(`  ${i + 1}. [${s.type || s.id}] "<b>${escapeHtml(s.text_overlay || '')}</b>" — ${escapeHtml(imgName)}${crop} | ${s.duration}s`);
      });
      lines.push('');
    } catch {}
  }

  lines.push(`Responda <b>sim</b> para renderizar ou <b>não</b> para cancelar.`);
  lines.push(`Ou descreva ajustes e eu reescrevo o roteiro.`);

  return lines.join('\n');
}

async function sendVideoApprovalRequest(ctx, chatId, outputDir) {
  const absOutputDir = path.join(PROJECT_ROOT, outputDir);
  const msg = formatStoryboardMessage(absOutputDir);

  if (!msg) {
    // No scene plans found — auto-approve
    writeVideoApproval(outputDir, true);
    return;
  }

  session.setPendingVideoApproval(chatId, { outputDir, absOutputDir });
  await ctx.reply(msg, { parse_mode: 'HTML' });
}

function writeVideoApproval(outputDir, approved, feedback = null) {
  const videoDir = path.join(PROJECT_ROOT, outputDir, 'video');
  fs.mkdirSync(videoDir, { recursive: true });
  if (approved) {
    fs.writeFileSync(path.join(videoDir, 'approved.json'), JSON.stringify({ approved: true, feedback, ts: new Date().toISOString() }));
  } else {
    fs.writeFileSync(path.join(videoDir, 'rejected.json'), JSON.stringify({ approved: false, feedback, ts: new Date().toISOString() }));
  }
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

// ── /aprovar — re-scan pending approvals ─────────────────────────────────────

bot.command('aprovar', async (ctx) => {
  await scanPendingApprovals(ctx.chat.id.toString(), ctx);
});

// ── /modos — configure approval modes for active campaign ────────────────────

bot.command('modos', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const cv = session.getCampaignV3(chatId);
  const arg = ctx.match?.trim().toLowerCase();

  if (!cv) {
    await ctx.reply(
      '<b>Modos de aprovação</b>\n\n' +
      'Use este comando durante uma campanha ativa para ajustar os modos por etapa.\n\n' +
      'Sintaxe: <code>/modos [etapa] [modo]</code>\n\n' +
      'Etapas: <code>1</code> (brief), <code>2</code> (criativos), <code>3</code> (vídeo), <code>4</code> (distribuição), <code>todas</code>\n' +
      'Modos:\n' +
      '  👤 <code>humano</code> — você aprova antes de avançar\n' +
      '  🤖 <code>agente</code> — Agente Revisor decide\n' +
      '  ⚡ <code>auto</code> — avança automaticamente sem aprovação\n\n' +
      'Exemplos:\n' +
      '<code>/modos todas auto</code> — sem aprovações\n' +
      '<code>/modos 1 humano</code> — só etapa 1 com aprovação humana\n' +
      '<code>/modos notificacoes off</code> — silencia notificações',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Parse /modos <target> <mode>
  const parts = arg ? arg.split(/\s+/) : [];
  const target = parts[0];
  const mode   = parts[1];

  // Notification toggle
  if (target === 'notificacoes' || target === 'notificações') {
    cv.notifications = !(mode === 'off' || mode === 'nao' || mode === 'não' || mode === 'false');
    await ctx.reply(`Notificações ${cv.notifications ? 'ativadas ✅' : 'desativadas 🔇'}`);
    return;
  }

  const validModes = ['humano', 'agente', 'auto'];
  if (!target || !mode || !validModes.includes(mode)) {
    await ctx.reply(
      'Use: <code>/modos [1|2|3|4|todas] [humano|agente|auto]</code>\n' +
      'Ou: <code>/modos notificacoes [on|off]</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const stageMap = { '1': 'stage1', '2': 'stage2', '3': 'stage3', '4': 'stage4' };
  if (target === 'todas' || target === 'all') {
    ['stage1','stage2','stage3','stage4'].forEach(s => { cv.approvalModes[s] = mode; });
    await ctx.reply(`Todas as etapas definidas como <b>${mode}</b>.`, { parse_mode: 'HTML' });
  } else if (stageMap[target]) {
    cv.approvalModes[stageMap[target]] = mode;
    const stageLabels = { stage1: 'Brief', stage2: 'Criativos', stage3: 'Vídeo', stage4: 'Distribuição' };
    await ctx.reply(
      `Etapa ${target} (${stageLabels[stageMap[target]]}) definida como <b>${mode}</b>.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('Etapa inválida. Use 1, 2, 3, 4 ou todas.');
  }
});

/**
 * Scans all project outputs for pending approval_needed.json files.
 * Sends approval requests to the matching chat.
 * Called on bot startup and via /aprovar command.
 */
async function scanPendingApprovals(targetChatId, ctx) {
  const prjRoot = path.resolve(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjRoot)) return;

  const pending = [];

  // Walk prj/<project>/outputs/<campaign>/
  for (const prj of fs.readdirSync(prjRoot)) {
    const outRoot = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outRoot)) continue;
    for (const campaign of fs.readdirSync(outRoot)) {
      const campDir = path.join(outRoot, campaign);
      const relDir = `prj/${prj}/outputs/${campaign}`;

      // Check video approval
      const videoSignal = path.join(campDir, 'video', 'approval_needed.json');
      const videoApproved = path.join(campDir, 'video', 'approved.json');
      const videoRejected = path.join(campDir, 'video', 'rejected.json');
      if (fs.existsSync(videoSignal) && !fs.existsSync(videoApproved) && !fs.existsSync(videoRejected)) {
        const ctx2 = readChatContext(campDir);
        if (!targetChatId || ctx2?.chatId === targetChatId || !ctx2) {
          pending.push({ type: 'video', outputDir: relDir, chatId: ctx2?.chatId || targetChatId });
        }
      }

      // Check image approval
      const imgSignal = path.join(campDir, 'imgs', 'approval_needed.json');
      const imgApproved = path.join(campDir, 'imgs', 'approved.json');
      const imgRejected = path.join(campDir, 'imgs', 'rejected.json');
      if (fs.existsSync(imgSignal) && !fs.existsSync(imgApproved) && !fs.existsSync(imgRejected)) {
        const ctx2 = readChatContext(campDir);
        if (!targetChatId || ctx2?.chatId === targetChatId || !ctx2) {
          pending.push({ type: 'images', outputDir: relDir, chatId: ctx2?.chatId || targetChatId });
        }
      }
    }
  }

  if (pending.length === 0) {
    if (ctx) await ctx.reply('Nenhuma aprovação pendente encontrada.');
    return;
  }

  for (const item of pending) {
    const chatId = item.chatId;
    if (!chatId) continue;
    console.log(`[startup] Pending ${item.type} approval found: ${item.outputDir} → chat ${chatId}`);
    if (item.type === 'video') {
      session.setPendingVideoApproval(chatId, { outputDir: item.outputDir, type: 'video' });
      await sendVideoApprovalRequest(bot, chatId, item.outputDir);
    } else {
      session.setPendingVideoApproval(chatId, { outputDir: item.outputDir, type: 'images' });
      await sendImageApprovalRequest(bot, chatId, item.outputDir);
    }
  }
}

function readChatContext(campDir) {
  try {
    const f = path.join(campDir, 'chat_context.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null;
  } catch { return null; }
}

bot.start({
  onStart: async (botInfo) => {
    console.log(`Bot @${botInfo.username} rodando (long-polling)`);
    console.log(`Projeto padrao: ${session.DEFAULT_PROJECT}`);
    console.log('Ctrl+C para parar.\n');

    // Kill any stale worker processes from previous bot sessions
    try {
      const { spawnSync } = require('child_process');
      spawnSync('pkill', ['-f', 'pipeline/worker.js'], { stdio: 'ignore' });
      console.log('Stale workers cleared.');
    } catch (_) { /* none running */ }

    // Scan for pending approvals left over from before restart
    await scanPendingApprovals(null, null);
  },
});
