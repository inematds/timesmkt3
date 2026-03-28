## Project Overview

**ATMKT v3.0.0** — AI-powered Social Media Content Automation System built with Claude Code inside the Antigravity IDE.

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
- `v3.1.1` → fix no gate de dependências do worker
- `v4.0.0` → mudança de arquitetura (ex: substituir BullMQ por outro sistema)

**Versão atual:** `ATMKT v3.0.0`

Sempre atualizar a versão no topo deste arquivo e no `package.json` ao fazer uma alteração relevante.

---

The system uses **five specialized AI agents** coordinated by an **Orchestrator** to research, generate, render, and distribute marketing content for a demo brand.

The goal is to demonstrate how Claude Code agents can coordinate **research, creative generation, media production, and social distribution workflows** using modular skills, knowledge files, and APIs.

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

The system consists of five agents managed by a central orchestrator:

```
Marketing Research Agent
        │
        ├──► Ad Creative Designer  ─┐
        ├──► Video Ad Specialist   ─┼──► Distribution Agent
        └──► Copywriter Agent      ─┘
```

The **Orchestrator** skill coordinates all agents via **BullMQ** job queues backed by **Upstash Redis**. Agents run in dependency order — research first, then the three creative agents in parallel, then distribution last.

Each agent uses a combination of **custom skills, knowledge files, and APIs** to perform its tasks.

---

# Orchestrator

The Orchestrator is not an agent — it is a coordinating skill that manages the full pipeline.

Skill File: `skills/orchestrator/SKILL.md`

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

## 1. Marketing Research Agent

Purpose:
Conduct structured market intelligence research using the **Tavily AI SDK** via a local Node.js script.

Skill File: `skills/marketing-research-agent/SKILL.md`

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

Skill File: `skills/ad-creative-designer/SKILL.md`

Responsibilities:
- Select ad layout type (Product Focus, Split, or Lifestyle) based on platform and campaign goal
- Generate marketing copy (headline ≤4 words, subtext, CTA)
- Output a design JSON spec
- Generate `ad.html` + `styles.css` from the layout spec
- Render the HTML to a 1080×1080 PNG screenshot using Playwright (`chromium.launch()`)

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/ads/`):
- `layout.json` — design specification
- `ad.html` + `styles.css` — generated HTML ad
- `instagram_ad.png` — Playwright-rendered screenshot at 1080×1080

---

## 3. Video Ad Specialist

Purpose:
Generate short-form video ad concepts and **Remotion-ready scene structures**.

Skill File: `skills/video-ad-specialist/SKILL.md`

Responsibilities:
- Generate a video concept (hook, emotional arc, visual style, CTA intent)
- Build a scene-by-scene breakdown (Hook → Product Showcase → Benefit → CTA)
- Output scene JSON for Remotion rendering
- Reference the official `remotion-best-practices` skill for technical guidance

Typical Output (saved to `<project_dir>/outputs/<task_name>_<date>/video/`):
- Scene JSON with `video_length`, `platform`, and per-scene `visual` + `text_overlay`
- Rendering configuration for Remotion

---

## 4. Copywriter Agent

Purpose:
Transform research output into **platform-native marketing copy** for Threads, Instagram, and YouTube.

Skill File: `skills/copywriter-agent/SKILL.md`

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

Skill File: `skills/distribution-agent/SKILL.md`

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
