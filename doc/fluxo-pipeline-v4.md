# Fluxo do Pipeline — timesmkt3 v4.3

## Entrada

Usuario envia campanha via **Telegram Bot** (`/campanha`, texto livre, ou briefing configurado). Bot parseia, mostra painel de config com tabela Config/Atual/Opcoes, aguarda `sim`.

## Pipeline — 5 Stages

```
┌─────────────────────────────────────────────────────────┐
│  STAGE 1 — Brief & Narrativa                           │
│                                                         │
│  Research Agent (Tavily)                                │
│    → research_results.json + interactive_report.html    │
│  Creative Director (Claude)                             │
│    → creative_brief.json (angulo + carousel_structure)  │
│  Copywriter (Claude)                                    │
│    → narrative.json (headlines, CTAs, carousel_texts)   │
│                                                         │
│  [APROVACAO] humano/auto/agente                         │
├─────────────────────────────────────────────────────────┤
│  STAGE 2 — Imagens                                      │
│                                                         │
│  Se fonte=api: gera imagens (KIE/Pollinations)          │
│    → imgs/*.jpg (5 prompts unicos por slide)            │
│  Ad Creative Designer (Claude + Playwright)             │
│    → ads/*.html + ads/*.png (carousel + stories)        │
│                                                         │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 3 — Video                                        │
│                                                         │
│  Video Quick (sempre roda):                             │
│    → slideshow 10-20s com imagens do ads/               │
│    → texto magazine Lora no topo, sync com narracao     │
│    → render ffmpeg                                      │
│                                                         │
│  Video Pro (quando pedido):                             │
│    Phase 1: Narracao (ElevenLabs)                       │
│    Phase 1.5: Timing do audio (ffprobe)                 │
│    Phase 1.6: Photography Director                      │
│      → photography_plan.json (face_position, framing)   │
│    Phase 2: Scene Plan (Sonnet/Opus)                    │
│      → scene_plan_motion.json (25-40 cortes)            │
│      → video_length = audio + 3s                        │
│      → texto evita rostos (face_position)               │
│    Phase 2b: Auto-fix (duracao, carousel ban, ratio)    │
│    Phase 2.5: Typography validation (font min 80px)     │
│    Phase 3: Render (Remotion → fallback ffmpeg)         │
│                                                         │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 4 — Plataformas                                  │
│                                                         │
│  6 agentes (so os selecionados):                        │
│  Instagram / YouTube / TikTok / Facebook / Threads /    │
│  LinkedIn → copy nativo por plataforma                  │
│                                                         │
│  [APROVACAO]                                            │
├─────────────────────────────────────────────────────────┤
│  STAGE 5 — Distribuicao                                 │
│                                                         │
│  Upload Supabase → media_urls.json                      │
│  Publish MD → advisory com scheduling                   │
│  Posting (Instagram/YouTube/Threads) quando autorizado  │
│                                                         │
│  [APROVACAO FINAL]                                      │
└─────────────────────────────────────────────────────────┘
```

## Infraestrutura

| Componente | Funcao |
|---|---|
| **Bot** (`telegram/bot.js`) | Controlador — avanca stages, aprovacao, /rerun, /status |
| **Orchestrator** (`pipeline/orchestrator.js`) | Enfileira jobs no BullMQ |
| **Worker** (`pipeline/worker.js`) | Executa agentes via `claude -p`, emite signals |
| **Monitor** (dentro do bot) | Poll de logs a cada 5s, detecta completion, envia notificacoes de fase |
| **Session** (`telegram/session.js`) | Persistente em disco (.sessions.json) — sobrevive restarts |
| **Redis** (Docker local) | BullMQ queue, auto-restart |
| **PM2** | Bot + Worker, `npx pm2 restart all` |

## Regras Visuais (Video Pro)

- Fonte **Lora** (magazine editorial), Oswald so hooks
- Texto **top** default, **center** quando face no topo
- Nunca **bottom** (UI mobile cobre)
- Fotos: crop livre. Banners/has_text: nunca cortar
- Carrossel **proibido** no pro (exceto `carousel_in_video: true`)
- Film grain e light leak **desativados**
- Multiplos videos/carrosseis: conteudo sempre distinto

## PM2 — Bot e Worker

```bash
# Iniciar
npx pm2 start telegram/bot.js --name bot
npx pm2 start pipeline/worker.js --name worker

# Reiniciar (apos alterar bot.js ou worker.js)
npx pm2 restart bot
npx pm2 restart worker

# Ver status / logs
npx pm2 list
npx pm2 logs bot --lines 30
npx pm2 logs worker --lines 30

# Limpar tudo (se houver conflito ou processos fantasma)
npx pm2 delete all
```

Antes de iniciar, rodar `npx pm2 list` para verificar se ja existem processos. Se existir, usar `restart` em vez de `start`.

## Redis (Docker)

Container configurado com `--restart unless-stopped` — reinicia automaticamente apos reboot.

```bash
docker start redis              # iniciar Redis
docker ps | grep redis          # verificar se esta rodando
```

Se o bot/worker der `ECONNREFUSED 6379`, o Redis parou.

## Painel de Briefing

O painel mostra uma tabela estruturada com todas as configs:

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
  Estilo     inema_hightech inema_hightech / 01_hero_film / ...
  Dir.Foto   simples        simples / premium
  Scene plan simples        simples / premium
  Fundo quick escuro        escuro / blur
  Idioma     pt-BR          pt-BR / en
  Aprovacao  humano         humano / auto
  Notif      on             on / off
```

`•` indica valores alterados do default.

## /rerun

Reprocessa stages de campanhas existentes. Mostra config completa antes de executar.

```
/rerun c0038 3 pro cleanplan
```

Flags de limpeza: `cleanplan`, `cleanimg`, `cleanaudio`, `cleanall`
