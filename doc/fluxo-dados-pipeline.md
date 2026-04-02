# Fluxo de Dados do Pipeline ITAGMKT

## Visão Geral

Cada campanha gera uma pasta em `<project_dir>/outputs/<campaign>/` onde todos os agentes gravam e leem dados. O `creative_brief.json` é o hub central — todos os stages downstream dependem dele.

```
Você (Telegram) → bot.js → orchestrator → worker → agentes Claude CLI
                    ↓
          chat_context.json  (o que você pediu)
                    ↓
┌─ knowledge/* ──────────────────────────────────────┐
│  (fixo por projeto, lido por TODOS os agentes)     │
└────────────────────────────────────────────────────┘
         ↓
research_results.json → creative_brief.json → narrative.json
     (Stage 1)             (Stage 1)            (Stage 1)
                               ↓
                   ads/*.png + layout.json
                        (Stage 2)
                               ↓
             audio/*.mp3 → scene_plan.json → imgs/ → video/*.mp4
                             (Stage 3)
                               ↓
                     platforms/*.json (Stage 4)
                               ↓
                     Publish*.md (Stage 5)
```

---

## Entrada Fixa (por projeto)

```
prj/<projeto>/
├── knowledge/
│   ├── brand_identity.md      ← tom, voz, emojis, CTAs, hashtags
│   ├── product_campaign.md    ← features do produto, ângulos de campanha
│   └── platform_guidelines.md ← regras por plataforma (Instagram, YouTube, etc.)
└── assets/                    ← imagens da marca (banners, logos, fotos)
```

Todos os agentes leem `knowledge/`. Os assets são usados quando `image_source = brand`.

---

## Stage 1: Estratégia & Narrativa

### Research Agent
- **Lê:** `knowledge/brand_identity.md`, `knowledge/product_campaign.md`
- **Grava:**
  - `research_results.json` — dados estruturados (tendências, concorrentes, audiência)
  - `research_brief.md` — relatório legível com Mermaid
  - `interactive_report.html` — dashboard com Chart.js

### Creative Director
- **Lê:** `research_results.json` + `knowledge/*`
- **Grava:**
  - `creative/creative_brief.json` — **arquivo central**: ângulo, visual direction, cores, tipografia, assets
  - `creative/creative_brief.md` — versão legível para aprovação humana

### Copywriter
- **Lê:** `creative/creative_brief.json` + `knowledge/*`
- **Grava:**
  - `copy/narrative.json` — mensagens-chave, headlines, CTAs por plataforma
  - `copy/narrative.md`

---

## Stage 2: Imagens

### Ad Creative Designer
- **Lê:** `creative/creative_brief.json` + `copy/narrative.json` + imagens (ver "Fontes de Imagem")
- **Grava:**
  - `ads/layout.json` — spec de design
  - `ads/*.html` + `ads/*.png` — carousels e stories renderizados via Playwright

---

## Stage 3: Vídeo

### Phase 1 — Narração (Sonnet, rápido)
- **Lê:** `knowledge/brand_identity.md` + `creative/creative_brief.json`
- **Grava:** `audio/<campaign>_video_01_narration.mp3` via ElevenLabs
- **Pula** se o mp3 já existe (rerun)

### Phase 2 — Scene Plan (Opus, complexo)
- **Lê:** `knowledge/*` + `creative/creative_brief.json` + `skills/video-editor-agent/SKILL.md` + `skills/video-art-direction/SKILL.md`
- **Grava:** `video/<campaign>_video_01_scene_plan_motion.json` — 30-50 cuts com:
  - `duration`, `motion`, `text_overlay`, `text_layout`, `transition`
  - `image` (path) ou `image_prompt` (para API) ou `background_color` (para draft)

### Phase 3 — Imagens
- **Lê:** `video/*_scene_plan_motion.json` → campo `image` ou `image_prompt`
- **Grava:** `imgs/<campaign>_video_01_img_*.jpg`
- Fonte depende de `image_source` (ver abaixo)

### Phase 4 — Render
- **Lê:** `video/*_scene_plan_motion.json` + `imgs/*.jpg` + `audio/*_narration.mp3`
- **Grava:** `video/<campaign>_video_01.mp4` via ffmpeg ou Remotion

---

## Stage 4: Plataformas

### 6 agentes (Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn)
- **Lê:** `creative/creative_brief.json` + `copy/narrative.json` + `knowledge/platform_guidelines.md`
- **Grava:** `platforms/instagram.json`, `platforms/youtube.json`, etc.

---

## Stage 5: Distribuição

### Distribution Agent
- **Lê:** tudo acima + `platforms/*.json`
- **Grava:**
  - `media_urls.json` — URLs públicas no Supabase
  - `Publish <campaign> <date>.md` — guia de publicação

---

## Fontes de Imagem (`image_source`)

O campo `image_source` no payload define de onde vêm as imagens. **Default: `brand`.**

| Valor | Aliases | O que faz | Quando usar |
|---|---|---|---|
| `brand` | `marca` | Usa `assets/` + `imgs/` do projeto. Scanneia subpastas 1 nível. Inclui dimensões e tipo no prompt do agente. | **Default.** Sempre que não especificar. Usa fotos reais da marca. |
| `screenshot` | `captura` | Captura screenshots via Playwright das URLs mencionadas no brief/research/product_campaign + `screenshot_urls` do payload. Combina com assets da marca. | Quando mencionar "screenshot", "captura de site", "print da página" |
| `folder` | `pasta` | Usa imagens de uma pasta específica (ex: `prj/inema/outputs/c0016/imgs/tema-x/`) | Quando quer direcionar o agente para um conjunto específico de imagens |
| `api` | — | Gera imagens via Pollinations/z-image. Agente escreve `image_prompt` no scene plan, pipeline gera depois. | Só quando pedir explicitamente "gerar imagens com IA" |
| `free` | `gratis` | Baixa de Pexels/Unsplash/Pixabay via API | Só quando pedir "banco de imagens" ou "stock photos" |

### Como funciona `brand` (default)

```
getProjectAssets(projectDir) scanneia:
  1. prj/<projeto>/imgs/       ← imagens da campanha + subpastas por tema
  2. prj/<projeto>/assets/     ← imagens fixas da marca
```

Para cada imagem encontrada, detecta:
- Dimensões (width × height)
- Orientação (landscape/portrait/square)
- Tipo (banner, photo, logo, clip)

Essas informações são passadas no prompt do agente para que ele faça escolhas inteligentes de crop, composição e reuso.

### Como funciona `screenshot`

1. Extrai URLs automaticamente de:
   - `creative/creative_brief.json` (todas as URLs e domínios mencionados)
   - `research_results.json` (URLs de pesquisa)
   - `knowledge/product_campaign.md` (URL do produto)
2. Adiciona URLs explícitas do payload (`screenshot_urls: ['https://inema.club/cursos']`)
3. Usa Playwright para capturar cada URL em viewport mobile (1080x1920) e desktop (1920x1080)
4. Salva em `imgs/screenshots/screenshot_01_mobile_inema.club.png`
5. Combina screenshots + assets da marca no prompt do agente
6. Agente prioriza screenshots (interface real do produto) e complementa com fotos da marca

```
imgs/screenshots/
├── screenshot_01_mobile_inema.club.png     ← 1080x1920
├── screenshot_01_desktop_inema.club.png    ← 1920x1080
├── screenshot_02_mobile_inema.club_cursos.png
└── ...
```

### Como funciona `folder`

```
getFolderAssets(folderPath) scanneia:
  - O caminho especificado (absoluto ou relativo ao projeto)
  - Aceita .jpg, .jpeg, .png, .webp, .mp4, .mov, .webm
```

### Como funciona `api`

1. Agente escreve `image_prompt` (descrição em inglês, max 200 chars) para cada cut
2. Agente também gera `unique_images` — lista de prompts únicos (max 15)
3. Pipeline gera uma imagem por prompt único via Pollinations API
4. Mapeia a mesma imagem para múltiplos cuts (com crop_focus e motion diferentes)

### Como funciona `free`

1. Agente recebe URL da API + auth header
2. Busca fotos por tema (query baseada na campanha)
3. Baixa 10-15 fotos para `imgs/`
4. Mapeia para cuts no scene plan

---

## Onde ficam as pastas por tema (imgs/)

As subpastas dentro de `imgs/` ajudam o agente a selecionar imagens por contexto:

```
prj/inema/outputs/<campanha>/imgs/
├── tema-lancamento/     ← imagens específicas do tema
├── tema-comunidade/     ← fotos de comunidade
├── screenshots/         ← capturas do site inema.club
└── *.jpg                ← imagens soltas (geradas por API, etc.)
```

O `getProjectAssets()` scanneia recursivamente 1 nível, então subpastas são incluídas automaticamente no prompt do agente com seus caminhos completos.

---

## Regra de Seleção

1. Se o usuário diz "screenshot", "captura de site", "print da página" → `image_source: screenshot`
2. Se o usuário diz "api", "gerar imagens", "IA" → `image_source: api`
3. Se o usuário diz "free", "stock", "pexels", "banco de imagens" → `image_source: free`
4. Se o usuário diz "pasta X", "usar imagens de X" → `image_source: folder`, `image_folder: X`
5. **Se não diz nada** → `image_source: brand` → usa `assets/` + `imgs/` do projeto
