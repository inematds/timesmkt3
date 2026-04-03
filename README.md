# timesmkt3 v4.3

**timesmkt3** — sistema de automacao de conteudo para marketing digital usando agentes de IA coordenados por um bot Telegram.

O sistema pesquisa, cria narrativa, gera imagens, produz videos, adapta copy para cada plataforma e publica — tudo automatizado com aprovacoes humanas em cada etapa.

> Documentacao tecnica completa em [`CLAUDE.md`](CLAUDE.md)
> Fluxo detalhado em [`doc/fluxo-pipeline-v4.md`](doc/fluxo-pipeline-v4.md)

---

## Pipeline — 5 Estagios

```
┌─────────────────────────────────────────────────────────┐
│  STAGE 1 — Brief & Narrativa                           │
│  Research Agent (Tavily)                                │
│  Creative Director → creative_brief.json                │
│  Copywriter → narrative.json                            │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 2 — Imagens                                      │
│  Se fonte=api: gera imagens (KIE/Pollinations)          │
│  Ad Creative Designer (Claude + Playwright)             │
│  → ads/*.png (carousel + stories)                       │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 3 — Video                                        │
│  Quick: slideshow 10-20s (sempre roda)                  │
│  Pro: 30-70s cinematografico (sob demanda)              │
│    Narracao → Photography Dir → Scene Plan → Render     │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 4 — Plataformas                                  │
│  Instagram/YouTube/TikTok/Facebook/Threads/LinkedIn     │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 5 — Distribuicao                                 │
│  Upload Supabase → Publish MD → Posting                 │
│  [APROVACAO FINAL]                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Agentes

| # | Agente | Funcao | Stage |
|---|---|---|---|
| 1 | Research Agent | Pesquisa tendencias, concorrentes, audiencia via Tavily | 1 |
| 2 | Diretor Criativo | Define angulo estrategico + direcao visual | 1 |
| 3 | Copywriter | Cria narrativa central da campanha | 1 |
| 4 | Ad Creative Designer | Cria imagens estaticas (HTML -> PNG via Playwright) | 2 |
| 5 | Video Quick | Slideshow rapido com imagens do Designer (10-20s) | 3 |
| 6 | Video Pro | Producao profissional: rascunho -> aprovacao -> final (30-60s) | 3 |
| 7 | Instagram Agent | Carousel + stories + reels + captions | 4 |
| 8 | YouTube Agent | Titulo SEO + descricao + tags + shorts | 4 |
| 9 | TikTok Agent | Video curto 9:16 + caption + hook 2s | 4 |
| 10 | Facebook Agent | Feed + stories + reels + video 16:9 | 4 |
| 11 | Threads Agent | Posts conversacionais (max 500 chars) | 4 |
| 12 | LinkedIn Agent | Post profissional + carousel PDF | 4 |
| 13 | Distribution Agent | Guardar + agendar + publicar | 5 |

---

## Como Funciona

| Componente | Papel |
|---|---|
| **Bot Telegram** (`telegram/bot.js`) | Controlador — recebe instrucoes, gerencia aprovacoes, avanca etapas |
| **Orchestrator** (`pipeline/orchestrator.js`) | Enfileira jobs no BullMQ por etapa |
| **Worker** (`pipeline/worker.js`) | Executa agentes via Claude CLI |
| **Agentes** | Especialistas — cada um le seu SKILL.md + knowledge files |
| **Agente Revisor** | Aprovador automatico (modo "agente") |

Cada agente roda como subprocess Claude (`claude -p <prompt> --dangerously-skip-permissions`). O bot spawna o worker, escuta sinais no stdout e avanca o pipeline.

---

## Modos de Aprovacao

Cada etapa pode ter um modo independente:

| Modo | Comportamento |
|---|---|
| `humano` | Pausa e espera resposta no Telegram **(padrao)** |
| `agente` | Agente Revisor avalia e decide automaticamente |
| `auto` | Avanca sem interacao |

```
Pipeline rapido      -> todas "auto", notificacoes: false
Pipeline monitorado  -> todas "agente", notificacoes: true
Distribuicao segura  -> stages 1-4 "auto", stage 5 "humano"
```

Configurar via `/modos <etapa> <modo>` no Telegram ou no payload.

---

## Fontes de Imagem

| Valor | Alias | Comportamento |
|---|---|---|
| `api` | — | Provider de IA do .env (IMAGE_PROVIDER) ou do payload |
| `free` | `gratis` | Banco de imagens gratis (FREE_IMAGE_PROVIDER: pexels, unsplash, pixabay) |
| `brand` | `marca` | Imagens de assets/ e imgs/ do projeto |
| `folder` | `pasta` | Pasta especifica via image_folder no payload |

Classificacao automatica:
- **banner** — imagem com texto/logo (nunca recorta, so letterbox)
- **clip** — arquivo de video (usa direto como fonte)
- **raw** — foto limpa (aplica Ken Burns: zoom, pan, drift)

---

## Video Quick vs Pro

| | Quick (default) | Pro (sob demanda) |
|---|---|---|
| Relacao | Independentes — podem rodar juntos na mesma campanha | Independentes — podem rodar juntos na mesma campanha |
| Trigger | Sempre roda (skip_video para pular) | `video_mode: 'pro'` no payload |
| Duracao | 10-20s | 30-60s |
| Imagens | Usa PNGs do Designer (ads/) | Usa imgs/ (raw API) e assets/ (marca) — nunca ads/ |
| Narracao | Opcional | Obrigatoria |
| Musica | Opcional | Sim |
| Fluxo | Direto | Rascunho -> aprovacao -> final |
| Texto | Topo ou centro (nunca em baixo) | Topo ou centro (nunca em baixo) |

---

## Toggle Simples / Premium

Dois agentes suportam modo simples (rapido) e premium (qualidade maxima):

| Agente | Simples (default) | Premium |
|---|---|---|
| Photography Director | Sonnet + arquivos injetados (~1-2min) | Opus + le 8 arquivos (~5-8min) |
| Scene Plan | Sonnet + photo plan injetado (~1-2min) | Opus + prompt extenso completo (~5-8min) |

Comandos no briefing:
- `foto simples` / `foto premium` — controla o Photography Director
- `videoplan simples` / `videoplan premium` — controla o Scene Plan

---

## Plataformas

Agentes de plataforma (Stage 4) adaptam a narrativa para cada rede. So rodam as plataformas em `platform_targets`.

| Plataforma | Imagem | Video | Texto |
|---|---|---|---|
| Instagram | carousel 1:1 + stories 9:16 | reels 9:16 | caption + hashtags |
| YouTube | thumbnail 16:9 | video 16:9 + shorts 9:16 | titulo + descricao + tags |
| TikTok | — | video 9:16 | caption curto |
| Facebook | feed 1:1/16:9 + stories 9:16 | video 16:9 + reels 9:16 | post longo |
| Threads | opcional | — | post 500 chars |
| LinkedIn | 1200x627 | — | post profissional |

Cada agente pode pedir retrabalho (`rework_needed`, `video_format_request`) se o formato visual nao atende.

---

## Distribuicao (Stage 5)

O Distribution Agent tem 3 responsabilidades:

1. **Guardar** — upload midia para Supabase, gera `media_urls.json`
2. **Agendar** — monta calendario unificado, gera Publish MD
3. **Publicar** — detecta APIs no .env, publica ou marca como manual

A publicacao so executa quando o usuario referencia o Publish MD pelo nome.

| Plataforma | API | Status |
|---|---|---|
| Instagram | Graph API | Implementado |
| YouTube | Data API (OAuth) | Implementado |
| Threads | graph.threads.net | Implementado |
| Facebook | Graph API | Placeholder |
| TikTok | Content Posting API | Placeholder |
| LinkedIn | Marketing API | Placeholder |

---

## Providers de Midia

O sistema escolhe automaticamente baseado nas API keys configuradas.

### Imagens

| Provider | Custo | Tipo |
|---|---|---|
| **Kie.ai Z-Image** | ~$0.004/img | Geracao por IA (padrao) |
| **Pollinations.ai** | Gratis | Geracao por IA (FLUX Schnell) |
| DALL-E 3 | ~$0.04/img | Geracao por IA |
| Stability AI | ~$0.003/img | Geracao por IA |
| **Pexels** | Gratis | Fotos stock |
| Unsplash | Gratis | Fotos stock |
| Pixabay | Gratis | Fotos + audio + musica |

### Narracao (TTS)

| Provider | Custo | Qualidade |
|---|---|---|
| **ElevenLabs** | $0.30/1k chars | Excelente |
| OpenAI TTS | $0.015/1k chars | Alta |
| MiniMax | ~$0.01/1k chars | Alta |
| **Piper (local)** | Gratis | Boa |

#### Vozes ElevenLabs (default: rachel)

| Voz | Estilo | Uso recomendado |
|---|---|---|
| `rachel` | Calorosa, emocional (F) | Campanhas emocionais, storytelling **(padrao)** |
| `bella` | Amigavel, clara (F) | Produto, tutorial |
| `domi` | Forte, confiante (F) | Empoderamento, lancamentos |
| `antoni` | Profissional (M) | Corporativo, B2B |
| `josh` | Profundo, quente (M) | Luxo, premium |
| `arnold` | Energetico, ousado (M) | Promocoes, urgencia |

### Selecao automatica

```
Imagem -> Kie.ai -> Pollinations -> DALL-E -> Pexels (fallback gratis)
Voz    -> ElevenLabs -> OpenAI TTS -> MiniMax -> Piper (fallback local)
Musica -> Pixabay (gratis) ou Suno/ElevenLabs (pago)
```

Verificar: `npm run media:status`

---

## Efeitos de Video

### Camera

| Efeito | Uso automatico |
|---|---|
| `push-in` | Hooks, impacto |
| `pull-out` | Revelacoes |
| `ken-burns-in` / `out` | Produto, flashbacks |
| `pan-left` / `right` / `up` / `down` | Narrativa |
| `drift` | Emocional |
| `parallax-zoom` | Dinamico |
| `breathe` | CTAs |

### Texto

| Animacao | Uso automatico |
|---|---|
| `blur-in` | Hooks |
| `slide-up` / `down` | Produto |
| `per-word` | Conexao |
| `punch-in` | Reveals |
| `typewriter` | Flashbacks |
| `bounce-in` | CTAs |

---

## Regras de Texto sobre Imagens

1. **Analisar a imagem antes** de posicionar texto
2. **Nunca cobrir rostos** — texto so em areas livres
3. **Texto deve caber no frame** — padding 40px, overflow hidden
4. **Gradientes localizados** — so na zona do texto, opacidade 0.4-0.7

| Imagem com... | Onde colocar texto |
|---|---|
| Pessoas no centro | Rodape ou topo |
| Pessoas na esquerda | Direita |
| Produto no centro | Topo ou rodape |
| Texto ja na imagem | Nao duplicar |

---

## Supabase

Usado **apenas como Storage** para hospedar midia das campanhas. Sem tabelas no banco.

```
Upload (ads/*.png + video/*.mp4) -> Supabase Storage -> media_urls.json -> APIs de publicacao
```

Configuracao:
1. Criar bucket `campaign-uploads` marcado como publico
2. No `.env`: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`

---

## Estrutura do Projeto

```
timesmkt3/
├── prj/                             # Projetos (um por cliente/marca)
│   └── <projeto>/
│       ├── assets/                  # Fotos e midia da marca
│       ├── imgs/                    # Imagens de campanha
│       │   └── banners/             # Banners (nunca recortados)
│       ├── knowledge/               # brand_identity.md, product_campaign.md, platform_guidelines.md
│       └── outputs/
│           └── <campanha>/
│               ├── creative/        # creative_brief.json/.md
│               ├── copy/            # narrative.json/.md
│               ├── ads/             # layout.json, HTMLs, PNGs
│               ├── video/           # scene plans, MP4s
│               ├── platforms/       # instagram.json, youtube.json, etc.
│               ├── audio/           # narracoes geradas
│               ├── imgs/            # imagens geradas via API
│               ├── logs/            # log por agente
│               ├── media_urls.json  # URLs publicas do Supabase
│               └── Publish *.md     # guia de publicacao
│
├── pipeline/
│   ├── orchestrator.js              # Enfileira jobs no BullMQ (5 stages)
│   ├── worker.js                    # Executa agentes via Claude CLI
│   ├── render-video-ffmpeg.js       # Renderiza video com ffmpeg
│   ├── render-video.js              # Renderiza video com Remotion (qualidade profissional)
│   ├── generate-image-kie.js        # Geracao de imagens via KIE API
│   ├── generate-image-pollinations.js # Geracao de imagens via Pollinations
│   ├── generate-audio.js            # Narracao via ElevenLabs
│   ├── supabase-upload.js           # Upload para Supabase Storage
│   ├── publish_now.js               # Publicacao generica em todas as plataformas
│   ├── queues.js / redis.js         # Configuracao BullMQ + Redis
│   └── payloads/                    # JSONs de campanha de exemplo
│
├── telegram/
│   ├── bot.js                       # Comandos, fluxo, aprovacoes
│   ├── session.js                   # Sessao por chat
│   ├── formatter.js                 # Formatacao de mensagens
│   ├── media.js                     # Envio de midia
│   └── config.js                    # Configuracao
│
├── skills/                          # Specs dos agentes (SKILL.md cada)
├── media/                           # Modulo multi-provider
├── remotion-ad/                     # Projeto Remotion
├── doc/                             # Documentacao
├── .env.example                     # Template de variaveis
└── CLAUDE.md                        # Documentacao tecnica da arquitetura
```

---

## Comandos do Bot

| Comando | Funcao |
|---|---|
| `/campanha <nome>` | Inicia pipeline completo |
| `/projetos` | Lista projetos |
| `/projeto <nome>` | Seleciona projeto ativo |
| `/status` | Status do pipeline com fases detalhadas |
| `/outputs` | Lista campanhas geradas |
| `/relatorio <campanha>` | Resumo + inventario de arquivos |
| `/enviar <campanha> [tipo]` | Recebe arquivos (imagens, videos, audio, copy, tudo) |
| `/modos [etapa] [humano\|agente\|auto]` | Configura modos de aprovacao |
| `/rerun <campanha> [stage]` | Reprocessa stages (mostra config antes de rodar) |
| `/aprovar` | Re-verifica aprovacoes pendentes |

### Painel de Briefing

Ao iniciar campanha, o bot mostra tabela de config:

```
Config       Atual         Opcoes
──────────── ───────────── ─────────────
  Fonte imgs brand          brand / api / free / screenshot
  Provider   KIE            kie / pollinations
  Modelo     Z-Image        z-image / flux / flux-2 / seedream
  Quick      sim            sim / sem quick
  Pro        nao            pro
  Narrador   rachel         rachel / bella / domi / antoni / josh / arnold
  Duracao    60s            30 / 60
  Estilo     inema_hightech inema_hightech / 01_hero_film
  Dir.Foto   simples        simples / premium
  Scene plan simples        simples / premium
  Fundo quick escuro        escuro / blur
  Idioma     pt-BR          pt-BR / en
  Aprovacao  humano         humano / auto
  Notif      on             on / off
```

Digite o comando para alterar (ex: `pro`, `narrador bella`, `modelo flux`). `sim` para rodar, `nao` para cancelar.

### /rerun — Reprocessar Etapas

```bash
/rerun c0038 3 pro              # refazer video pro
/rerun c0038 2 api              # refazer imagens com API
/rerun c0038 3 pro cleanplan    # limpar planos e refazer
/rerun c0038 3 pro cleanall     # limpar tudo (plan+img+audio)
```

Flags: `cleanplan`, `cleanimg`, `cleanaudio`, `cleanall`

---

## Comecando do Zero

### 1. Instalar

```bash
npm install
cd remotion-ad && npm install && cd ..
npx playwright install chromium
```

### 2. Redis

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### 3. Configurar .env

```bash
cp .env.example .env
```

Minimo:
```
TAVILY_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Recomendados:
```
IMAGE_PROVIDER=kie         # ou pollinations (gratis)
KIE_API_KEY=               # se IMAGE_PROVIDER=kie
PEXELS_API_KEY=            # fotos stock gratis
ELEVENLABS_API_KEY=        # narracao de video
```

Publicacao:
```
INSTAGRAM_ACCOUNT_ID=
INSTAGRAM_ACCESS_TOKEN=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
THREADS_USER_ID=
THREADS_ACCESS_TOKEN=
```

### 4. Rodar o bot (PM2)

```bash
# Iniciar via ecosystem
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# Reiniciar (apos alterar bot.js ou worker.js)
pm2 restart ecosystem.config.cjs

# Ver status / logs
pm2 list
pm2 logs timesmkt3-bot --lines 30
pm2 logs timesmkt3-worker --lines 30

# Limpar tudo
pm2 delete all
```

Depois no Telegram: `/campanha minha_campanha`

Deploy de VPS mais direto em [deploy/DEPLOY.md](./deploy/DEPLOY.md).

### 5. Teste Guiado No Telegram

Teste simples do fluxo com fallback de pesquisa:

```text
/campanha teste_local --platforms instagram --images 2 --videos 0 --img-source brand --skip-research
```

Quando o bot enviar a confirmação, responder:

```text
sim
```

Validar:
- stage 1 avança mesmo com `skip_research`
- o sistema gera `research_results.json` e `creative_brief.json` simulados
- a campanha segue para imagens sem travar no monitor

Teste mais forte para validar múltiplos skips:

```text
/campanha teste_skips --platforms instagram,threads --images 2 --videos 1 --skip-research --skip-image
```

Validar:
- stage 1 não trava
- stage 2 gera fallback de `skip_image`
- `video_quick` não roda sem `ads` reais
- plataformas continuam com os artefatos simulados

Para acompanhar localmente:

```bash
npx pm2 logs timesmkt3-bot --lines 100
npx pm2 logs timesmkt3-worker --lines 100
```

### 5.1 Timeout de aprovacao e retomada

Quando uma etapa exige aprovacao e a resposta nao chega dentro do prazo:

- a tentativa atual da etapa expira
- o job antigo nao e reativado por aprovacao tardia
- o fluxo nao fica preso esperando indefinidamente

Se a aprovacao chegar depois do timeout, o bot informa que ela expirou e que o fluxo ja seguiu adiante.

Para retomar depois:

```text
/continue c0042
```

Ou para refazer uma etapa especifica:

```text
/rerun c0042 video quick
```

### 6. Rodar pipeline manualmente

```bash
# Enfileirar com payload
node pipeline/orchestrator.js --file pipeline/payloads/coldbrew_demo.json
```

### 7. Publicar manualmente

```bash
# Dry run (sem publicar de verdade)
node pipeline/publish_now.js prj/inema/outputs/pascoa_2026-04-20 --dry-run

# Publicar
node pipeline/publish_now.js prj/inema/outputs/pascoa_2026-04-20
```

### 7. Ver providers ativos

```bash
npm run media:status
```

---

## Problemas Comuns

| Problema | Solucao |
|---|---|
| `npm install` falha | Instalar Node.js v18+ |
| Playwright nao renderiza | `npx playwright install chromium` |
| Redis nao conecta | `docker run -d --name redis -p 6379:6379 redis:alpine` |
| Remotion falha | `cd remotion-ad && npm install` |
| ElevenLabs 401 | Verificar key e permissoes em elevenlabs.io |
| Video sai igual ao template | Passar scene_plan.json como argumento no render-video.js |
| Texto sobre rosto | Seguir regras de posicionamento (analisar imagem antes) |
| Instagram token expirado | Renovar a cada 60 dias |
| Aprovacao expirou | Retomar com `/continue CAMPANHA` ou `/rerun CAMPANHA ETAPA` |

---

## Documentacao

| Documento | Conteudo |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Arquitetura tecnica completa |
| [doc/resumo-projeto.md](doc/resumo-projeto.md) | Resumo do projeto |
| [doc/pipeline-aprovacoes.md](doc/pipeline-aprovacoes.md) | Pipeline e fluxo de aprovacoes |
| [doc/agentes-criacao.md](doc/agentes-criacao.md) | Agentes de criacao (stages 1-3) |
| [doc/agentes-distribuicao.md](doc/agentes-distribuicao.md) | Agentes de plataforma e distribuicao (stages 4-5) |
| [skills/video-art-direction/SKILL.md](skills/video-art-direction/SKILL.md) | Video Art Direction — 12 presets de estilo visual |
