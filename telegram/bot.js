/**
 * Telegram Bot for timesmkt2
 *
 * Receives instructions via Telegram, dispatches pipeline jobs,
 * and returns results (text, images, videos) to the chat.
 *
 * Usage: node telegram/bot.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), override: true });

const { Bot, InputFile } = require('grammy');
const fs = require('fs');
const { spawn, execFileSync, execSync } = require('child_process');

// Helper: check if a worker is already running before spawning a new one
function isWorkerRunning() {
  try {
    const out = execSync("pgrep -af 'node.*pipeline/worker.js' | grep -v bash | grep -v pgrep", { encoding: 'utf-8', timeout: 3000 });
    return out.trim().length > 0;
  } catch { return false; }
}

function ensureWorker() {
  if (isWorkerRunning()) {
    console.log('[bot] Worker already running, skipping spawn.');
    return null;
  }
  console.log('[bot] Spawning new worker...');
  const w = spawn('node', ['pipeline/worker.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  w.on('error', e => console.error('[worker spawn error]', e.message));
  return w;
}

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
    `Ola! Sou o bot do <b>ITAGMKT v4.2.8</b>.\n\n` +
    `Projeto ativo: <code>${s.projectDir}</code>\n\n` +
    `<b>Comandos principais:</b>\n` +
    `/campanha &lt;nome&gt; — rodar pipeline 5 etapas\n` +
    `/rerun &lt;campanha&gt; &lt;etapas&gt; — reprocessar etapas\n` +
    `/continue &lt;campanha&gt; — continuar de onde parou\n` +
    `/status — ver status do pipeline\n` +
    `/enviar &lt;campanha&gt; [tipo] — receber arquivos\n` +
    `/cancel — cancelar pipeline ativo\n` +
    `/projetos — listar/mudar projeto\n` +
    `/help — menu completo`,
    { parse_mode: 'HTML' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `<b>ITAGMKT v4.2.8 — Menu Completo</b>\n\n` +

    `<b>Pipeline (5 etapas)</b>\n` +
    `/campanha &lt;nome&gt; [opcoes] — pipeline completo\n` +
    `/rerun &lt;campanha&gt; &lt;etapas&gt; — reprocessar\n` +
    `/continue &lt;campanha&gt; — continuar de onde parou\n` +
    `/cancel — cancelar pipeline ativo\n` +
    `/status — status por etapa\n` +
    `/outputs — listar campanhas\n` +
    `/relatorio &lt;campanha&gt; — resumo de arquivos\n` +
    `/enviar &lt;campanha&gt; [imagens|videos|audio|copy|tudo]\n` +
    `/aprovar — re-verificar aprovacoes pendentes\n` +
    `/modos [etapa] [humano|agente|auto]\n\n` +

    `<b>Etapas do pipeline:</b>\n` +
    `  1. Estrategia — Research + Diretor Criativo + Copywriter\n` +
    `  2. Imagens — Ad Creative Designer (validação aspect ratio)\n` +
    `  3. Video — Quick (ffmpeg) + Pro (Diretor de Foto + Opus + Remotion)\n` +
    `  4. Plataformas — Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn\n` +
    `  5. Distribuicao — Upload + Agendar + Publicar\n\n` +

    `<b>Projetos</b>\n` +
    `/projetos — lista projetos\n` +
    `/projeto &lt;nome&gt; — muda projeto ativo\n\n` +

    `<b>Agentes avulsos</b>\n` +
    `/pesquisa &lt;tema&gt; — Research Agent\n` +
    `/copy &lt;campanha&gt; — Copywriter Agent\n\n` +

    `<b>Midia</b>\n` +
    `/img-api, /img-free, /img-pasta\n` +
    `/tts-api — narracao ElevenLabs\n` +
    `/media-status — APIs configuradas\n\n` +

    `<b>Fotos (upload)</b>\n` +
    `/fotoprojeto — fotos vao para assets/\n` +
    `/fotocampanha — fotos vao para campanha ativa\n\n` +

    `<b>Rerun / Continue:</b>\n` +
    `<code>/continue c16</code> — continua de onde parou\n` +
    `<code>/continue c16 screenshot</code> — com capturas do site\n` +
    `<code>/rerun c15 video pro</code>\n` +
    `<code>/rerun c14 imagens api</code>\n` +
    `<code>/rerun c13 2,3</code>\n\n` +

    `<b>Conversa</b>\n` +
    `/novochat — limpa historico\n` +
    `Texto livre = conversa com Claude`,
    { parse_mode: 'HTML' }
  );
});

// ── /helpcampanha ──────────────────────────────────────────────────────────

bot.command('helpcampanha', async (ctx) => {
  await ctx.reply(
    `<b>PIPELINE COMPLETO — ITAGMKT v4.3.0</b>\n\n` +

    `O pipeline roda em <b>5 etapas</b>:\n` +
    `  <b>1.</b> Estrategia — Research + Diretor Criativo + Copywriter\n` +
    `  <b>2.</b> Imagens — Ad Creative Designer (validação 1:1/9:16)\n` +
    `  <b>3.</b> Video\n` +
    `      ▶️ Quick — slideshow 15s (ffmpeg)\n` +
    `      ▶️ Pro — Diretor de Fotografia + Scene Plan + Remotion 60s\n` +
    `  <b>4.</b> Plataformas — Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn\n` +
    `  <b>5.</b> Distribuicao — Upload + Agendar + Publicar\n\n` +

    `<b>Fases do Video Pro:</b>\n` +
    `  1. Narração (ElevenLabs)\n` +
    `  1.5 Timing áudio (ffprobe)\n` +
    `  1.6 Diretor de Fotografia (Opus)\n` +
    `  2. Scene Plan (Opus)\n` +
    `  3. Imagens (se API)\n` +
    `  4. Render (Remotion)\n\n` +

    `A cada etapa o bot envia o resultado e aguarda confirmação (modo padrão). Veja /helpaprovacoes.\n\n` +

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

    `O pipeline v4 tem <b>5 pontos de aprovação</b>, um por etapa:\n\n` +
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
// ── /cancel ──────────────────────────────────────────────────────────────────

bot.command('cancel', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (!s.runningTask) {
    return ctx.reply('Nenhum pipeline ativo para cancelar.');
  }

  const taskName = s.runningTask.taskName;

  // Kill worker processes
  try {
    const { execSync } = require('child_process');
    const pids = execSync("ps aux | grep 'worker.js' | grep -v grep | awk '{print $2}'").toString().trim();
    if (pids) {
      for (const pid of pids.split('\n')) {
        try { process.kill(Number(pid), 'SIGTERM'); } catch {}
      }
    }
  } catch {}

  // Clear session state
  session.clearRunningTask(chatId);
  session.clearPendingRerun(chatId);

  await ctx.reply(`Pipeline <b>${taskName}</b> cancelado.`, { parse_mode: 'HTML' });
});

// ── /enviar <campanha> [tipo] ────────────────────────────────────────────────
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

  // Find campaign with partial match (c15 → c0015-pascoa2026)
  let outputDir = null;
  let resolvedFolder = findCampaign(s.projectDir, folder);
  if (resolvedFolder) {
    outputDir = path.join(PROJECT_ROOT, s.projectDir, 'outputs', resolvedFolder);
  } else {
    const result = findCampaignAcrossProjects(folder);
    if (result) {
      resolvedFolder = result.campaignFolder;
      outputDir = path.join(PROJECT_ROOT, result.projectDir, 'outputs', resolvedFolder);
      session.setProject(chatId, result.projectDir);
    }
  }
  if (!outputDir || !fs.existsSync(outputDir)) {
    return ctx.reply(`Campanha nao encontrada: ${folder}\n\nUse /outputs para listar campanhas disponíveis.`);
  }

  await ctx.reply(`Enviando <b>${tipo}</b> de <code>${resolvedFolder}</code>...`, { parse_mode: 'HTML' });
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
    const files = fs.readdirSync(d).filter(f => exts.includes(path.extname(f).toLowerCase()) && !f.endsWith('_prompt.txt'));
    let count = 0;
    for (const f of files) {
      try {
        await sendFn(ctx, path.join(d, f), f);
        count++;
      } catch (err) {
        console.error(`[enviar] Falha ao enviar ${f}: ${err.message}`);
        // Send path as fallback
        try {
          await ctx.reply(`Nao consegui enviar: <code>${f}</code>\nCaminho: <code>${path.join(d, f)}</code>`, { parse_mode: 'HTML' });
        } catch {}
      }
    }
    return count;
  };

  let sent = 0;

  if (tipo === 'imagens' || tipo === 'tudo') {
    sent += await sendDir('ads', imageExts, sendPhoto);
    sent += await sendDir('imgs', imageExts, sendPhoto);
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
      '  --img-source brand|pexels|api|screenshot\n' +
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

  const stageAgents = {
    1: { name: 'Brief & Narrativa', agents: ['research_agent', 'creative_director', 'copywriter_agent'] },
    2: { name: 'Imagens', agents: ['ad_creative_designer'] },
    3: { name: 'Video', agents: ['video_quick', 'video_pro'] },
    4: { name: 'Plataformas', agents: ['platform_instagram', 'platform_youtube', 'platform_tiktok', 'platform_facebook', 'platform_threads', 'platform_linkedin'] },
    5: { name: 'Distribuicao', agents: ['distribution_agent'] },
  };

  // Determine agent status from log file (last 5 lines to handle retries)
  function agentStatus(agentName) {
    const logFile = path.join(logsDir, `${agentName}.log`);
    if (!fs.existsSync(logFile)) return null;
    const content = fs.readFileSync(logFile, 'utf-8');
    const logLines = content.split('\n').filter(l => l.trim());
    const tail = logLines.slice(-5).join('\n');
    if (tail.includes('Completed successfully')) return '✅';
    if (tail.includes('FAILED') && !tail.includes('Invoking Claude')) return '❌';
    if (tail.includes('Invoking Claude') || tail.includes('Phase')) return '▶️';
    return '🔄';
  }

  const rerunStages = s.runningTask?.rerunStages || null;
  const videoMode = s.runningTask?.videoMode || '';
  const lines = [];

  // During rerun, find the highest stage being reprocessed
  const rerunMaxStage = rerunStages ? Math.max(...rerunStages) : 0;
  const isRerun = !!s.runningTask?.rerun;

  for (const [stageNum, stage] of Object.entries(stageAgents)) {
    const num = Number(stageNum);
    let stagLabel = stage.name;
    if (num === 3 && videoMode) stagLabel += ` (${videoMode})`;

    // Get statuses for agents that have logs
    const agentLines = [];
    let hasAnyLog = false;
    for (const a of stage.agents) {
      // For video: only show relevant agent based on videoMode
      if (num === 3) {
        if (a === 'video_quick' && videoMode === 'Pro') continue;
        if (a === 'video_pro' && videoMode === 'Quick') continue;
      }
      const st = agentStatus(a);
      if (st) {
        hasAnyLog = true;
        agentLines.push(`    ${a}: ${st}`);
      }
    }

    // During rerun, stages AFTER the current rerun range should be hidden (not ✅)
    // They will be re-executed so old ✅ is misleading
    if (isRerun && rerunStages && !rerunStages.includes(num) && num > rerunMaxStage) {
      // Stage after rerun scope — don't show old status
      continue;
    }

    // Determine stage-level icon
    let stageIcon = '⬜';  // not started
    if (hasAnyLog) {
      const allDone = agentLines.every(l => l.includes('✅'));
      const anyFail = agentLines.some(l => l.includes('❌'));
      const anyRunning = agentLines.some(l => l.includes('▶️') || l.includes('🔄'));
      if (allDone) stageIcon = '✅';
      else if (anyFail) stageIcon = '❌';
      else if (anyRunning) stageIcon = '▶️';
    } else if (rerunStages && rerunStages.includes(num)) {
      stageIcon = '⏳';  // queued for rerun but not started yet
    }

    lines.push(`${stageIcon} <b>${num}. ${stagLabel}</b>`);

    // Expand current + previous stages (all agents); future stages stay collapsed
    const isStartedOrDone = hasAnyLog || stageIcon === '✅' || stageIcon === '❌' || stageIcon === '⏳';
    if (isStartedOrDone) {
      // Show ALL agents in this stage (not just ones with logs)
      for (const a of stage.agents) {
        if (num === 3) {
          if (a === 'video_quick' && videoMode === 'Pro') continue;
          if (a === 'video_pro' && videoMode === 'Quick') continue;
        }
        const st = agentStatus(a);
        const icon = st || '⬜';
        lines.push(`    ${icon} ${a}`);
      }
      // Show video sub-phases for both quick and pro — ALWAYS show ALL phases
      if (num === 3) {
        const quickPhaseList = [
          'Scene plan', 'Aprovacao', 'Render final', 'Completo'
        ];
        const proPhaseList = [
          'Narracao', 'Timing audio', 'Dir. Fotografia', 'Scene plan',
          'Validacao tipografica', 'Gerando imagens', 'Aprovacao',
          'Render final', 'Completo'
        ];
        const videoLogs = [
          { file: 'video_quick.log', label: 'Quick', allPhases: quickPhaseList },
          { file: 'video_pro.log', label: 'Pro', allPhases: proPhaseList },
        ];
        for (const vl of videoLogs) {
          // Skip if not active mode
          if (vl.label === 'Quick' && videoMode === 'Pro') continue;
          if (vl.label === 'Pro' && videoMode === 'Quick') continue;

          const vLog = path.join(logsDir, vl.file);
          const vContent = fs.existsSync(vLog) ? fs.readFileSync(vLog, 'utf-8') : '';

          // Detect which phases are done/running from log markers
          const phaseMarkers = [
            { key: 'Generating narration', label: 'Narracao', icon: '▶️' },
            { key: 'Narration already exists', label: 'Narracao', icon: '✅' },
            { key: 'Narration generated', label: 'Narracao', icon: '✅' },
            { key: 'Analyzing narration audio', label: 'Timing audio', icon: '▶️' },
            { key: 'Audio timing:', label: 'Timing audio', icon: '✅' },
            { key: 'Photography Director', label: 'Dir. Fotografia', icon: '▶️' },
            { key: 'Photography plan created', label: 'Dir. Fotografia', icon: '✅' },
            { key: 'Photography plan already exists', label: 'Dir. Fotografia', icon: '✅' },
            { key: 'Creating scene plan', label: 'Scene plan', icon: '▶️' },
            { key: 'Scene plan saved', label: 'Scene plan', icon: '✅' },
            { key: 'Typography validation', label: 'Validacao tipografica', icon: '▶️' },
            { key: 'typography fixes applied', label: 'Validacao tipografica', icon: '✅' },
            { key: 'No typography fixes', label: 'Validacao tipografica', icon: '✅' },
            { key: 'Generating image', label: 'Gerando imagens', icon: '▶️' },
            { key: 'Updated plan with', label: 'Gerando imagens', icon: '✅' },
            { key: '[VIDEO_APPROVAL_NEEDED] Waiting', label: 'Aprovacao', icon: '🔄' },
            { key: 'Starting video render', label: 'Render final', icon: '▶️' },
            { key: 'render_start', label: 'Render final', icon: '▶️' },
            { key: 'Video 1 rendered', label: 'Render final', icon: '✅' },
            { key: 'Completed successfully', label: 'Completo', icon: '✅' },
          ];
          const phaseStatus = new Map();
          for (const p of phaseMarkers) {
            if (vContent.includes(p.key)) phaseStatus.set(p.label, p.icon);
          }
          // If completed, remove the approval waiting line
          if (phaseStatus.get('Completo') === '✅') phaseStatus.delete('Aprovacao');

          // Show ALL phases with status (⬜ for not started)
          const hasAnyPhase = vContent.length > 0;
          if (hasAnyPhase || stageIcon === '▶️' || stageIcon === '🔄') {
            lines.push(`      <i>${vl.label}:</i>`);
            for (const phase of vl.allPhases) {
              const icon = phaseStatus.get(phase) || '⬜';
              lines.push(`      ${icon} ${phase}`);
            }
          }
        }
      }

      // Show stage 2 sub-phases (images)
      if (num === 2 && (hasAnyLog || stageIcon !== '⬜')) {
        const imgPhases = [
          'Gerar prompts', 'Gerar imagens', 'Aprovacao imagens',
          'Montar criativos', 'Validacao aspect ratio', 'Completo'
        ];
        const adLog = path.join(logsDir, 'ad_creative_designer.log');
        const adContent = fs.existsSync(adLog) ? fs.readFileSync(adLog, 'utf-8') : '';
        const imgMarkers = [
          { key: 'prompt', label: 'Gerar prompts', icon: '▶️' },
          { key: 'Generating image', label: 'Gerar imagens', icon: '▶️' },
          { key: 'Image generated', label: 'Gerar imagens', icon: '✅' },
          { key: 'approval', label: 'Aprovacao imagens', icon: '🔄' },
          { key: 'approved', label: 'Aprovacao imagens', icon: '✅' },
          { key: 'Rendering HTML', label: 'Montar criativos', icon: '▶️' },
          { key: 'Screenshot saved', label: 'Montar criativos', icon: '✅' },
          { key: 'aspect ratio', label: 'Validacao aspect ratio', icon: '✅' },
          { key: 'Completed successfully', label: 'Completo', icon: '✅' },
        ];
        const imgStatus = new Map();
        for (const m of imgMarkers) {
          if (adContent.includes(m.key)) imgStatus.set(m.label, m.icon);
        }
        for (const phase of imgPhases) {
          const icon = imgStatus.get(phase) || '⬜';
          lines.push(`      ${icon} ${phase}`);
        }
      }
    }
  }


  const cv = s.campaignV3;
  let approvalStatus = '';
  if (cv?.pendingApproval) {
    const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
    approvalStatus = `\n⏳ <b>Aprovacao pendente — Etapa ${cv.pendingApproval.stage}: ${stageLabels[cv.pendingApproval.stage] || ''}</b>`;
  }

  const rerunInfo = s.runningTask?.rerun ? '\n🔄 <i>Reprocessamento</i>' : '';

  await ctx.reply(
    `<b>Pipeline: ${s.runningTask.taskName}</b>${rerunInfo}\n` +
    `Iniciado: ${s.runningTask.startedAt}` +
    approvalStatus + '\n\n' +
    lines.join('\n'),
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

// ── Rerun helpers ────────────────────────────────────────────────────────────

function findCampaign(projectDir, query) {
  const outputsDir = path.resolve(PROJECT_ROOT, projectDir, 'outputs');
  if (!fs.existsSync(outputsDir)) return null;
  const folders = fs.readdirSync(outputsDir).sort();
  const q = query.toLowerCase().replace(/^c0*/, 'c');
  const exact = folders.find(f => f === query);
  if (exact) return exact;
  return folders.find(f => f.toLowerCase().replace(/^c0*/, 'c').startsWith(q) || f.toLowerCase().includes(query.toLowerCase())) || null;
}

function resolveStageAlias(alias) {
  const map = {
    'brief': 1, 'narrativa': 1, 'pesquisa': 1, 'research': 1, 'estrategia': 1,
    'imagens': 2, 'imagem': 2, 'ads': 2, 'carousel': 2, 'carrossel': 2, 'designer': 2,
    'video': 3, 'videos': 3, 'quick': 3, 'pro': 3,
    'plataformas': 4, 'plataforma': 4, 'instagram': 4, 'youtube': 4, 'tiktok': 4, 'facebook': 4, 'threads': 4, 'linkedin': 4, 'copy': 4,
    'distribuicao': 5, 'publicar': 5, 'publish': 5,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
  };
  return map[alias.toLowerCase()] || null;
}

function detectProjectFromText(text, currentProjectDir) {
  const prjDir = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjDir)) return currentProjectDir;
  const projects = fs.readdirSync(prjDir);
  const lower = text.toLowerCase();
  for (const p of projects) {
    if (lower.includes(p.toLowerCase())) return `prj/${p}`;
  }
  return currentProjectDir;
}

function findCampaignAcrossProjects(query) {
  const prjRoot = path.join(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjRoot)) return null;
  for (const prj of fs.readdirSync(prjRoot)) {
    const found = findCampaign(`prj/${prj}`, query);
    if (found) return { projectDir: `prj/${prj}`, campaignFolder: found };
  }
  return null;
}

// ── /continue ────────────────────────────────────────────────────────────────

bot.command('continue', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (s.runningTask) {
    return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
  }

  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      '<b>/continue — Continuar campanha de onde parou</b>\n\n' +
      'Uso: <code>/continue &lt;campanha&gt;</code>\n\n' +
      'Detecta automaticamente quais etapas faltam e continua.\n' +
      'Aceita flags de imagem: screenshot, api, free\n\n' +
      'Exemplos:\n' +
      '<code>/continue c16</code>\n' +
      '<code>/continue c16 screenshot</code>\n' +
      '<code>/continue c16 inema.club</code>',
      { parse_mode: 'HTML' }
    );
  }

  const tokens = raw.split(/\s+/);
  const campaignQuery = tokens[0];

  // Parse optional flags (image source, urls, video mode, draft) from remaining tokens
  let imageSource = 'brand';
  let userRequestedPro = false;
  let userRequestedQuick = false;
  let userRequestedDraft = false;
  const screenshotUrls = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (t === 'pro') { userRequestedPro = true; continue; }
    if (t === 'quick') { userRequestedQuick = true; continue; }
    if (t === 'draft') { userRequestedDraft = true; continue; }
    if (t === 'screenshot' || t === 'screenshots' || t === 'captura' || t === 'capturas') { imageSource = 'screenshot'; continue; }
    if (t === 'api') { imageSource = 'api'; continue; }
    if (t === 'free' || t === 'gratis' || t === 'stock') { imageSource = 'free'; continue; }
    if (t.match(/^https?:\/\//) || t.match(/\.\w{2,4}$/)) {
      screenshotUrls.push(t.startsWith('http') ? t : `https://${t}`);
      if (imageSource === 'brand') imageSource = 'screenshot';
      continue;
    }
  }

  // Find campaign
  let projectDir = s.projectDir;
  let campaignFolder = findCampaign(projectDir, campaignQuery);
  if (!campaignFolder) {
    const result = findCampaignAcrossProjects(campaignQuery);
    if (result) { projectDir = result.projectDir; campaignFolder = result.campaignFolder; }
  }
  if (!campaignFolder) {
    return ctx.reply(`Campanha "${campaignQuery}" nao encontrada em nenhum projeto.`);
  }
  if (projectDir !== s.projectDir) session.setProject(chatId, projectDir);

  const outputDir = `${projectDir}/outputs/${campaignFolder}`;
  const absOut = path.resolve(PROJECT_ROOT, outputDir);

  // Detect what's done and what's missing
  const has = (rel) => fs.existsSync(path.join(absOut, rel));
  const hasAny = (dir, ext) => {
    const d = path.join(absOut, dir);
    if (!fs.existsSync(d)) return false;
    return fs.readdirSync(d).some(f => f.endsWith(ext));
  };

  const stageStatus = {
    1: has('creative/creative_brief.json') && has('copy/narrative.json'),
    2: hasAny('ads', '.png'),
    3: hasAny('video', '.mp4'),
    4: hasAny('platforms', '.json'),
    5: has(`Publish ${campaignFolder} ${new Date().toISOString().slice(0, 10)}.md`) || fs.readdirSync(absOut).some(f => f.startsWith('Publish ')),
  };

  // Find stages that need to run (incomplete or never started)
  const missingStages = [];
  for (let i = 1; i <= 5; i++) {
    if (!stageStatus[i]) missingStages.push(i);
  }

  if (missingStages.length === 0) {
    return ctx.reply(`Campanha <b>${campaignFolder}</b> esta completa! Todos os 5 estagios ja foram executados.\n\nUse /rerun para reprocessar etapas especificas.`, { parse_mode: 'HTML' });
  }

  // Read brief for platforms
  let briefData = {};
  const briefPath = path.join(absOut, 'creative', 'creative_brief.json');
  if (fs.existsSync(briefPath)) {
    try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
  }

  // Determine video mode: user flag > saved payload > existing files > default quick
  let originalPayload = null;
  const savedPayloadPath = path.join(absOut, 'campaign_payload.json');
  if (fs.existsSync(savedPayloadPath)) {
    try { originalPayload = JSON.parse(fs.readFileSync(savedPayloadPath, 'utf-8')); } catch {}
  }

  let videoPro, videoQuick, videoMode;
  if (userRequestedPro || userRequestedQuick) {
    // User explicitly specified — use their choice
    videoPro = userRequestedPro;
    videoQuick = true;
  } else if (originalPayload?.video_mode) {
    // Inherit from saved payload
    videoPro = originalPayload.video_pro === true;
    videoQuick = originalPayload.video_quick !== false;
  } else {
    // Fallback: detect from existing files
    const videoDir = path.join(absOut, 'video');
    const audioDir = path.join(absOut, 'audio');
    const hasScenePlan = fs.existsSync(videoDir) && fs.readdirSync(videoDir).some(f => f.includes('scene_plan'));
    const hasNarration = fs.existsSync(audioDir) && fs.readdirSync(audioDir).some(f => f.includes('narration'));
    videoPro = hasScenePlan || hasNarration;
    videoQuick = true;
  }
  videoMode = videoPro ? 'both' : 'quick';

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
  const doneIcon = '✅';
  const todoIcon = '⏳';

  const statusLines = [];
  for (let i = 1; i <= 5; i++) {
    const icon = stageStatus[i] ? doneIcon : todoIcon;
    if (i === 3) {
      // Show video quick and pro as separate sub-items
      const qIcon = stageStatus[3] ? '✅' : '▶️';
      const pIcon = stageStatus[3] ? '✅' : (videoPro ? '▶️' : '⬜');
      statusLines.push(`${icon} <b>${i}.</b> Video`);
      statusLines.push(`    ${qIcon} Quick`);
      if (videoPro) statusLines.push(`    ${pIcon} Pro`);
    } else {
      statusLines.push(`${icon} <b>${i}.</b> ${stageLabels[i]}`);
    }
  }

  const imgLabels = { brand: 'marca', screenshot: 'screenshots do site', api: 'IA (API)', free: 'banco gratis' };
  const imgInfo = imageSource !== 'brand' ? `\nImagens: <b>${imgLabels[imageSource] || imageSource}</b>` : '';
  const urlInfo = screenshotUrls.length > 0 ? `\nURLs: ${screenshotUrls.join(', ')}` : '';
  const videoInfo = `\nVideo Quick: <b>${videoQuick ? '1' : '0'}</b> | Video Pro: <b>${videoPro ? '1' : '0'}</b>`;

  await ctx.reply(
    `<b>Continuar: ${campaignFolder}</b>\n` +
    `Projeto: <code>${projectDir}</code>${imgInfo}${videoInfo}${urlInfo}\n\n` +
    statusLines.join('\n') + '\n\n' +
    `Vai executar ${missingStages.length} etapa(s) pendente(s).\n` +
    `Responda <b>sim</b> para iniciar.`,
    { parse_mode: 'HTML' }
  );

  session.setPendingRerun(chatId, { payload, stages: missingStages, campaignFolder });
});

// ── /rerun ───────────────────────────────────────────────────────────────────

bot.command('rerun', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  if (s.runningTask) {
    return ctx.reply('Ja existe um pipeline rodando. Use /status para acompanhar.');
  }

  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply(
      '<b>/rerun — Reprocessar etapas de campanha existente</b>\n\n' +
      'Uso: <code>/rerun &lt;campanha&gt; &lt;etapas&gt;</code>\n\n' +
      'Exemplos:\n' +
      '<code>/rerun c13 imagens</code>\n' +
      '<code>/rerun c13 video quick</code>\n' +
      '<code>/rerun c13 video pro</code>\n' +
      '<code>/rerun c13 video pro screenshot</code>\n' +
      '<code>/rerun c13 video pro inema.club</code>\n' +
      '<code>/rerun c13 imagens api</code>\n' +
      '<code>/rerun c13 2,3</code>\n' +
      '<code>/rerun c13 video pro cleanplan</code>\n' +
      '<code>/rerun c13 video pro cleanall</code>\n\n' +
      'Fonte de imagens: <i>brand</i> (default), <i>screenshot</i>, <i>api</i>, <i>free</i>, <i>pasta</i>\n' +
      'Limpeza: <i>cleanplan</i>, <i>cleanimg</i>, <i>cleanaudio</i>, <i>cleanall</i>',
      { parse_mode: 'HTML' }
    );
  }

  const args = raw.split(/\s+/);
  const campaignQuery = args[0];
  const stageArgs = args.slice(1).join(' ').split(',').map(x => x.trim()).filter(Boolean);

  // Find campaign: try active project, then all projects
  let projectDir = s.projectDir;
  let campaignFolder = findCampaign(projectDir, campaignQuery);

  if (!campaignFolder) {
    const result = findCampaignAcrossProjects(campaignQuery);
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
  const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);

  // Resolve stages and detect video type
  if (stageArgs.length === 0) {
    return ctx.reply('Especifique quais etapas. Ex: <code>/rerun c13 video quick</code>', { parse_mode: 'HTML' });
  }

  // Parse stage args — detect "video quick", "video pro", draft, image source flags
  const allTokens = stageArgs.join(' ').toLowerCase().split(/[\s,]+/);
  const stageNumbers = new Set();
  let videoQuick = false;
  let videoPro = false;
  let videoDraft = false;
  let imageSource = 'brand';
  let payload_imageFolder = null;
  const screenshotUrls = [];
  const cleanFlags = { plan: false, img: false, audio: false };

  for (let i = 0; i < allTokens.length; i++) {
    const token = allTokens[i];
    const next = allTokens[i + 1];

    // Video mode detection
    if ((token === 'video' || token === 'videos') && next === 'quick') {
      stageNumbers.add(3); videoQuick = true; i++; continue;
    }
    if ((token === 'video' || token === 'videos') && next === 'pro') {
      stageNumbers.add(3); videoPro = true; i++; continue;
    }
    if (token === 'quick') { stageNumbers.add(3); videoQuick = true; continue; }
    if (token === 'pro') { stageNumbers.add(3); videoPro = true; continue; }
    if (token === 'draft') { videoDraft = true; continue; }

    // Cleanup flags
    if (token === 'cleanplan' || token === 'limparplano') { cleanFlags.plan = true; continue; }
    if (token === 'cleanimg' || token === 'limparimagens') { cleanFlags.img = true; continue; }
    if (token === 'cleanaudio' || token === 'limparaudio') { cleanFlags.audio = true; continue; }
    if (token === 'cleanall' || token === 'limpartudo') { cleanFlags.plan = true; cleanFlags.img = true; cleanFlags.audio = true; continue; }

    // Image source detection
    if (token === 'screenshot' || token === 'screenshots' || token === 'captura' || token === 'capturas') {
      imageSource = 'screenshot'; continue;
    }
    if (token === 'api') { imageSource = 'api'; continue; }
    if (token === 'free' || token === 'gratis' || token === 'stock') { imageSource = 'free'; continue; }
    if (token === 'pasta' || token === 'folder') {
      imageSource = 'folder';
      // Next token might be the folder path
      if (next && !resolveStageAlias(next) && !['quick','pro','screenshot','api','free'].includes(next)) {
        payload_imageFolder = next; i++;
      }
      continue;
    }

    // URL detection (for screenshot_urls)
    if (token.match(/^https?:\/\//) || token.match(/\.\w{2,4}$/)) {
      screenshotUrls.push(token.startsWith('http') ? token : `https://${token}`);
      if (imageSource === 'brand') imageSource = 'screenshot'; // auto-detect
      continue;
    }

    const resolved = resolveStageAlias(token);
    if (resolved) {
      stageNumbers.add(resolved);
      if (resolved === 3 && !videoQuick && !videoPro) videoQuick = true; // "video" alone = quick
    }
  }

  const sortedStages = [...stageNumbers].sort();
  if (sortedStages.length === 0) {
    return ctx.reply('Etapas nao reconhecidas. Use: brief, imagens, video quick, video pro, plataformas, distribuicao.');
  }

  // Read existing brief
  let briefData = {};
  const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
  if (fs.existsSync(briefPath)) {
    try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
  }

  // Quick always runs; pro is additional when requested
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
    image_folder: payload_imageFolder,
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
    skip_completed: false,  // rerun always generates new content
  };

  const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
  const stageList = sortedStages.map(n => {
    if (n === 3) {
      const lines = [`  <b>${n}.</b> Video`];
      if (videoQuick) lines.push('      ▶️ Quick');
      if (videoPro) lines.push('      ▶️ Pro');
      return lines.join('\n');
    }
    return `  <b>${n}.</b> ${stageLabels[n]}`;
  }).join('\n');

  const imgLabels = { brand: 'marca', screenshot: 'screenshots do site', api: 'IA (API)', free: 'banco gratis', folder: 'pasta customizada' };
  const imgInfo = imageSource !== 'brand' ? `\nImagens: <b>${imgLabels[imageSource] || imageSource}</b>` : '';
  const urlInfo = screenshotUrls.length > 0 ? `\nURLs: ${screenshotUrls.join(', ')}` : '';
  const videoInfo = (videoQuick || videoPro) ? `\nVideo Quick: <b>${videoQuick ? '1' : '0'}</b> | Video Pro: <b>${videoPro ? '1' : '0'}</b>` : '';

  await ctx.reply(
    `<b>Reprocessar: ${campaignFolder}</b>\n` +
    `Projeto: <code>${projectDir}</code>${imgInfo}${videoInfo}${urlInfo}\n\n` +
    `Etapas:\n${stageList}\n\n` +
    `Responda <b>sim</b> para iniciar.`,
    { parse_mode: 'HTML' }
  );

  // Attach clean flags to payload
  if (cleanFlags.plan || cleanFlags.img || cleanFlags.audio) {
    payload.cleanFlags = cleanFlags;
  }

  session.setPendingRerun(chatId, { payload, stages: sortedStages, campaignFolder });
});

// ── Free text → campaign confirmation or Claude conversation ─────────────────

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;

  // Ignore commands (already handled above)
  if (text.startsWith('/')) return;

  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);

  // ── Image generation error decision ────────────────────────────────────
  if (s.pendingImageError) {
    const lower = text.toLowerCase().trim();
    const { outputDir } = s.pendingImageError;
    const decisionPath = path.resolve(PROJECT_ROOT, outputDir, 'imgs', 'error_decision.json');

    let action = null;
    let newSource = null;
    if (/^(avan[çc]|avanc|continuar|sem imagem)/.test(lower)) action = 'advance';
    else if (/^(tentar|retry|repetir|novamente)/.test(lower))  action = 'retry';
    else if (/^(cancel|cancelar|nao|não|para)/.test(lower))    action = 'cancel';
    else if (/^(outra|trocar|mudar|fonte|source)/.test(lower) || /^(api|free|gratis|brand|marca|folder|pasta)/.test(lower)) {
      // Parse new image source from the message
      if (/api/.test(lower)) newSource = 'api';
      else if (/free|gratis|stock/.test(lower)) newSource = 'free';
      else if (/brand|marca/.test(lower)) newSource = 'brand';
      else if (/folder|pasta/.test(lower)) {
        newSource = 'folder';
        // Try to extract folder path from message
        const folderMatch = text.match(/(?:folder|pasta)\s+(\S+)/i);
        if (folderMatch) {
          // Store folder path in decision for worker to pick up
          action = 'change_source';
          fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
          fs.writeFileSync(decisionPath, JSON.stringify({ action, image_source: 'folder', image_folder: folderMatch[1], ts: Date.now() }));
          session.clearPendingImageError(chatId);
          await ctx.reply(`🔄 Trocando para pasta: <code>${folderMatch[1]}</code>`, { parse_mode: 'HTML' });
          return;
        }
      }
      if (newSource && !action) {
        action = 'change_source';
        fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
        fs.writeFileSync(decisionPath, JSON.stringify({ action, image_source: newSource, ts: Date.now() }));
        session.clearPendingImageError(chatId);
        const sourceLabels = { api: 'IA (API)', free: 'banco grátis', brand: 'assets da marca', folder: 'pasta' };
        await ctx.reply(`🔄 Trocando fonte de imagens para: <b>${sourceLabels[newSource]}</b>`, { parse_mode: 'HTML' });
        return;
      }
    }

    if (action) {
      fs.mkdirSync(path.dirname(decisionPath), { recursive: true });
      fs.writeFileSync(decisionPath, JSON.stringify({ action, ts: Date.now() }));
      session.clearPendingImageError(chatId);
      const msgs = {
        advance:  '▶️ Avançando sem imagens — usando layout CSS.',
        retry:    '🔄 Tentando gerar as imagens novamente...',
        cancel:   '❌ Campanha cancelada.',
      };
      await ctx.reply(msgs[action]);
      return;
    }
    // unknown reply — show options again
    await ctx.reply(
      'Responda:\n• <b>avançar</b> — continuar sem imagens (CSS)\n• <b>tentar novamente</b> — repetir a geração\n• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n• <b>cancelar</b>',
      { parse_mode: 'HTML' }
    );
    return;
  }

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

  // ── Confirmation replies for pending rerun ──────────────────────────────
  if (s.pendingRerun) {
    const lower = text.toLowerCase().trim();
    const isConfirm = /^(sim|ok|confirmar|confirma|aprovado|aprovar|vai|bora|yes|roda)/.test(lower);
    const isCancel  = /^(nao|não|cancela|cancelar|cancel|para|parar|no\b)/.test(lower);

    if (isConfirm) {
      const { payload, stages, campaignFolder } = s.pendingRerun;
      session.clearPendingRerun(chatId);

      const videoMode = payload.video_pro && payload.video_quick ? 'Quick + Pro'
        : payload.video_pro ? 'Pro' : 'Quick';
      session.setRunningTask(chatId, {
        taskName: campaignFolder,
        taskDate: payload.task_date,
        outputDir: payload.output_dir,
        startedAt: new Date().toISOString(),
        rerun: true,
        rerunStages: stages,
        videoMode,
      });

      const stageLabels = { 1: 'Brief', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
      const label = stages.map(n => n === 3 ? `Video ${videoMode}` : stageLabels[n]).join(' + ');
      await ctx.reply(`Reprocessando <b>${campaignFolder}</b> — ${label}...`, { parse_mode: 'HTML' });

      // Apply cleanup flags
      const absOutDir = path.resolve(PROJECT_ROOT, payload.output_dir);
      if (payload.cleanFlags) {
        if (payload.cleanFlags.plan) {
          const videoDir = path.join(absOutDir, 'video');
          if (fs.existsSync(videoDir)) {
            for (const f of fs.readdirSync(videoDir)) {
              if (f.endsWith('_scene_plan.json') || f.endsWith('_scene_plan_motion.json') || f === 'photography_plan.json') {
                fs.unlinkSync(path.join(videoDir, f));
              }
            }
            await ctx.reply('🗑️ Planos de cena limpos.').catch(() => {});
          }
        }
        if (payload.cleanFlags.img) {
          const imgsDir = path.join(absOutDir, 'imgs');
          if (fs.existsSync(imgsDir)) {
            for (const f of fs.readdirSync(imgsDir)) {
              if (f.endsWith('.jpg') || f.endsWith('.png') || f.endsWith('.webp')) {
                fs.unlinkSync(path.join(imgsDir, f));
              }
            }
            // Also clean approval files
            for (const f of ['approved.json', 'rejected.json', 'approval_needed.json', 'error_decision.json']) {
              const fp = path.join(imgsDir, f);
              if (fs.existsSync(fp)) fs.unlinkSync(fp);
            }
            await ctx.reply('🗑️ Imagens limpas.').catch(() => {});
          }
        }
        if (payload.cleanFlags.audio) {
          const audioDir = path.join(absOutDir, 'audio');
          if (fs.existsSync(audioDir)) {
            for (const f of fs.readdirSync(audioDir)) {
              if (f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('_timing.json')) {
                fs.unlinkSync(path.join(audioDir, f));
              }
            }
            await ctx.reply('🗑️ Áudio limpo.').catch(() => {});
          }
        }
      }

      // Run each requested stage sequentially
      const runRerunStages = async () => {
        for (const stageNum of stages) {
          const stageKey = `stage${stageNum}`;
          const agentNames = STAGES[stageKey];
          if (!agentNames) continue;

          await ctx.reply(`Etapa ${stageNum}/5 — ${stageLabels[stageNum]}...`).catch(() => {});

          // Ensure worker is running (use existing if available)
          const worker = ensureWorker();

          // Determine which agents will actually run for this stage
          let activeAgents = [...agentNames];
          if (stageNum === 3) {
            activeAgents = [];
            if (payload.video_quick !== false) activeAgents.push('video_quick');
            if (payload.video_pro === true) activeAgents.push('video_pro');
            if (activeAgents.length === 0) activeAgents.push('video_quick');
          }
          if (stageNum === 4) {
            const targets = payload.platform_targets || [];
            activeAgents = agentNames.filter(a => targets.includes(a.replace('platform_', '')));
          }

          // Clear old logs for agents being reprocessed so polling doesn't see stale completions
          const logsDir = path.resolve(PROJECT_ROOT, payload.output_dir, 'logs');
          fs.mkdirSync(logsDir, { recursive: true });
          for (const a of activeAgents) {
            const logFile = path.join(logsDir, `${a}.log`);
            if (fs.existsSync(logFile)) fs.unlinkSync(logFile);
          }

          await _enqueueStage(payload, agentNames);

          // Wait for all ACTIVE agents to complete by polling log files
          const expected = activeAgents.length;
          await new Promise((resolve) => {
            const checkInterval = setInterval(() => {
              if (!fs.existsSync(logsDir)) return;
              let done = 0;
              for (const a of activeAgents) {
                const logFile = path.join(logsDir, `${a}.log`);
                if (!fs.existsSync(logFile)) continue;
                const content = fs.readFileSync(logFile, 'utf-8');
                if (content.includes('Completed successfully') || content.includes('FAILED')) done++;
              }
              if (done >= expected) {
                clearInterval(checkInterval);
                if (worker) worker.kill('SIGTERM');
                resolve();
              }
            }, 5000);

            // Timeout 30 min per stage
            setTimeout(() => { clearInterval(checkInterval); if (worker) worker.kill('SIGTERM'); resolve(); }, 1800000);
          });
        }

        session.clearRunningTask(chatId);
        await bot.api.sendMessage(chatId, `Reprocessamento de <b>${campaignFolder}</b> concluido!`, { parse_mode: 'HTML' }).catch(() => {});
      };

      runRerunStages().catch(e => {
        console.error('[rerun error]', e.message);
        session.clearRunningTask(chatId);
        bot.api.sendMessage(chatId, `Erro no reprocessamento: ${e.message}`).catch(() => {});
      });

      return;
    }

    if (isCancel) {
      session.clearPendingRerun(chatId);
      await ctx.reply('Reprocessamento cancelado.');
      return;
    }
  }

  // ── Confirmation replies for pending campaign ───────────────────────────
  if (s.pendingCampaign) {
    const lower = text.toLowerCase().trim();

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

      session.clearHistory(chatId); // Clean slate for new campaign
      await ctx.reply(`Iniciando pipeline <b>${payload.task_name}</b>...\n\nUse /status para acompanhar.`, { parse_mode: 'HTML' });
      runPipelineV3(ctx, chatId, payload, outputDir);
      return;
    }

    if (isCancel) {
      session.clearPendingCampaign(chatId);
      await ctx.reply('Campanha cancelada.');
      return;
    }

    // Quick config commands before confirming
    if (/^auto$/.test(lower)) {
      s.pendingCampaign.approval_modes = { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' };
      await ctx.reply('✅ Todas as aprovações definidas como <b>auto</b>.', { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^(notif|notifica).*(off|desativ|nao|não)/.test(lower)) {
      s.pendingCampaign.notifications = false;
      await ctx.reply('🔇 Notificações desativadas.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^(notif|notifica).*(on|ativ|sim)/.test(lower)) {
      s.pendingCampaign.notifications = true;
      await ctx.reply('🔔 Notificações ativadas.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^pro$/.test(lower)) {
      s.pendingCampaign.video_pro = true;
      s.pendingCampaign.video_quick = true;
      s.pendingCampaign.video_mode = 'both';
      await ctx.reply('✅ Video Pro adicionado.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^humano$/.test(lower)) {
      s.pendingCampaign.approval_modes = { stage1: 'humano', stage2: 'humano', stage3: 'humano', stage4: 'humano', stage5: 'humano' };
      await ctx.reply('✅ Todas as aprovações definidas como <b>humano</b>.', { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^sem\s*quick$/i.test(lower)) {
      s.pendingCampaign.video_quick = false;
      s.pendingCampaign.video_mode = s.pendingCampaign.video_pro ? 'pro' : 'quick';
      await ctx.reply('✅ Video Quick desativado.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^pular\s+(pesquisa|research)$/i.test(lower)) {
      s.pendingCampaign.skip_research = true;
      await ctx.reply('✅ Pesquisa será pulada.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^fundo\s+(blur|desfoque|desfocado)/i.test(lower)) {
      s.pendingCampaign.image_bg_mode = 'blur';
      await ctx.reply('✅ Fundo do quick: <b>blur</b> (imagem desfocada)', { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^fundo\s+(escuro|dark|black|preto)/i.test(lower)) {
      s.pendingCampaign.image_bg_mode = 'dark';
      await ctx.reply('✅ Fundo do quick: <b>escuro</b> (default)', { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^pular\s+(imagens?|image)$/i.test(lower)) {
      s.pendingCampaign.skip_image = true;
      await ctx.reply('✅ Imagens serão puladas.');
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^idioma\s+(.+)$/i.test(lower)) {
      const lang = lower.match(/^idioma\s+(.+)$/i)[1].trim();
      s.pendingCampaign.language = lang;
      await ctx.reply(`✅ Idioma: <b>${lang}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^narrad(or|ora)\s+(.+)$/i.test(lower)) {
      const narrator = lower.match(/^narrad(?:or|ora)\s+(.+)$/i)[1].trim();
      s.pendingCampaign.narrator = narrator;
      await ctx.reply(`✅ Narrador: <b>${narrator}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^estilo\s+(.+)$/i.test(lower)) {
      const style = lower.match(/^estilo\s+(.+)$/i)[1].trim();
      s.pendingCampaign.style_preset = style;
      await ctx.reply(`✅ Estilo visual: <b>${style}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^dura[çc][aã]o\s+(\d+)/i.test(lower)) {
      const dur = parseInt(lower.match(/^dura[çc][aã]o\s+(\d+)/i)[1]);
      s.pendingCampaign.video_duration = dur;
      await ctx.reply(`✅ Duração do vídeo Pro: <b>${dur}s</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^(provider|provedor)\s+(.+)$/i.test(lower)) {
      const prov = lower.match(/^(?:provider|provedor)\s+(.+)$/i)[1].trim();
      process.env.IMAGE_PROVIDER = prov;
      await ctx.reply(`✅ Provider de imagens: <b>${prov}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^modelo?\s+(.+)$/i.test(lower)) {
      const model = lower.match(/^modelo?\s+(.+)$/i)[1].trim();
      s.pendingCampaign.image_model = model;
      await ctx.reply(`✅ Modelo de imagem: <b>${model}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }
    if (/^fonte\s+(brand|api|free|screenshot|pasta)$/i.test(lower)) {
      const source = lower.match(/^fonte\s+(.+)$/i)[1].trim();
      s.pendingCampaign.image_source = source;
      await ctx.reply(`✅ Fonte de imagens: <b>${source}</b>`, { parse_mode: 'HTML' });
      showCampaignConfirmation(ctx, chatId, s.pendingCampaign);
      return;
    }

    // User is refining the brief — combine original brief with adjustment
    if (lower.length > 5) {
      const originalBrief = s.pendingCampaign.campaign_brief || '';
      const combinedText = `${originalBrief}. Ajuste: ${text}`;
      await ctx.reply('Atualizando o briefing...');
      parseCampaignFromText(combinedText, s.projectDir, (payload) => {
        if (payload) {
          // Preserve original settings, override only what changed
          const merged = { ...s.pendingCampaign, ...payload };
          merged.campaign_brief = payload.campaign_brief || combinedText;
          session.setPendingCampaign(chatId, merged);
          showCampaignConfirmation(ctx, chatId, merged);
        } else {
          ctx.reply('Nao entendi o ajuste. Responda <b>sim</b> para confirmar ou descreva o que quer mudar.', { parse_mode: 'HTML' });
        }
      });
      return;
    }
  }

  // ── Detect rerun intent in free text ─────────────────────────────────
  const rerunKeywords = /\b(recri[ae]|refaz|refazer|reprocessa|re-?run|gera? novas?|nova vers[ãa]o|outra vers[ãa]o|recriar)\b/i;
  const campaignRef = text.match(/\b(c\d{1,4})\b/i);
  if (rerunKeywords.test(text) && campaignRef && !s.runningTask && !s.processing) {
    let rerunProjectDir = detectProjectFromText(text, s.projectDir);
    let campaignFolder = findCampaign(rerunProjectDir, campaignRef[1]);

    // Search all projects if not found
    if (!campaignFolder) {
      const prjRoot = path.join(PROJECT_ROOT, 'prj');
      if (fs.existsSync(prjRoot)) {
        for (const prj of fs.readdirSync(prjRoot)) {
          const found = findCampaign(`prj/${prj}`, campaignRef[1]);
          if (found) { rerunProjectDir = `prj/${prj}`; campaignFolder = found; break; }
        }
      }
    }

    if (rerunProjectDir !== s.projectDir) session.setProject(chatId, rerunProjectDir);

    if (campaignFolder) {
      // Detect which stages from the text
      const stageAliases = text.toLowerCase().split(/[\s,]+/).map(resolveStageAlias).filter(Boolean);
      const stages = stageAliases.length > 0 ? [...new Set(stageAliases)].sort() : [2]; // default: imagens

      const outputDir = `${rerunProjectDir}/outputs/${campaignFolder}`;
      const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
      const briefPath = path.join(absOutputDir, 'creative', 'creative_brief.json');
      let briefData = {};
      if (fs.existsSync(briefPath)) {
        try { briefData = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch {}
      }

      const payload = {
        task_name: campaignFolder,
        task_date: new Date().toISOString().slice(0, 10),
        project_dir: rerunProjectDir,
        output_dir: outputDir,
        platform_targets: briefData.platforms || ['instagram', 'youtube', 'threads', 'facebook', 'tiktok', 'linkedin'],
        language: 'pt-BR',
        image_count: 5,
        image_formats: ['carousel_1080x1080', 'story_1080x1920'],
        video_count: 1,
        image_source: 'brand',
        image_model: process.env.KIE_DEFAULT_MODEL || (process.env.IMAGE_PROVIDER === 'pollinations' ? 'flux' : 'z-image'),
        use_brand_overlay: true,
        campaign_brief: briefData.campaign_angle || '',
        video_mode: 'quick',
        approval_modes: { stage1: 'auto', stage2: 'humano', stage3: 'humano', stage4: 'humano', stage5: 'humano' },
        notifications: true,
        skip_dependencies: true,
      };

      const stageLabels = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuicao' };
      const stageList = stages.map(n => `  <b>${n}.</b> ${stageLabels[n]}`).join('\n');

      await ctx.reply(
        `<b>Reprocessar campanha: ${campaignFolder}</b>\n\n` +
        `Etapas:\n${stageList}\n\n` +
        `Responda <b>sim</b> para iniciar.`,
        { parse_mode: 'HTML' }
      );

      session.setPendingRerun(chatId, { payload, stages, campaignFolder });
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
    image_model: opts['img-model'] || process.env.KIE_DEFAULT_MODEL || (process.env.IMAGE_PROVIDER === 'pollinations' ? 'flux' : 'z-image'),
    use_brand_overlay: opts['brand-overlay'] !== 'false',
    campaign_brief: opts.brief || '',
    video_mode: opts['video-pro'] ? 'pro' : 'quick',
  };
}

// ── Campaign confirmation display ────────────────────────────────────────────

async function showCampaignConfirmation(ctx, chatId, payload) {
  const skipFlags = [];
  if (payload.skip_research) skipFlags.push('pesquisa');
  if (payload.skip_image)    skipFlags.push('imagens');
  if (payload.skip_video)    skipFlags.push('video');

  const activeProvider = process.env.IMAGE_PROVIDER || 'kie';
  const freeProvider = process.env.FREE_IMAGE_PROVIDER || 'pexels';
  const imgSource = {
    brand: 'imagens do projeto', marca: 'imagens do projeto',
    free: `banco gratis (${freeProvider})`, gratis: `banco gratis (${freeProvider})`,
    api: `${activeProvider === 'pollinations' ? 'Pollinations' : 'KIE'} API (geracao IA)`,
    folder: 'pasta customizada', pasta: 'pasta customizada',
    screenshot: 'screenshots de sites + marca', captura: 'screenshots de sites + marca',
  };
  const modelLabels = {
    // KIE
    'z-image': 'Z-Image', 'z-image-turbo': 'Z-Image Turbo',
    'flux-kontext-pro': 'Flux Pro', 'flux-kontext-max': 'Flux Max', 'gpt-image-1': 'GPT-Image-1',
    'seedream': 'SeedReam', 'flux-2': 'FLUX 2', 'grok-imagine': 'Grok Imagine', 'nano-banana-2': 'Nano Banana 2',
    // Pollinations
    'flux': 'FLUX Schnell', 'zimage': 'Z-Image Turbo (2x)', 'kontext': 'FLUX Kontext',
    'gptimage': 'GPT Image Mini', 'nanobanana-pro': 'Gemini 3 Pro',
  };

  const isApi = payload.image_source === 'api';
  const defaultModelLabel = activeProvider === 'pollinations' ? 'FLUX Schnell' : 'Z-Image';
  const modelLabel = modelLabels[payload.image_model] || payload.image_model || defaultModelLabel;
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

  // Video section
  const vQuick = payload.video_quick !== false;
  const vPro = payload.video_pro === true;
  lines.push('');
  lines.push(`<b>Video:</b>`);
  const bgLabel = payload.image_bg_mode === 'blur' ? 'blur' : 'escuro';
  lines.push(`  ▶️ Quick: ${vQuick ? 'sim' : 'nao'} (fundo ${bgLabel}) | ▶️ Pro: ${vPro ? 'sim' : 'nao'}`);
  if (vPro) {
    lines.push(`  <i>Narração:</i> ${payload.narrator || 'rachel'}`);
    lines.push(`  <i>Duração:</i> ${payload.video_duration || 60}s`);
    lines.push(`  <i>Style:</i> ${payload.style_preset || 'inema_hightech'}`);
  }
  lines.push(`<b>Idioma:</b> ${payload.language}`);

  if (skipFlags.length > 0) lines.push(`<b>Pular:</b> ${skipFlags.join(', ')}`);

  // Pipeline stages overview
  lines.push('');
  lines.push('<b>Pipeline (5 etapas):</b>');
  const stages = [
    { key: 'stage1', label: 'Brief & Narrativa', skip: payload.skip_research },
    { key: 'stage2', label: 'Imagens', skip: payload.skip_image },
    { key: 'stage3', label: 'Video', skip: payload.skip_video },
    { key: 'stage4', label: 'Plataformas', skip: false },
    { key: 'stage5', label: 'Distribuicao', skip: false },
  ];
  const modes = payload.approval_modes || {};
  const modeLabel = { humano: '👤', agente: '🤖', auto: '⚡' };
  for (const st of stages) {
    const m = modes[st.key] || 'humano';
    const skip = st.skip ? ' <s>PULAR</s>' : '';
    lines.push(`  ${modeLabel[m] || '👤'} ${st.label}${skip}`);
  }

  lines.push(`<b>Notificações:</b> ${payload.notifications === false ? 'desativadas' : 'ativadas'}`);

  // Always use brand context (colors + visual world) — never brand name in image
  if (isApi && payload.use_brand_overlay === undefined) {
    payload = { ...payload, use_brand_overlay: true };
  }
  lines.push(`\nResponda <b>sim</b> para rodar ou ajuste antes:`);
  lines.push(`• <code>auto</code> — aprovação automática`);
  lines.push(`• <code>humano</code> — aprovação manual (default)`);
  lines.push(`• <code>notif off</code> / <code>notif on</code>`);
  lines.push(`• <code>pro</code> — adicionar video pro`);
  lines.push(`• <code>sem quick</code> — desativar video quick`);
  lines.push(`• <code>fundo blur</code> / <code>fundo escuro</code> — fundo do quick`);
  lines.push(`• <code>pular pesquisa</code> / <code>pular imagens</code>`);
  lines.push(`• <code>idioma pt-BR</code> / <code>idioma en</code>`);
  lines.push(`• <code>narrador rachel</code> / <code>narrador bella</code>`);
  lines.push(`• <code>estilo inema_hightech</code> / <code>estilo 01_hero_film</code>`);
  lines.push(`• <code>duração 30</code> / <code>duração 60</code> — duração do pro (s)`);
  lines.push(`• <code>fonte brand</code> / <code>fonte api</code> / <code>fonte free</code>`);
  lines.push(`• <code>provider kie</code> / <code>provider pollinations</code>`);
  lines.push(`• <code>modelo z-image</code> / <code>modelo flux</code>`);
  lines.push(`• <code>não</code> — cancelar`);
  session.setPendingCampaign(chatId, payload);

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
  "video_quick": true,
  "video_pro": false,
  "image_source": "brand",
  "image_model": "${process.env.KIE_DEFAULT_MODEL || 'z-image'}",
  "approval_modes": {
    "stage1": "humano",
    "stage2": "humano",
    "stage3": "humano",
    "stage4": "humano",
    "stage5": "humano"
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

      // Ensure video_quick/pro defaults — quick ALWAYS runs
      payload.video_quick = true;
      payload.video_pro = payload.video_pro === true;
      payload.video_mode = payload.video_pro ? 'both' : 'quick';

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

  const systemContext = `You are the assistant for the ITAGMKT marketing automation system.
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

  // Store chatId and payload in output dir for restart recovery
  const absOutputDir = path.resolve(PROJECT_ROOT, outputDir);
  fs.mkdirSync(absOutputDir, { recursive: true });
  fs.writeFileSync(path.join(absOutputDir, 'chat_context.json'),
    JSON.stringify({ chatId: String(chatId), ts: Date.now() }));
  fs.writeFileSync(path.join(absOutputDir, 'campaign_payload.json'),
    JSON.stringify(payload, null, 2));

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

    // Step 2: start worker (only if not already running)
    const worker = ensureWorker();
    if (!worker) {
      ctx.reply('Worker já rodando — jobs serão processados automaticamente.');
      return;
    }

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
  fs.writeFileSync(path.join(absOutputDir, 'campaign_payload.json'),
    JSON.stringify(payload, null, 2));

  const approvalModes = payload.approval_modes || {
    stage1: 'humano', stage2: 'humano', stage3: 'humano', stage4: 'humano', stage5: 'humano',
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

  // Track which stage-2/3/4 agents have completed (in-memory, not in session)
  const stageAgentsDone = { stage2: new Set(), stage3: new Set(), stage4: new Set(), stage5: new Set() };

  // ctx expires after the Telegram update — use bot.api for async messages
  const botCtx = {
    reply: (text, opts) => bot.api.sendMessage(chatId, text, opts).catch(e => console.error('[v3 send]', e.message)),
    replyWithPhoto: (photo, opts) => bot.api.sendPhoto(chatId, photo, opts).catch(e => console.error('[v3 photo]', e.message)),
    chat: { id: chatId },
    api: bot.api,
  };

  // Start worker — stays alive for the entire campaign (skip if already running)
  const worker = ensureWorker();

  if (worker) worker.stdout.on('data', (d) => {
    const text = d.toString();
    console.log('[worker]', text.slice(0, 200));

    // Stage 1 signal — logged only; advancement handled by signal monitor
    if (text.includes('[STAGE1_DONE]')) {
      console.log('[v3] STAGE1_DONE received (monitor will advance)');
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

    // Image generation failed — ask user what to do
    if (text.includes('[IMAGE_GEN_ERROR]')) {
      const match = text.match(/\[IMAGE_GEN_ERROR\]\s*(\S+)\s+(.+)/);
      if (match) {
        const outputDir = match[1];
        const errorMsg  = match[2].trim();
        session.setPendingImageError(chatId, { outputDir });
        bot.api.sendMessage(chatId,
          `⚠️ <b>Erro na geração de imagens</b>\n\n<code>${errorMsg}</code>\n\n` +
          `O que deseja fazer?\n` +
          `• <b>avançar</b> — continuar sem imagens (CSS)\n` +
          `• <b>tentar novamente</b> — repetir a geração\n` +
          `• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n` +
          `• <b>cancelar</b> — cancelar a campanha`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
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

    // Video Pro progress notifications
    if (text.includes('[VIDEO_PRO_PROGRESS]')) {
      const match = text.match(/\[VIDEO_PRO_PROGRESS\]\s*\S+\s+(\S+)/);
      if (match) {
        const phase = match[1];
        const labels = {
          plan_ready: '📋 Video Pro: roteiro pronto, gerando draft...',
          images_start: '🖼 Video Pro: gerando imagens...',
          render_start: '🎬 Video Pro: renderizando vídeo final...',
        };
        const msg = labels[phase] || `🎬 Video Pro: ${phase}`;
        bot.api.sendMessage(chatId, msg).catch(() => {});
      }
    }

    // Video Pro draft ready — send draft video file
    if (text.includes('[STAGE3_DRAFT_READY]')) {
      const match = text.match(/\[STAGE3_DRAFT_READY\]\s*\S+\s+(\S+)/);
      if (match) {
        const draftPath = match[1];
        if (fs.existsSync(draftPath)) {
          bot.api.sendVideo(chatId, new InputFile(draftPath), {
            caption: '📹 Draft do Video Pro — confira o roteiro e timing',
          }).catch(e => console.error('[video_pro draft]', e.message));
        }
      }
    }

    // Track agent completions (notification only — stage advancement is handled by the signal monitor)
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

  if (worker) worker.stderr.on('data', (d) => {
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
  ctx.reply('Iniciando etapa 1/5 — Pesquisa & Brief Criativo...').then(() => {
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

  const labels = { 2: 'Imagens (Ads)', 3: 'Video', 4: 'Copy de plataforma', 5: 'Distribuicao' };
  await send(`Avancando para etapa ${stageNumber}/5 — ${labels[stageNumber] || `Etapa ${stageNumber}`}...`);

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
  const stageLabels = { 1: 'Brief & Narrativa', 2: 'Visuais (Imagens & Vídeo)', 3: 'Copy de Plataforma', 4: 'Distribuição' };

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

  // Auto mode — advance without review but still send key deliverables
  if (mode === 'auto') {
    // Stage 1: send research report even in auto mode
    if (stage === 1 && cv.notifications !== false) {
      const reportPath = path.join(PROJECT_ROOT, outputDir, 'interactive_report.html');
      const briefMdPath = path.join(PROJECT_ROOT, outputDir, 'research_brief.md');
      if (fs.existsSync(reportPath)) {
        await bot.api.sendDocument(chatId, new InputFile(reportPath), {
          caption: '📊 Relatório interativo da pesquisa'
        }).catch(() => {});
      }
      if (fs.existsSync(briefMdPath)) {
        await bot.api.sendDocument(chatId, new InputFile(briefMdPath), {
          caption: '📋 Research Brief'
        }).catch(() => {});
      }
    }
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
    // Send research report files
    const reportPath = path.join(PROJECT_ROOT, outputDir, 'interactive_report.html');
    const briefMdPath = path.join(PROJECT_ROOT, outputDir, 'research_brief.md');
    if (fs.existsSync(reportPath)) {
      await bot.api.sendDocument(chatId, new InputFile(reportPath), {
        caption: '📊 Relatório interativo da pesquisa'
      }).catch(() => {});
    }
    if (fs.existsSync(briefMdPath)) {
      await bot.api.sendDocument(chatId, new InputFile(briefMdPath), {
        caption: '📋 Research Brief'
      }).catch(() => {});
    }

    const briefPath = path.join(PROJECT_ROOT, outputDir, 'creative', 'creative_brief.md');
    if (fs.existsSync(briefPath)) {
      const brief = fs.readFileSync(briefPath, 'utf-8');
      for (const part of splitMessage(toTelegramHTML(brief))) {
        await ctx.reply(part, { parse_mode: 'HTML' }).catch(() => ctx.reply(part));
      }
    }
    await ctx.reply(
      '<b>Brief criativo pronto — Etapa 1/5 ✅</b>\n\n' +
      'Responda <b>sim</b> para avançar para imagens e copy.\n' +
      '<b>não</b> para cancelar a campanha.\n' +
      'Ou descreva ajustes.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 2) {
    // Show images produced by Ad Creative Designer
    const lines = ['<b>Imagens prontas — Etapa 2/5 ✅</b>\n'];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    // Send generated images
    const imgsDir = path.join(PROJECT_ROOT, outputDir, 'imgs');
    const adsDir = path.join(PROJECT_ROOT, outputDir, 'ads');
    for (const dir of [imgsDir, adsDir]) {
      if (fs.existsSync(dir)) {
        const imgFiles = fs.readdirSync(dir)
          .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f) && !f.includes('approved'))
          .sort();
        for (const f of imgFiles) {
          await bot.api.sendPhoto(chatId, new InputFile(path.join(dir, f)), {
            caption: f,
          }).catch(e => console.error('[stage2 img]', e.message));
        }
      }
    }

    await ctx.reply(
      'Responda <b>sim</b> para avancar para video.\nOu descreva o que ajustar.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 3) {
    // Video done — show storyboard and ask about platforms
    const msg = formatStoryboardMessage(path.join(PROJECT_ROOT, outputDir));
    if (msg) {
      await ctx.reply(msg, { parse_mode: 'HTML' });
    }

    // Show current platform targets and ask if user wants to change
    const currentPlatforms = cv.payload.platform_targets || [];
    const allPlatforms = ['instagram', 'youtube', 'tiktok', 'facebook', 'threads', 'linkedin'];
    const platformLabels = {
      instagram: 'Instagram (carousel + stories + reels)',
      youtube: 'YouTube (video + shorts)',
      tiktok: 'TikTok (video curto)',
      facebook: 'Facebook (feed + stories + reels + video)',
      threads: 'Threads (texto + imagem)',
      linkedin: 'LinkedIn (post profissional)',
    };

    const platformList = allPlatforms.map(p => {
      const active = currentPlatforms.includes(p) ? '✅' : '⬜';
      return `  ${active} <code>${p}</code> — ${platformLabels[p]}`;
    }).join('\n');

    await ctx.reply(
      '<b>Video pronto — Etapa 3/5 ✅</b>\n\n' +
      '<b>Plataformas selecionadas:</b>\n' +
      platformList + '\n\n' +
      'Responda <b>sim</b> para gerar copy para estas plataformas.\n' +
      'Ou liste as plataformas desejadas (ex: <code>instagram,youtube,tiktok</code>).\n' +
      '<b>nao</b> para cancelar.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 4) {
    // Platform copy done — show summaries
    const platformsDir = path.join(PROJECT_ROOT, outputDir, 'platforms');
    const lines = ['<b>Copy de plataforma pronto — Etapa 4/5 ✅</b>\n'];

    if (fs.existsSync(platformsDir)) {
      const mdFiles = fs.readdirSync(platformsDir).filter(f => f.endsWith('.md')).sort();
      for (const f of mdFiles) {
        const content = fs.readFileSync(path.join(platformsDir, f), 'utf-8');
        const preview = content.slice(0, 400);
        const name = f.replace('.md', '').toUpperCase();
        lines.push(`<b>${name}:</b>`);
        lines.push(`<i>${escapeHtml(preview)}${content.length > 400 ? '...' : ''}</i>\n`);
      }
    }

    // Check for rework requests
    if (fs.existsSync(platformsDir)) {
      const jsonFiles = fs.readdirSync(platformsDir).filter(f => f.endsWith('.json'));
      const reworks = [];
      for (const f of jsonFiles) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(platformsDir, f), 'utf-8'));
          if (data.rework_needed) reworks.push(`<b>${f}:</b> ${escapeHtml(data.rework_needed)}`);
        } catch {}
      }
      if (reworks.length > 0) {
        lines.push('<b>⚠️ Retrabalho solicitado:</b>');
        reworks.forEach(r => lines.push(r));
        lines.push('');
      }
    }

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    await ctx.reply(
      'Responda <b>sim</b> para avancar para distribuicao.\nOu descreva ajustes.',
      { parse_mode: 'HTML' }
    );
  } else if (stage === 5) {
    await ctx.reply(
      '<b>Pronto para distribuicao — Etapa 5/5</b>\n\n' +
      'Tudo certo para preparar a publicacao.\n' +
      'Responda <b>sim</b> para gerar o Publish MD.\n<b>nao</b> para cancelar.',
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

  // Stage 3 approval: user can change platform_targets before advancing to stage 4
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

  const prompt = `You are Claude Code working on the ITAGMKT social media automation project at ${PROJECT_ROOT}.

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

  // Support both _scene_plan.json and _scene_plan_motion.json (Video Editor Agent outputs motion directly)
  let planFiles = fs.readdirSync(videoDir)
    .filter(f => f.endsWith('_scene_plan_motion.json'))
    .sort();
  if (planFiles.length === 0) {
    planFiles = fs.readdirSync(videoDir)
      .filter(f => f.endsWith('_scene_plan.json'))
      .sort();
  }

  if (planFiles.length === 0) return null;

  const lines = [`🎬 <b>Roteiro gerado — confirme antes de renderizar</b>\n`];

  for (const file of planFiles) {
    try {
      const plan = JSON.parse(fs.readFileSync(path.join(videoDir, file), 'utf-8'));
      const voiceLabel = { rachel: 'Rachel (emocional)', bella: 'Bella (amigável)', antoni: 'Antoni (profissional)' };
      const sceneCount = (plan.scenes || []).length;
      const totalDur = (plan.scenes || []).reduce((s, c) => s + (c.duration || 0), 0).toFixed(0);
      const pacing = plan.pacing || '';

      lines.push(`<b>${plan.titulo || file}</b>`);
      lines.push(`Voz: ${voiceLabel[plan.voice] || plan.voice || 'padrão'} | ${totalDur}s | ${sceneCount} cortes${pacing ? ` | ${pacing}` : ''}\n`);

      if (plan.narration_script) {
        const preview = plan.narration_script.slice(0, 150);
        lines.push(`<i>"${escapeHtml(preview)}${plan.narration_script.length > 150 ? '...' : ''}"</i>\n`);
      }

      // For plans with many cuts (Video Editor Agent), show by sections
      if (sceneCount > 10 && plan.sections) {
        lines.push(`<b>Seções:</b>`);
        for (const sec of plan.sections) {
          const dur = sec.end_s - sec.start_s;
          lines.push(`  ${sec.name} (${sec.start_s}-${sec.end_s}s): ${sec.cuts} cortes em ${dur}s`);
        }
        // Show first 3 and last 2 cuts as sample
        const scenes = plan.scenes || [];
        lines.push(`\n<b>Amostra de cortes:</b>`);
        const sample = [...scenes.slice(0, 3), null, ...scenes.slice(-2)];
        sample.forEach((s, i) => {
          if (!s) { lines.push(`  ...`); return; }
          const txt = s.text_overlay ? `"${escapeHtml(s.text_overlay)}"` : '(visual)';
          const motion = s.motion?.type || '';
          lines.push(`  #${s.cut_number || '?'}. [${s.type || s.id}] ${txt} — ${s.duration}s ${motion}`);
        });
      } else {
        // Original format for small plans
        lines.push(`<b>Cenas:</b>`);
        (plan.scenes || []).forEach((s, i) => {
          const imgName = s.image ? path.basename(s.image) : '(sem imagem)';
          const crop = s.image_crop_focus ? ` crop:${s.image_crop_focus}` : '';
          lines.push(`  ${i + 1}. [${s.type || s.id}] "<b>${escapeHtml(s.text_overlay || '')}</b>" — ${escapeHtml(imgName)}${crop} | ${s.duration}s`);
        });
      }
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
  if (ctx && typeof ctx.reply === 'function') {
    await ctx.reply(msg, { parse_mode: 'HTML' });
  } else if (ctx && ctx.api) {
    await ctx.api.sendMessage(chatId, msg, { parse_mode: 'HTML' });
  }
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

// (rerun command moved above bot.on message:text)

// ── /aprovar — re-scan pending approvals ─────────────────────────────────────

bot.command('aprovar', async (ctx) => {
  await scanPendingApprovals(ctx.chat.id.toString(), ctx);
});

// ── /arquivar — archive campaign so it doesn't show on startup ───────────────

bot.command('arquivar', async (ctx) => {
  const chatId = String(ctx.chat.id);
  const s = session.get(chatId);
  const raw = ctx.match?.trim();
  if (!raw) {
    return ctx.reply('Use: <code>/arquivar c34</code>', { parse_mode: 'HTML' });
  }

  const campaignFolder = findCampaign(s.projectDir, raw) || (() => {
    const r = findCampaignAcrossProjects(raw);
    return r ? r.campaignFolder : null;
  })();

  if (!campaignFolder) {
    return ctx.reply(`Campanha "${raw}" não encontrada.`);
  }

  const projectDir = findCampaignAcrossProjects(raw)?.projectDir || s.projectDir;
  const campDir = path.resolve(PROJECT_ROOT, projectDir, 'outputs', campaignFolder);
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

  const campaignFolder = findCampaign(s.projectDir, raw) || (() => {
    const r = findCampaignAcrossProjects(raw);
    return r ? r.campaignFolder : null;
  })();

  if (!campaignFolder) {
    return ctx.reply(`Campanha "${raw}" não encontrada.`);
  }

  const projectDir = findCampaignAcrossProjects(raw)?.projectDir || s.projectDir;
  const campDir = path.resolve(PROJECT_ROOT, projectDir, 'outputs', campaignFolder);
  const archivePath = path.join(campDir, 'archived.json');
  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  await ctx.reply(`📂 <b>${campaignFolder}</b> desarquivada.`, { parse_mode: 'HTML' });
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

  const stageMap = { '1': 'stage1', '2': 'stage2', '3': 'stage3', '4': 'stage4', '5': 'stage5' };
  if (target === 'todas' || target === 'all') {
    ['stage1','stage2','stage3','stage4','stage5'].forEach(s => { cv.approvalModes[s] = mode; });
    await ctx.reply(`Todas as etapas definidas como <b>${mode}</b>.`, { parse_mode: 'HTML' });
  } else if (stageMap[target]) {
    cv.approvalModes[stageMap[target]] = mode;
    const stageLabels = { stage1: 'Brief & Narrativa', stage2: 'Imagens', stage3: 'Video', stage4: 'Copy Plataforma', stage5: 'Distribuicao' };
    await ctx.reply(
      `Etapa ${target} (${stageLabels[stageMap[target]]}) definida como <b>${mode}</b>.`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('Etapa invalida. Use 1, 2, 3, 4, 5 ou todas.');
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

// ── Resume in-progress campaigns after restart ──────────────────────────────
async function resumeInProgressCampaigns(monitoredSignals) {
  const prjRoot = path.resolve(PROJECT_ROOT, 'prj');
  if (!fs.existsSync(prjRoot)) return;

  const stageAgentMap = {
    1: ['research_agent', 'creative_director', 'copywriter_agent'],
    2: ['ad_creative_designer'],
    3: ['video_quick', 'video_pro'],
    4: ['platform_instagram', 'platform_youtube', 'platform_tiktok', 'platform_facebook', 'platform_threads', 'platform_linkedin'],
    5: ['distribution_agent'],
  };

  for (const prj of fs.readdirSync(prjRoot)) {
    const outRoot = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outRoot)) continue;

    for (const campaign of fs.readdirSync(outRoot)) {
      const campDir = path.join(outRoot, campaign);
      const payloadPath = path.join(campDir, 'campaign_payload.json');
      const ctxFile = readChatContext(campDir);
      if (!ctxFile?.chatId || !fs.existsSync(payloadPath)) continue;

      // Skip archived campaigns
      if (fs.existsSync(path.join(campDir, 'archived.json'))) continue;

      let payload;
      try { payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8')); } catch { continue; }

      const chatId = ctxFile.chatId;
      const logsDir = path.join(campDir, 'logs');
      if (!fs.existsSync(logsDir)) continue;

      // Determine highest completed stage
      let highestDone = 0;
      let allComplete = true;
      for (let stage = 1; stage <= 5; stage++) {
        let agents = stageAgentMap[stage];
        if (stage === 3) {
          agents = [];
          if (payload.video_quick !== false) agents.push('video_quick');
          if (payload.video_pro === true) agents.push('video_pro');
          if (agents.length === 0) agents = ['video_quick'];
        }
        if (stage === 4) {
          const targets = payload.platform_targets || [];
          agents = stageAgentMap[4].filter(a => targets.includes(a.replace('platform_', '')));
        }

        let stageDone = agents.length > 0;
        for (const a of agents) {
          const logFile = path.join(logsDir, `${a}.log`);
          if (!fs.existsSync(logFile)) { stageDone = false; break; }
          const content = fs.readFileSync(logFile, 'utf-8');
          const tail = content.split('\n').filter(l => l.trim()).slice(-3).join('\n');
          if (!tail.includes('Completed successfully')) { stageDone = false; break; }
        }
        if (stageDone) highestDone = stage;
        else { allComplete = false; break; }
      }

      // Skip fully completed campaigns
      if (allComplete || highestDone === 5) continue;
      // Skip campaigns with no progress
      if (highestDone === 0 && !fs.readdirSync(logsDir).length) continue;

      console.log(`[resume] Campaign ${campaign} — stage ${highestDone} done, resuming from stage ${highestDone + 1}`);

      // Pre-populate monitoredSignals with completed stages so monitor doesn't re-enqueue
      const outputDir = `prj/${prj}/outputs/${campaign}`;
      if (monitoredSignals) {
        for (let doneStage = 1; doneStage <= highestDone; doneStage++) {
          monitoredSignals.add(`stage_done:${outputDir}:${doneStage}`);
        }
      }

      // Notify user only — do NOT auto-resume to avoid enqueue loops
      bot.api.sendMessage(chatId,
        `ℹ️ Campanha <b>${campaign}</b> encontrada (etapa ${highestDone}/5 completa).\n` +
        `Use <code>/continue ${campaign}</code> para retomar.\n` +
        `Ou inicie uma nova campanha normalmente.`,
        { parse_mode: 'HTML' }
      ).catch(() => {});
    }
  }
}

bot.start({
  onStart: async (botInfo) => {
    console.log(`Bot @${botInfo.username} rodando (long-polling)`);
    console.log(`Projeto padrao: ${session.DEFAULT_PROJECT}`);
    console.log('Ctrl+C para parar.\n');

    // Check for existing workers (no longer killing them — they may be valid)
    if (isWorkerRunning()) {
      console.log('Worker already running — will use existing.');
    } else {
      console.log('No worker running — will spawn on demand.');
    }

    // Scan for pending approvals left over from before restart
    await scanPendingApprovals(null, null);

    // Signal tracker — shared between resume and monitor
    const monitoredSignals = new Set();

    // Resume in-progress campaigns and pre-populate monitoredSignals
    await resumeInProgressCampaigns(monitoredSignals);

    // ── Continuous signal monitor ───────────────────────────────────────────
    // Polls for worker signal files every 10s so the bot detects events
    // even when the worker runs as a separate process (not as child process).
    setInterval(async () => {
      // Find all active campaigns with chat context
      const prjRoot = path.resolve(PROJECT_ROOT, 'prj');
      if (!fs.existsSync(prjRoot)) return;

      for (const prj of fs.readdirSync(prjRoot)) {
        const outRoot = path.join(prjRoot, prj, 'outputs');
        if (!fs.existsSync(outRoot)) continue;
        for (const campaign of fs.readdirSync(outRoot)) {
          const campDir = path.join(outRoot, campaign);
          const relDir = `prj/${prj}/outputs/${campaign}`;
          const ctx2 = readChatContext(campDir);
          if (!ctx2?.chatId) continue;
          const chatId = ctx2.chatId;

          // Only process campaigns with active session (runningTask)
          const sess = session.get(chatId);
          const hasActiveSession = sess?.runningTask?.outputDir === relDir;

          // 1. Image generation error — no decision yet (works even without session)
          const imgErrorLog = path.join(campDir, 'logs', 'api_image_gen.log');
          const imgDecision = path.join(campDir, 'imgs', 'error_decision.json');
          const imgErrorKey = `img_error:${relDir}`;
          if (fs.existsSync(imgErrorLog) && !fs.existsSync(imgDecision) && !monitoredSignals.has(imgErrorKey)) {
            const logContent = fs.readFileSync(imgErrorLog, 'utf-8');
            if (logContent.includes('[IMAGE_GEN_ERROR]') && logContent.includes('waiting for user decision')) {
              monitoredSignals.add(imgErrorKey);
              const errorLine = logContent.split('\n').reverse().find(l => l.includes('Failed image')) || 'Todas as imagens falharam';
              const errorMsg = errorLine.replace(/.*Failed image \d+: /, '');
              session.setPendingImageError(chatId, { outputDir: relDir });
              bot.api.sendMessage(chatId,
                `⚠️ <b>Erro na geração de imagens</b>\n\n<code>${errorMsg}</code>\n\n` +
                `O que deseja fazer?\n` +
                `• <b>avançar</b> — continuar sem imagens (CSS)\n` +
                `• <b>tentar novamente</b> — repetir a geração\n` +
                `• <b>outra fonte</b> — trocar: api, free, brand, pasta xxx\n` +
                `• <b>cancelar</b> — cancelar a campanha`,
                { parse_mode: 'HTML' }
              ).catch(e => console.error('[monitor] img error send failed:', e.message));
            }
          }
          // Clear signal if decision was made
          if (fs.existsSync(imgDecision) && monitoredSignals.has(imgErrorKey)) {
            monitoredSignals.delete(imgErrorKey);
          }

          // 2. Video approval needed
          const videoSignal = path.join(campDir, 'video', 'approval_needed.json');
          const videoApproved = path.join(campDir, 'video', 'approved.json');
          const videoRejected = path.join(campDir, 'video', 'rejected.json');
          const videoKey = `video_approval:${relDir}`;
          if (fs.existsSync(videoSignal) && !fs.existsSync(videoApproved) && !fs.existsSync(videoRejected) && !monitoredSignals.has(videoKey)) {
            monitoredSignals.add(videoKey);
            session.setPendingVideoApproval(chatId, { outputDir: relDir, type: 'video' });
            sendVideoApprovalRequest(bot, chatId, relDir).catch(e =>
              console.error('[monitor] video approval send failed:', e.message)
            );
          }
          if ((fs.existsSync(videoApproved) || fs.existsSync(videoRejected)) && monitoredSignals.has(videoKey)) {
            monitoredSignals.delete(videoKey);
          }

          // 3. Image approval needed
          const imgApprovalSignal = path.join(campDir, 'imgs', 'approval_needed.json');
          const imgApproved = path.join(campDir, 'imgs', 'approved.json');
          const imgRejected = path.join(campDir, 'imgs', 'rejected.json');
          const imgApprovalKey = `img_approval:${relDir}`;
          if (fs.existsSync(imgApprovalSignal) && !fs.existsSync(imgApproved) && !fs.existsSync(imgRejected) && !monitoredSignals.has(imgApprovalKey)) {
            monitoredSignals.add(imgApprovalKey);
            session.setPendingVideoApproval(chatId, { outputDir: relDir, type: 'images' });
            sendImageApprovalRequest(bot, chatId, relDir).catch(e =>
              console.error('[monitor] img approval send failed:', e.message)
            );
          }
          if ((fs.existsSync(imgApproved) || fs.existsSync(imgRejected)) && monitoredSignals.has(imgApprovalKey)) {
            monitoredSignals.delete(imgApprovalKey);
          }

          // 3.5 Phase-level notifications — notify user when each video phase starts
          if (hasActiveSession && sess?.campaignV3?.notifications !== false) {
            const logsDir2 = path.join(campDir, 'logs');
            const phaseNotifs = [
              { file: 'video_pro.log', phases: [
                { key: 'Generating narration', msg: '🎙️ Gerando narração...' },
                { key: 'Photography Director', msg: '📷 Diretor de Fotografia analisando...' },
                { key: 'Creating scene plan', msg: '🎬 Criando plano de cenas...' },
                { key: 'Typography validation', msg: '🔤 Validando tipografia...' },
                { key: 'Starting video render', msg: '🎥 Renderizando vídeo Pro...' },
              ]},
              { file: 'video_quick.log', phases: [
                { key: 'Starting video render', msg: '🎥 Renderizando vídeo Quick...' },
                { key: 'render_start', msg: '🎥 Renderizando vídeo Quick...' },
              ]},
              { file: 'ad_creative_designer.log', phases: [
                { key: 'Generating image', msg: '🖼️ Gerando imagens...' },
                { key: 'Rendering HTML', msg: '🎨 Montando criativos...' },
              ]},
            ];
            for (const pn of phaseNotifs) {
              const logFile = path.join(logsDir2, pn.file);
              if (!fs.existsSync(logFile)) continue;
              const logContent = fs.readFileSync(logFile, 'utf-8');
              for (const phase of pn.phases) {
                const phaseKey = `phase:${relDir}:${pn.file}:${phase.key}`;
                if (monitoredSignals.has(phaseKey)) continue;
                if (logContent.includes(phase.key)) {
                  monitoredSignals.add(phaseKey);
                  bot.api.sendMessage(chatId, phase.msg).catch(() => {});
                }
              }
            }
          }

          // 4. Stage completion tracking — ONLY for campaigns with active session matching this output
          if (!hasActiveSession) continue;
          const cv = sess?.campaignV3;
          if (cv) {
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

              // Determine which agents are active for this stage
              let activeAgents = agents;
              if (num === 3) {
                const vq = cv.payload?.video_quick !== false;
                const vp = cv.payload?.video_pro === true;
                activeAgents = [];
                if (vq) activeAgents.push('video_quick');
                if (vp) activeAgents.push('video_pro');
                if (activeAgents.length === 0) activeAgents = ['video_quick'];
              }
              if (num === 4) {
                const targets = cv.payload?.platform_targets || [];
                activeAgents = agents.filter(a => targets.includes(a.replace('platform_', '')));
              }

              // Check if all active agents completed
              let allDone = activeAgents.length > 0;
              let anyStarted = false;
              for (const a of activeAgents) {
                const logFile = path.join(logsDir, `${a}.log`);
                if (!fs.existsSync(logFile)) { allDone = false; continue; }
                anyStarted = true;
                const content = fs.readFileSync(logFile, 'utf-8');
                // Check LAST 3 lines for completion (avoids false positives from old runs)
                const tail = content.split('\n').filter(l => l.trim()).slice(-3).join('\n');
                if (!tail.includes('Completed successfully')) allDone = false;
              }

              if (allDone && anyStarted) {
                monitoredSignals.add(stageKey);
                console.log(`[monitor] Stage ${num} completed for ${relDir}`);

                // Notify
                if (cv.notifications !== false) {
                  const stageNames = { 1: 'Brief & Narrativa', 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuição' };
                  bot.api.sendMessage(chatId, `✅ Etapa ${num} concluída — ${stageNames[num]}`, { parse_mode: 'HTML' }).catch(() => {});
                }

                // Ensure strict sequential ordering — all previous stages must be done
                let canAdvance = true;
                for (let prevStage = 1; prevStage < num; prevStage++) {
                  const prevKey = `stage_done:${relDir}:${prevStage}`;
                  if (!monitoredSignals.has(prevKey)) { canAdvance = false; break; }
                }
                if (!canAdvance) continue;

                // Send key deliverables even in auto mode
                if (cv.notifications !== false) {
                  if (num === 1) {
                    // Stage 1: send research report
                    const reportPath = path.join(campDir, 'interactive_report.html');
                    const briefMdPath = path.join(campDir, 'research_brief.md');
                    if (fs.existsSync(reportPath)) {
                      bot.api.sendDocument(chatId, new InputFile(reportPath), {
                        caption: '📊 Relatório interativo da pesquisa'
                      }).catch(() => {});
                    }
                    if (fs.existsSync(briefMdPath)) {
                      bot.api.sendDocument(chatId, new InputFile(briefMdPath), {
                        caption: '📋 Research Brief'
                      }).catch(() => {});
                    }
                  }
                  if (num === 3) {
                    // Stage 3: send rendered videos as downloadable files
                    const videoDir = path.join(campDir, 'video');
                    if (fs.existsSync(videoDir)) {
                      for (const f of fs.readdirSync(videoDir)) {
                        if (f.endsWith('.mp4') && !f.includes('draft')) {
                          const videoPath = path.join(videoDir, f);
                          const sizeMB = fs.statSync(videoPath).size / (1024 * 1024);
                          if (sizeMB > 50) {
                            // Too large for Telegram — send path info
                            bot.api.sendMessage(chatId, `🎬 <b>${f}</b> (${sizeMB.toFixed(1)}MB — muito grande para Telegram)\nUse <code>/enviar ${path.basename(path.dirname(campDir))} videos</code>`, { parse_mode: 'HTML' }).catch(() => {});
                          } else {
                            // Send as video (streamable) with fallback to document
                            bot.api.sendVideo(chatId, new InputFile(videoPath), {
                              caption: `🎬 ${f} (${sizeMB.toFixed(1)}MB)`,
                              supports_streaming: true,
                            }).catch(() => {
                              // Fallback: send as document (always works, downloadable)
                              bot.api.sendDocument(chatId, new InputFile(videoPath), {
                                caption: `🎬 ${f} (${sizeMB.toFixed(1)}MB)`,
                              }).catch(() => {});
                            });
                          }
                        }
                      }
                    }
                  }
                }

                // Auto-advance: enqueue next stage if approval mode is auto
                const approvalMode = cv.payload?.approval_modes?.[`stage${num}`] || 'auto';
                if (approvalMode === 'auto' && num < 5) {
                  const nextStage = num + 1;
                  const nextStageKey = `stage${nextStage}`;
                  const nextAgents = STAGES[nextStageKey];
                  if (nextAgents) {
                    console.log(`[monitor] Auto-advancing to stage ${nextStage}`);
                    session.setCampaignV3Stage(chatId, nextStage);
                    _enqueueStage(cv.payload, nextAgents)
                      .then(() => {
                        const stageNames = { 2: 'Imagens', 3: 'Video', 4: 'Plataformas', 5: 'Distribuição' };
                        if (cv.notifications !== false) {
                          bot.api.sendMessage(chatId, `▶️ Etapa ${nextStage} iniciando — ${stageNames[nextStage]}`, { parse_mode: 'HTML' }).catch(() => {});
                        }
                      })
                      .catch(e => console.error(`[monitor] Failed to enqueue stage ${nextStage}:`, e.message));
                  }
                }

                // Stage 5 complete — campaign done
                if (num === 5) {
                  const taskName = sess.runningTask?.taskName || campaign;
                  session.clearRunningTask(chatId);
                  session.clearCampaignV3(chatId);
                  bot.api.sendMessage(chatId, `🎉 Campanha <b>${taskName}</b> concluída!`, { parse_mode: 'HTML' }).catch(() => {});
                }
              }
            }
          }
        }
      }
    }, 10000); // every 10 seconds
  },
});
