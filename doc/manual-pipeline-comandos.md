# Manual — Pipeline, Comandos e Configuracao

## Comandos do Bot Telegram

### /nova — Criar campanha

Exemplo de conversa:
```
Usuario: /nova
Bot: Descreva a campanha...
Usuario: Campanha de Pascoa para o clube INEMA, imagens da marca, video pro
Bot: [monta payload e inicia pipeline]
```

O bot interpreta linguagem natural e extrai:
- Nome da campanha (task_name)
- Fonte de imagem (brand/free/api/folder)
- Modo de video (quick/pro/both)
- Plataformas (default: todas as 6)
- Idioma (pt-BR por default)

### /rerun — Reprocessar etapas

```
/rerun <campanha> <etapas>
```

Exemplos:
```
/rerun c13 video pro        → reprocessa Video Pro da campanha 13
/rerun c12 imagens           → re-gera imagens da campanha 12
/rerun c13 2,3               → re-roda etapas 2 e 3
/rerun c13 imagens,video quick → re-roda imagens + video quick
```

Busca parcial: `c13` encontra `c0013-pascoa2026` automaticamente.
Busca em todos os projetos: se nao encontra no projeto ativo, busca em `prj/*/outputs/`.

Flags automaticos no rerun:
- `skip_dependencies: true` — nao espera etapas anteriores
- `skip_completed: true` — pula se output ja existe
- `approval_modes: auto` — todas as aprovacoes automaticas

### /status — Status atual

Mostra o estado do pipeline por etapa:
```
Pipeline: c0013-pascoa2026
🔄 Reprocessamento

1 Brief         ✅
2 Imagens       ✅
3 Video         ⏳ video_pro (2/4)
4 Plataformas   ⏸
5 Distribuicao  ⏸
```

---

## Payload do Pipeline

```json
{
  "task_name": "c0014-lancamento",
  "task_date": "2026-03-29",
  "project_dir": "prj/inema",
  "language": "pt-BR",
  "campaign_brief": "Lancamento da nova colecao de inverno",
  "platform_targets": ["instagram", "youtube", "tiktok", "facebook", "threads", "linkedin"],
  "image_source": "brand",
  "video_mode": "both",
  "video_quick": true,
  "video_pro": true,
  "approval_modes": {
    "stage1": "humano",
    "stage2": "humano",
    "stage3": "humano",
    "stage4": "humano",
    "stage5": "humano"
  }
}
```

### Campos opcionais
| Campo | Default | Descricao |
|---|---|---|
| `skip_research` | false | Pula Research Agent |
| `skip_image` | false | Pula Ad Creative Designer |
| `skip_video` | false | Pula Video (Quick e Pro) |
| `video_count` | 1 | Quantos videos gerar |
| `image_provider` | env `IMAGE_PROVIDER` | Provider de imagem IA (kie, pollinations) |
| `image_model` | env `KIE_DEFAULT_MODEL` | Modelo de imagem |
| `image_folder` | null | Pasta para `image_source: 'folder'` |

---

## Comandos CLI

```bash
# Rodar pipeline com payload padrao
npm run pipeline:run

# Rodar com payload inline
npm run pipeline:run:payload '{"task_name":"test","project_dir":"prj/inema"}'

# Iniciar worker (terminal separado)
node pipeline/worker.js

# Render de video via Remotion
node pipeline/render-video-remotion.js <scene_plan.json> <output.mp4>

# Render de video via ffmpeg
node pipeline/render-video-ffmpeg.js <scene_plan.json> <output.mp4>

# Publicar campanha
node pipeline/publish_now.js <output_dir> [--dry-run]

# Upload para Supabase
node pipeline/supabase-upload.js <prj_dir> <task> <date> <files...>
```

---

## Variaveis de ambiente (.env)

### Obrigatorias
| Variavel | Descricao |
|---|---|
| `UPSTASH_REDIS_URL` | URL do Redis (BullMQ) |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram |
| `TELEGRAM_CHAT_ID` | Chat ID para notificacoes |

### Imagens
| Variavel | Descricao |
|---|---|
| `IMAGE_PROVIDER` | Provider de IA (kie, pollinations) |
| `KIE_API_KEY` | API key do KIE z-image |
| `KIE_DEFAULT_MODEL` | Modelo padrao (ex: flux-schnell) |
| `FREE_IMAGE_PROVIDER` | Provider gratis (pexels, unsplash, pixabay) |
| `PEXELS_API_KEY` | API key Pexels |

### Audio
| Variavel | Descricao |
|---|---|
| `ELEVENLABS_API_KEY` | API key ElevenLabs (narracao) |

### Publicacao
| Variavel | Descricao |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_KEY` | Service key Supabase |
| `INSTAGRAM_ACCOUNT_ID` | ID da conta Instagram |
| `INSTAGRAM_ACCESS_TOKEN` | Token Graph API |
| `YOUTUBE_CLIENT_ID` | OAuth client ID |
| `YOUTUBE_CLIENT_SECRET` | OAuth client secret |
| `YOUTUBE_REFRESH_TOKEN` | OAuth refresh token |
| `THREADS_USER_ID` | ID do usuario Threads |
| `THREADS_ACCESS_TOKEN` | Token Threads API |

### Pesquisa
| Variavel | Descricao |
|---|---|
| `TAVILY_API_KEY` | API key Tavily (research agent) |

---

## Estrutura de output

```
prj/<projeto>/outputs/<task_name>_<date>/
├── research_results.json         ← Research Agent
├── research_brief.md
├── interactive_report.html
├── creative/
│   ├── creative_brief.json       ← Diretor Criativo
│   └── creative_brief.md
├── copy/
│   ├── narrative.json            ← Copywriter
│   └── narrative.md
├── ads/
│   ├── layout.json               ← Ad Creative Designer
│   ├── ad.html + styles.css
│   └── <task>_carousel_01.png
├── video/
│   ├── <task>_video_01_scene_plan.json
│   ├── <task>_video_01.mp4       ← Video Quick
│   ├── <task>_video_01_scene_plan_motion.json
│   ├── <task>_video_01_draft.mp4 ← Video Pro (rascunho)
│   └── <task>_video_01.mp4       ← Video Pro (final)
├── platforms/
│   ├── instagram.json + .md
│   ├── youtube.json + .md
│   ├── tiktok.json + .md
│   ├── facebook.json + .md
│   ├── threads.json + .md
│   └── linkedin.json + .md
├── imgs/                         ← Imagens geradas via API
├── logs/
│   ├── research_agent.log
│   ├── ad_creative_designer.log
│   ├── video_quick.log
│   ├── video_pro.log
│   └── ...
├── media_urls.json               ← Distribution Agent
└── Publish <task> <date>.md      ← Distribution Agent
```
