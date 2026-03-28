## Project Overview

**ATMKT v3.1.0** — AI-powered Social Media Content Automation System built with Claude Code inside the Antigravity IDE.

---

## Versionamento

**Padrão:** `ATMKT vMAJOR.RECURSO.BUG`

| Campo | Quando incrementar |
|---|---|
| `MAJOR` | Mudança de arquitetura ou redesign completo do fluxo |
| `RECURSO` | Novo agente, nova aprovação, novo provider, nova feature |
| `BUG` | Correção de bug, ajuste de comportamento, fix de prompt |

**Exemplos:**
- `v3.0.0` → versão base com novo fluxo de 4 aprovações + Diretor de Criação
- `v3.1.0` → adição do Agente Revisor automático
- `v3.1.1` → fix no gate de imagens do worker + regra de imagens sem texto via API
- `v4.0.0` → mudança de arquitetura (ex: substituir BullMQ por outro sistema)

**Versão atual:** `ATMKT v3.1.1`

Sempre atualizar a versão no topo deste arquivo e no `package.json` ao fazer uma alteração relevante.

---

The system uses **six specialized AI agents** coordinated by a **bot controller** to research, generate, render, and distribute marketing content.

Each agent runs as a **Claude CLI subprocess** (`claude -p <prompt> --dangerously-skip-permissions`) with full tool access (Read, Write, Bash, etc.). The `skills/` folder contains the **agent instruction specs** — Markdown documents each agent reads to know exactly what to do. These are not Claude Code skills; they are the agent's operational spec.

The demo brand used in this project is **Cold Brew Coffee Co.**

---

# Project Directory Structure

Projects are organized under the `prj/` directory. Each project (client/brand) has its own subdirectory containing `assets/`, `knowledge/`, and `outputs/`:

```
prj/
└── coldbrew-coffee-co/        ← Cold Brew Coffee Co. project
    ├── assets/                 ← product images and media assets
    ├── knowledge/              ← brand_identity, product_campaign, platform_guidelines
    └── outputs/                ← campaign output folders
```

All pipeline payloads must include a `project_dir` field (e.g., `"project_dir": "prj/coldbrew-coffee-co"`) so agents know where to find knowledge files, assets, and where to write outputs.

---

# System Architecture

The system consists of **six specialized agents** coordinated by the bot in a 4-stage approval pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│  Stage 1: Research & Strategy                               │
│  Marketing Research Agent → Creative Director               │
│                          [APROVAÇÃO 1 — brief criativo]     │
├─────────────────────────────────────────────────────────────┤
│  Stage 2: Creative Production                               │
│  Ad Creative Designer + Copywriter Agent (paralelo)         │
│                          [APROVAÇÃO 2 — imagens e copy]     │
├─────────────────────────────────────────────────────────────┤
│  Stage 3: Video Production                                  │
│  Video Ad Specialist                                        │
│                          [APROVAÇÃO 3 — roteiro de vídeo]   │
├─────────────────────────────────────────────────────────────┤
│  Stage 4: Distribution                                      │
│  Distribution Agent                                         │
│                          [APROVAÇÃO 4 — antes de publicar]  │
└─────────────────────────────────────────────────────────────┘
```

**Componentes:**
- **Bot** (`telegram/bot.js`) — controlador do pipeline; avança etapas após aprovação
- **Orchestrator** (`pipeline/orchestrator.js`) — enfileira jobs por etapa via `enqueueStage()`
- **Worker** (`pipeline/worker.js`) — executa os agentes; emite sinais `[STAGE1_DONE]`, `[STAGE2_IMAGE_READY]`, `[IMAGE_APPROVAL_NEEDED]`

**Modos de aprovação por etapa** (configurável via `approval_modes` no payload):
| Modo | Comportamento |
|---|---|
| `humano` | Bot envia resultado ao usuário e aguarda confirmação (padrão) |
| `auto` | Avança automaticamente sem aprovação |
| `agente` | Agente Revisor avalia e decide |

**Gate interno de imagens vs. aprovação de stage:**
O worker emite `[IMAGE_APPROVAL_NEEDED]` após gerar imagens via API — esse é um gate **interno** que aguarda o arquivo `imgs/approved.json` para continuar montando o ad HTML. O bot v3 escreve esse arquivo automaticamente. A aprovação real (humano/agente/auto) acontece no **gate de stage 2**, depois que ambos os agentes (`ad_creative_designer` + `copywriter_agent`) completam. Os dois mecanismos são independentes — os flags de aprovação controlam apenas o gate de stage.

Each agent uses a combination of **instruction specs, knowledge files, and APIs** to perform its tasks.

---

# Orchestrator

The Orchestrator is not an agent — it is a Node.js coordinator (`pipeline/orchestrator.js`) that enqueues jobs and manages stage advancement.

Agent Spec: `skills/orchestrator/SKILL.md`

Responsibilities:
- Accept a Job Payload (JSON) with `task_name`, `task_date`, `project_dir`, `platform_targets`, and optional skip flags
- Validate the payload and enforce dependency ordering
- Enqueue all agent jobs into the `ai-content-pipeline` BullMQ queue via `pipeline/orchestrator.js`
- Start the BullMQ worker (`pipeline/worker.js`) to process queued jobs
- Track job status via log files in `<project_dir>/outputs/<task_name>_<date>/logs/`
- Report pipeline completion and surface the generated Publish MD file

### Pipeline Commands

```bash
npm run pipeline:run                     # run with default demo payload
npm run pipeline:run:payload '<json>'    # run with inline JSON payload
node pipeline/worker.js                  # start the BullMQ worker (separate terminal)
```

### Skip Flags

| Flag | Effect |
|---|---|
| `skip_research: true` | Skips Research Agent; requires `<project_dir>/assets/<task_name>/` to exist |
| `skip_image: true` | Skips Ad Creative Designer |
| `skip_video: true` | Skips Video Ad Specialist |

---

# Agents and Responsibilities

## 0. Creative Director

Purpose:
Transform research output into a **single strategic campaign angle** that guides all creative production.

Agent Spec: `skills/creative-director/SKILL.md`

Responsibilities:
- Read research results + brand identity + product campaign
- Choose ONE campaign angle (strongest intersection of audience desire + brand authenticity)
- Define visual direction: mood, colors, photography style
- Write key messages per platform
- Set guardrails (what to avoid)

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/creative/`):
- `creative_brief.json` — structured brief consumed by creative agents
- `creative_brief.md` — human-readable brief shown for Approval 1

Emits `[STAGE1_DONE]` signal when complete.

---

## 1. Marketing Research Agent

Purpose:
Conduct structured market intelligence research using the **Tavily AI SDK** via a local Node.js script.

Agent Spec: `skills/marketing-research-agent/SKILL.md`

Responsibilities:
- Run 5 targeted Tavily searches (trends, competitors, audience, hooks, viral topics)
- Synthesize findings into marketing intelligence categories
- Output three deliverables: structured JSON, Markdown brief with Mermaid diagrams, and an interactive HTML report with Chart.js

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/`):
- `research_results.json` — machine-readable structured data consumed by downstream agents
- `research_brief.md` — human-readable Markdown report with Mermaid graphs
- `interactive_report.html` — brand-styled interactive dashboard with Chart.js charts

---

## 2. Ad Creative Designer

Purpose:
Generate **static marketing ad creatives** as structured design JSON, then render them to PNG via **Playwright**.

Agent Spec: `skills/ad-creative-designer/SKILL.md`

Responsibilities:
- Select ad layout type (Product Focus, Split, or Lifestyle) based on platform and campaign goal
- Generate marketing copy (headline ≤4 words, subtext, CTA)
- Output a design JSON spec
- Generate `ad.html` + `styles.css` from the layout spec
- Render the HTML to a 1080×1080 PNG screenshot using Playwright (`chromium.launch()`)

**Regra de imagens geradas via API:**
Imagens geradas por modelos de IA (ex: KIE/z-image) devem sempre ser **limpas de texto**. Texto é sempre sobreposto via HTML/CSS na etapa de montagem do ad — nunca embutido na imagem gerada. Esta regra é fixa. Futuramente, se o modelo suportar texto de forma confiável, a regra pode ser revisada.

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/ads/`):
- `layout.json` — design specification
- `ad.html` + `styles.css` — generated HTML ad
- `instagram_ad.png` — Playwright-rendered screenshot at 1080×1080

---

## 3. Video Ad Specialist

Purpose:
Generate short-form video ad concepts and **Remotion-ready scene structures**.

Agent Spec: `skills/video-ad-specialist/SKILL.md`

Responsibilities:
- Generate a video concept (hook, emotional arc, visual style, CTA intent)
- Build a scene-by-scene breakdown (Hook → Product Showcase → Benefit → CTA)
- Output scene JSON for Remotion rendering
- Reference `skills/remotion-best-practices/` for technical rendering guidance

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/video/`):
- Scene JSON with `video_length`, `platform`, and per-scene `visual` + `text_overlay`
- Rendering configuration for Remotion

---

## 4. Copywriter Agent

Purpose:
Transform research output into **platform-native marketing copy** for Threads, Instagram, and YouTube.

Agent Spec: `skills/copywriter-agent/SKILL.md`

Responsibilities:
- Select a consistent campaign angle from the research output
- Write platform-specific copy adapted in tone, length, CTA, and hashtag format
- Output structured JSON and individual platform text files

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/copy/`):
- `threads_post.txt` — witty, casual, ≤500 characters
- `instagram_caption.txt` — hook + benefit + CTA + 3–5 hashtags
- `youtube_metadata.json` — title (60–70 chars), description, and keyword tags

---

## 5. Distribution Agent

Purpose:
Host media on **Supabase**, assemble publish-ready metadata, generate scheduling recommendations, and gate-protect actual posting.

Agent Spec: `skills/distribution-agent/SKILL.md`

Responsibilities:
- Upload all campaign media files to the `campaign-uploads` Supabase storage bucket
- Generate public URLs and save them to `media_urls.json`
- Assemble final platform metadata from Copywriter Agent outputs
- Generate scheduling recommendations based on research trends
- Write a `Publish <task_name> <date>.md` advisory file
- Execute actual API posting **only** when the user explicitly references the Publish MD file by name

Platforms:
- **Instagram** — Graph API (`/media` + `/media_publish`)
- **YouTube** — YouTube Data API (requires OAuth `YOUTUBE_REFRESH_TOKEN`)
- **Threads** — No public API; post text is included in Publish MD for manual posting

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/`):
- `media_urls.json` — Supabase public URLs for all uploaded media
- `Publish <task_name> <date>.md` — complete advisory with captions, metadata, scheduling, and publishing instructions

---

# Knowledge Files

All agents must reference the following knowledge files located in each project's **`<project_dir>/knowledge/`** directory.

### brand_identity.md
Defines:
- tone and brand voice
- approved emojis and what to avoid
- CTA style and approved CTA language
- hashtag strategy

Used by:
- All five agents

---

### product_campaign.md
Defines:
- product features and selling points
- visual asset references (filenames in `assets/`)
- campaign ideas and angles

Used by:
- Marketing Research Agent
- Ad Creative Designer
- Video Ad Specialist
- Copywriter Agent

---

### platform_guidelines.md
Defines platform best practices and formatting constraints for:

- Instagram (feed, Stories, Reels)
- Threads
- YouTube (Shorts, standard video)

Used by:
- Ad Creative Designer
- Copywriter Agent
- Distribution Agent

---

# Assets

Each project's `<project_dir>/assets/` contains media assets used for testing and rendering.

For Cold Brew Coffee Co. (`prj/coldbrew-coffee-co/assets/`):
- `coffee_can.png.jpeg`
- `coffee_glass.png.jpeg`
- `morning_cafe.png.jpeg`
- `product_square.png`
- `background_blur.png`

---

# Pipeline Output Folder Structure

```
<project_dir>/outputs/<task_name>_<date>/
├── research_results.json         ← Research Agent
├── research_brief.md             ← Research Agent
├── interactive_report.html       ← Research Agent
├── media_urls.json               ← Distribution Agent
├── ads/
│   ├── layout.json               ← Ad Creative Designer
│   ├── ad.html                   ← Ad Creative Designer
│   ├── styles.css                ← Ad Creative Designer
│   └── instagram_ad.png          ← Ad Creative Designer (Playwright render)
├── video/
│   └── ad.mp4                    ← Video Ad Specialist (Remotion render)
├── copy/
│   ├── instagram_caption.txt     ← Copywriter Agent
│   ├── threads_post.txt          ← Copywriter Agent
│   └── youtube_metadata.json     ← Copywriter Agent
├── logs/
│   ├── research_agent.log
│   ├── ad_creative_designer.log
│   ├── video_ad_specialist.log
│   ├── copywriter_agent.log
│   └── distribution_agent.log
└── Publish <task_name> <date>.md ← Distribution Agent
```

---

# Tech Stack

| Tool | Purpose |
|---|---|
| BullMQ + Upstash Redis | Job queuing and worker orchestration |
| Tavily AI SDK (`@tavily/core`) | Market research via Node.js scripts |
| Playwright (`chromium`) | HTML-to-PNG ad rendering |
| Remotion | Video ad rendering |
| Supabase (`@supabase/supabase-js`) | Media hosting and public URL generation |
| Instagram Graph API | Instagram publishing |
| YouTube Data API | YouTube publishing (requires OAuth) |
