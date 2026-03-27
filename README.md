# Cold Brew Coffee Co. — AI-Powered Social Media Content Automation

An AI-powered marketing pipeline that researches, generates, renders, and distributes social media content for a demo brand (**Cold Brew Coffee Co.**) using five coordinated AI agents.

> **For the full system architecture, agent responsibilities, pipeline output structure, and tech stack details, see [`CLAUDE.md`](CLAUDE.md).**

---

## Prerequisites

- **Node.js** v18+ (v20 LTS recommended)
- **npm** (comes with Node.js)
- **Playwright Chromium** (installed automatically — see step 3)

---

## Quick Start

### 1. Install Root Dependencies

From the project root:

```bash
npm install
```

### 2. Install Remotion Video Sub-Project Dependencies

```bash
cd remotion-ad
npm install
cd ..
```

### 3. Install Playwright Browser

Playwright is used by the Ad Creative Designer agent to render HTML ads to PNG. Install the Chromium browser binary:

```bash
npx playwright install chromium
```

### 4. Configure Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Then open `.env` and replace every `YOUR_*` placeholder with your actual keys. The `.env.example` file contains inline comments explaining where to get each key.

| Variable | Service | Purpose |
|---|---|---|
| `TAVILY_API_KEY` | [Tavily AI](https://tavily.com) | Market research web search |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) | YouTube public read operations |
| `YOUTUBE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 | YouTube upload authentication |
| `YOUTUBE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 | YouTube upload authentication |
| `YOUTUBE_REFRESH_TOKEN` | [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground) | Long-lived YouTube auth token |
| `INSTAGRAM_ACCOUNT_ID` | Meta Business Suite or Graph API | Instagram Professional Account ID |
| `INSTAGRAM_ACCESS_TOKEN` | [Graph API Explorer](https://developers.facebook.com/tools/explorer/) | Instagram publish token (Page Access Token) |
| `UPSTASH_REDIS_ENDPOINT` | [Upstash](https://upstash.com) | BullMQ job queue backend |
| `UPSTASH_REDIS_PASSWORD` | Upstash | Redis authentication |
| `SUPABASE_URL` | [Supabase](https://supabase.com) | Media file hosting |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Storage upload (server-side only) |

> **Note on YouTube Refresh Token:** Use the [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground). Click the gear icon → check "Use your own OAuth credentials" → paste your Client ID and Secret → authorize `https://www.googleapis.com/auth/youtube.upload` → exchange for tokens. The redirect URI `https://developers.google.com/oauthplayground` must be whitelisted in your Google Cloud OAuth Client settings.

> **Note on Instagram Access Token:** Use the [Graph API Explorer](https://developers.facebook.com/tools/explorer/). Select your app → select "Get Page Access Token" (not User Token) → grant `instagram_basic` and `instagram_content_publish` permissions → generate token. Verify your Account ID with `GET /me?fields=instagram_business_account`. All Graph API calls use `graph.facebook.com` (not `graph.instagram.com`).

---

## Running the Pipeline

### Full Pipeline (Research → Creative → Distribution)

Start the BullMQ worker in one terminal:

```bash
npm run pipeline:worker
```

Then trigger the orchestrator in another terminal:

```bash
npm run pipeline:run
```

Or with a custom JSON payload:

```bash
npm run pipeline:run:payload '{"task_name":"my_campaign","task_date":"2026-03-17","platform_targets":["instagram","youtube","threads"]}'
```

### Individual Components

| Command | What It Does |
|---|---|
| `node tavily-search.js` | Run a standalone Tavily market research search |
| `node supabase-upload.js` | Upload campaign media to Supabase storage |
| `node pipeline/publish_now.js` | Execute Instagram + YouTube publishing |
| `node render_ad_test.js` | Render an HTML ad to PNG via Playwright |

### Remotion Video Studio

To preview or edit video ads interactively:

```bash
cd remotion-ad
npm run dev
```

To render a dynamic video from a scene plan:

```bash
node pipeline/render-video.js outputs/<folder>/video/ad.mp4 outputs/<folder>/video/scene_plan.json
```

To render the original fixed template:

```bash
cd remotion-ad
npx remotion render src/index.ts ColdBrewAd ../outputs/<folder>/video/ad.mp4
```

### Media Provider Status

Check which media providers are configured:

```bash
npm run media:status
```

---

## Project Structure

```
Cold Brew Coffee Co/
├── assets/                  # Brand images (product photos, backgrounds)
├── knowledge/               # Brand identity, platform guidelines, campaign briefs
├── skills/                  # AI agent skill definitions (7 skills)
│   ├── marketing-research-agent/
│   ├── ad-creative-designer/
│   ├── video-ad-specialist/
│   ├── copywriter-agent/
│   ├── distribution-agent/
│   ├── orchestrator/
│   └── media-help/          # /help skill — guia de media providers
├── media/                   # Multi-provider media module
│   ├── index.js             # API unificada (image, tts, sfx, music)
│   ├── providers.js         # Registry + auto-detection de providers
│   ├── image-generator.js   # Kie.ai Z-Image, DALL-E, Stability, Unsplash, Pexels
│   ├── tts-generator.js     # ElevenLabs, OpenAI TTS, MiniMax, Piper (local)
│   └── sfx-fetcher.js       # Freesound, Pixabay (SFX + Music)
├── pipeline/                # BullMQ orchestrator, worker, and job payloads
│   ├── orchestrator.js      # Enfileira jobs com dependency ordering
│   ├── worker.js            # Processa jobs via Claude CLI (claude -p)
│   ├── render-video.js      # Renderiza vídeo com Remotion (aceita scene plan)
│   ├── publish_now.js       # Publica em Instagram/YouTube
│   ├── redis.js             # Conexão Redis (local ou Upstash)
│   ├── queues.js
│   └── payloads/            # JSONs de campanha
├── remotion-ad/             # Remotion video sub-project
│   ├── src/
│   │   ├── DynamicAd.tsx    # Composição dinâmica (lê scene_plan.json)
│   │   ├── ColdBrewAd.tsx   # Composição fixa original
│   │   ├── scenes/
│   │   │   ├── DynamicScene.tsx   # Renderiza cenas baseado no tipo (JSON)
│   │   │   ├── Scene1Hook.tsx     # Cenas hardcoded (legado)
│   │   │   └── ...
│   │   └── components/
│   │       ├── TextOverlay.tsx    # Texto animado (fade, slide, per-word, punch)
│   │       ├── ProductImage.tsx   # Produto com glow, float, entrance
│   │       ├── CTAButton.tsx      # Botão CTA animado
│   │       ├── SceneBackgrounds.tsx # Backgrounds dinâmicos
│   │       └── SVGIcons.tsx       # SVGs animados (alarme, personagens, etc.)
│   ├── public/              # Assets para staticFile() (product images)
│   ├── package.json
│   └── remotion.config.ts
├── outputs/                 # Generated campaign outputs
├── .env.example             # Template com todas as variáveis
├── CLAUDE.md                # Full system architecture documentation
├── package.json             # Root dependencies
└── README.md                # This file
```

---

## Outputs

The `outputs/` folder contains all generated campaign deliverables organized by task name and date. Each campaign folder includes:

- **Research**: `research_results.json`, `research_brief.md`, `interactive_report.html`
- **Ads (imagens)**: `ads/carousel_01.png` ... `carousel_05.png`, `ads/story_01.png` ... `story_03.png`, `ads/layout.json`
- **Video**: `video/ad_01.mp4`, `video/ad_02.mp4`, `video/video_01_scene_plan.json`, `video/video_02_scene_plan.json`
- **Copy**: `copy/instagram_caption.txt`, `copy/threads_post.txt`, `copy/youtube_metadata.json`, `copy/carousel_captions.json`, `copy/story_captions.json`
- **Distribution**: `media_urls.json`, `Publish <task_name> <date>.md`

Exemplo de output completo (campanha Dia das Mães):

```
outputs/dia_das_maes_2026-05-10/
├── research_results.json            ← pesquisa Tavily
├── research_brief.md                ← relatório Markdown
├── interactive_report.html          ← dashboard Chart.js
├── ads/
│   ├── carousel_01.png ... 05.png   ← 5 slides carrossel (1080x1080)
│   ├── story_01.png ... 03.png      ← 3 stories (1080x1920)
│   ├── carousel_01.html ... 05.html ← HTML source dos slides
│   ├── story_01.html ... 03.html    ← HTML source dos stories
│   └── layout.json                  ← metadata de todas as imagens
├── video/
│   ├── ad_01.mp4                    ← vídeo 1 renderizado (Remotion)
│   ├── ad_02.mp4                    ← vídeo 2 renderizado (Remotion)
│   ├── video_01_scene_plan.json     ← roteiro detalhado vídeo 1
│   └── video_02_scene_plan.json     ← roteiro detalhado vídeo 2
├── copy/
│   ├── instagram_caption.txt        ← caption Instagram
│   ├── threads_post.txt             ← post Threads
│   ├── youtube_metadata.json        ← título + descrição + tags
│   ├── carousel_captions.json       ← legendas por slide
│   └── story_captions.json          ← legendas por story
├── media_urls.json                  ← URLs públicas (Supabase)
├── Publish dia_das_maes 2026-05-10.md ← guia de publicação
└── logs/                            ← logs de execução por agente
```

> See [`CLAUDE.md`](CLAUDE.md) for the complete output folder structure and agent responsibilities.

---

## Exemplo de Campanha Completa — Dia das Mães (Free)

Campanha gerada com recursos gratuitos + ElevenLabs (narração). Demonstra o fluxo completo de geração de vídeo com fotos reais, movimentos de câmera, narração contínua e música de fundo.

### Recursos usados

| Recurso | Provider | Custo |
|---|---|---|
| Fotos de fundo (5) | Pexels | Grátis |
| Imagens carousel (5) + stories (3) | Playwright (HTML→PNG) | Grátis |
| Vídeos (2) | Remotion | Grátis |
| Narração contínua | ElevenLabs | ~$0.005 por vídeo |
| Música de fundo | ElevenLabs Sound Generation | ~$0.01 por track |

### Vídeo 1 — "Domingo com Ela" (21s, 8.1 MB)

*Tom: suave, nostálgico, acolhedor*

| Cena | Tempo | Background | Câmera | Texto Animação | Narração |
|---|---|---|---|---|---|
| Hook | 0-3s | Grãos de café (Pexels) | `push-in` | `blur-in` | *"Domingos têm um cheiro especial."* |
| Conexão | 3-6.5s | Mãe e filha (Pexels) | `drift` | `per-word` | *"Ela ensinou tudo. Até o café perfeito."* |
| Produto | 6.5-9.5s | Cold brew com gelo (Pexels) | `ken-burns-in` | `slide-up` | *"Suave. Gelado. Perfeito."* |
| Brinde | 9.5-12s | Cozinha juntas (Pexels) | `parallax-zoom` | `fade` | *"Um brinde pra ela."* |
| **CTA (hold)** | **12-21s** | **Abraço materno (Pexels)** | `breathe` | `bounce-in` | *"Presente perfeito para quem te deu tudo."* |

Áudio: Narração ElevenLabs contínua (15.5s) + piano suave de fundo (volume 20%)

### Vídeo 2 — "Anos de Café" (19s, 7.3 MB)

*Tom: dinâmico, nostálgico crescendo para celebração*

| Cena | Tempo | Background | Câmera | Texto Animação | Narração |
|---|---|---|---|---|---|
| Hook | 0-2.7s | Grãos de café (Pexels) | `push-in` | `punch-in` | *"Ela sempre teve um café pra te oferecer."* |
| Infância (sépia) | 2.7-5.8s | Cozinha (Pexels) | `ken-burns-out` | `typewriter` | *"Quando você tinha cinco anos..."* |
| Adolescência (sépia) | 5.8-8.8s | Mãe e filha (Pexels) | `pan-left` | `typewriter` | *"...e quando você tinha dezessete."* |
| Presente (flash) | 8.8-12s | Cold brew (Pexels) | `push-in` | `punch-in` | *"Hoje é a sua vez de cuidar dela."* |
| **CTA (hold)** | **12-19s** | **Abraço materno (Pexels)** | `breathe` | `bounce-in` | *"Cada gole é um abraço."* |

Áudio: Narração ElevenLabs contínua (13.9s) + piano nostálgico crescente (volume 20%)

### Princípios de timing aplicados

- **Voz dita o ritmo** — duração de cada cena calculada pela narração, não arbitrária
- **Narração contínua** — um único áudio fluido para todo o vídeo (não cortado por cena)
- **Hold no CTA** — mensagem final fica 5-9s na tela depois da voz terminar
- **Música não compete** — volume de fundo a 20%, só acompanha

### Scene Plan JSON — campos de áudio

```json
{
  "narration_file": "audio/v1_full.mp3",
  "narration_volume": 1,
  "background_music": "audio/bgm_v1.mp3",
  "background_music_volume": 0.2
}
```

O `narration_file` é um áudio único que cobre todo o vídeo. O Remotion o posiciona no frame 0 e ele toca continuamente sobre as cenas visuais. A `background_music` toca em paralelo com volume reduzido.

### Para usar imagens locais em vez de Pexels

Use o comando `/img-pasta` ou o campo `background_image` no scene plan apontando para imagens na pasta `remotion-ad/public/`:

```json
{
  "scene_id": 2,
  "tipo": "conexao_emocional",
  "background_image": "minha_foto_mae.jpg",
  "camera_effect": "drift"
}
```

Copie as imagens para `remotion-ad/public/` antes de renderizar:

```bash
cp suas-imagens/*.jpg remotion-ad/public/
node pipeline/render-video.js output.mp4 scene_plan.json
```

---

## Regras de Posicionamento de Texto sobre Imagens

Quando fotos reais são usadas como background (em imagens ou vídeos), o sistema deve **analisar a imagem antes** de posicionar texto. Isso evita:

- Texto cobrindo rostos de pessoas
- Texto cortado fora do frame
- Texto ilegível sobre áreas movimentadas

### Regras obrigatórias

1. **Visualizar a imagem** antes de gerar o HTML — identificar rostos, produto, áreas livres
2. **Nunca cobrir rostos** — posicionar texto em zonas livres (fundo, bordas, áreas desfocadas)
3. **Garantir que texto cabe no frame** — padding mínimo 40px, `overflow: hidden`, testar mentalmente
4. **Gradientes localizados** — cobrir só a zona do texto (opacidade 0.4-0.7), não a imagem inteira

### Zonas seguras por tipo de imagem

| Imagem com... | Onde colocar texto |
|---|---|
| Pessoas no centro | Rodapé (bottom 25%) ou topo (top 20%) |
| Pessoas na esquerda | Direita (right 40%) |
| Pessoas na direita | Esquerda (left 40%) |
| Produto no centro | Topo ou rodapé com gradiente |
| Paisagem/fundo | Centro com vinheta radial |
| Texto já na imagem | Não adicionar texto na mesma área |

### Checklist antes de renderizar

- [ ] Imagem de background visualizada
- [ ] Rostos/produto identificados
- [ ] Texto posicionado em área livre
- [ ] Todo texto cabe dentro do frame (1080x1080 ou 1080x1920)
- [ ] Padding de 40px nas bordas
- [ ] Gradiente aplicado apenas na zona do texto

Estas regras se aplicam tanto ao Ad Creative Designer (imagens estáticas) quanto ao Video Ad Specialist (cenas de vídeo com background de foto).

---

## Efeitos de Câmera e Animações de Texto (Remotion)

O sistema de vídeo dinâmico suporta múltiplos efeitos de câmera sobre imagens de fundo e animações de texto. Cada cena no `scene_plan.json` pode especificar seus próprios efeitos, ou o sistema escolhe automaticamente baseado no tipo de cena e na descrição visual do roteiro.

### Efeitos de Câmera (`camera_effect`)

Movimentos aplicados sobre imagens de fundo (fotos stock, IA ou locais) simulando câmera cinematográfica:

| Efeito | Descrição | Quando o sistema usa |
|---|---|---|
| `push-in` | Zoom rápido para o centro (dramático) | Hooks, cenas de impacto |
| `pull-out` | Zoom afastando (revelação) | Establishing shots |
| `ken-burns-in` | Zoom lento e suave (íntimo) | Produto, close-ups |
| `ken-burns-out` | Zoom afastando suave (memória) | Flashbacks, revelações |
| `pan-left` | Panorâmica para esquerda | Narrativa, transição temporal |
| `pan-right` | Panorâmica para direita | Narrativa, transição temporal |
| `pan-up` | Panorâmica para cima (esperança) | Momentos de esperança |
| `pan-down` | Panorâmica para baixo (calma) | Momentos de calma |
| `drift` | Movimento aleatório sutil (onírico) | Cenas emocionais, conexão |
| `parallax-zoom` | Zoom com drift vertical (dinâmico) | Cenas de ação, benefícios |
| `tilt-shift` | Zoom com leve rotação (artístico) | Cenas artísticas |
| `breathe` | Pulso de escala sutil (vivo) | CTAs, finais |
| `none` | Estático | Quando não quiser movimento |

O sistema detecta o efeito apropriado automaticamente a partir de palavras-chave na `descricao_visual` do roteiro. Por exemplo: "zoom in" → `ken-burns-in`, "suave" → `drift`, "impacto" → `push-in`.

### Overlays de Cor

Cada cena aplica um overlay sobre a imagem de fundo para controlar o tom visual:

| Overlay | Efeito | Quando o sistema usa |
|---|---|---|
| `dark` | Escurecimento (`rgba(0,0,0,x)`) | Hooks, cenas noturnas |
| `light` | Clareamento (`rgba(255,255,255,x)`) | CTAs, finais |
| `warm` | Tom quente marrom (`rgba(75,46,26,x)`) | Conexão, benefícios |
| `cool` | Tom frio azulado (`rgba(100,140,180,x)`) | Produto, close-ups |
| `sepia` | Sépia dessaturado | Flashbacks, memórias |
| `none` | Sem overlay | Imagem pura |

### Animações de Texto (`text_animation`)

| Animação | Descrição | Quando o sistema usa |
|---|---|---|
| `blur-in` | Texto surge de desfocado para nítido | Hooks |
| `slide-up` | Texto sobe com fade | Produto, genérico |
| `slide-down` | Texto desce com fade | Revelações |
| `slide-left` / `slide-right` | Texto desliza horizontal | Transições |
| `per-word` | Cada palavra surge separadamente | Conexão, benefícios |
| `punch-in` | Palavras surgem com spring (impacto) | Presentes, reveals |
| `bounce-in` | Palavras surgem com bounce (celebração) | CTAs |
| `typewriter` | Texto aparece letra por letra com cursor | Flashbacks, memórias |
| `scale-up` | Texto cresce de pequeno para normal | Destaque |
| `fade` | Fade in simples | Close-ups, sutil |
| `split-lines` | Cada linha desliza separadamente | Multi-linha |

O sistema detecta a animação a partir de palavras na descrição do roteiro. Por exemplo: "datilógrafo" → `typewriter`, "impacto" → `punch-in`, "palavra por palavra" → `per-word`.

### Seleção Automática por Tipo de Cena

Quando o roteiro não especifica `camera_effect` ou `text_animation`, o sistema seleciona automaticamente:

| Tipo de Cena | Câmera Padrão | Overlay Padrão | Texto Padrão |
|---|---|---|---|
| `hook` | `push-in` | `dark` | `blur-in` |
| `produto_em_acao` | `ken-burns-in` | `cool` | `slide-up` |
| `close_produto` | `ken-burns-in` | `cool` | `fade` |
| `conexao_emocional` | `drift` | `warm` | `per-word` |
| `benefit` | `parallax-zoom` | `warm` | `per-word` |
| `flashback_infancia` | `ken-burns-out` | `sepia` | `typewriter` |
| `flashback_adolescencia` | `pan-left` | `sepia` | `typewriter` |
| `presente` | `push-in` | `dark` | `punch-in` |
| `cta` | `breathe` | `light` | `bounce-in` |

### Exemplo de Scene Plan com Efeitos

```json
{
  "scene_id": 2,
  "tipo": "conexao_emocional",
  "nome": "Mãe e Filha",
  "frame_inicio": 75,
  "frame_fim": 195,
  "duracao_frames": 120,
  "descricao_visual": "Foto de mãe e filha com café. Drift suave.",
  "background_image": "pexels_mae_filha.jpg",
  "camera_effect": "drift",
  "overlay": "warm",
  "overlay_opacity": 0.35,
  "text_animation": "per-word",
  "text_overlay": {
    "texto": "Ela ensinou tudo. Até o café perfeito.",
    "entrada_frame": 30
  },
  "assets_remotion": ["coffee_glass.png via staticFile()"]
}
```

### Hierarquia de Decisão

O sistema resolve câmera, overlay e animação nesta ordem de prioridade:

```
1. Valor explícito no scene plan JSON (camera_effect, text_animation, overlay)
     ↓ se não definido
2. Detecção por palavras-chave na descricao_visual e animacao do roteiro
     ↓ se não detectado
3. Mapeamento automático pelo tipo de cena (tabela acima)
     ↓ se tipo desconhecido
4. Valores default (ken-burns-in, dark, slide-up)
```

Isso permite que o Video Ad Specialist (IA) gere roteiros com ou sem efeitos explícitos — o sistema sempre produz um vídeo funcional.

---

## Instagram Graph API Setup

To publish content to Instagram via the API, you need the following:

### 1. Instagram Professional Account

- Your Instagram account must be converted to **Business** or **Creator** (professional) — personal accounts do not have API access
- The account must be **linked to a Facebook Page** (this is required by Meta's API architecture)

### 2. Meta Developer App

- Create an app at [developers.facebook.com](https://developers.facebook.com)
- Add the **"Instagram Graph API"** product to your app

### 3. Required Credentials

| Variable | What It Is | How to Get It |
|---|---|---|
| `INSTAGRAM_ACCOUNT_ID` | Numeric ID of your professional account | Call `GET /me?fields=instagram_business_account` in the Graph API |
| `INSTAGRAM_ACCESS_TOKEN` | User access token with publish permissions | Generate via **Business Login for Instagram** in your Meta app |

### 4. Required Permissions

The access token must include:

- `instagram_business_basic`
- `instagram_business_content_publish`

### 5. Important Notes

- Long-lived tokens **expire after 60 days** — refresh before expiry
- The API requires images to be hosted at a **public URL** (the pipeline uses Supabase Storage for this)
- All API calls use `graph.facebook.com` (not `graph.instagram.com`)

---

## Media Providers — Imagens, Vídeos, Áudio e Narração

O sistema possui um módulo de mídia (`media/`) que integra múltiplos providers para geração de imagens, busca de fotos stock, efeitos sonoros, música e narração por voz.

Para verificar quais providers estão configurados:

```bash
npm run media:status
```

### Geração de Imagens por IA

| Provider | Custo | Qualidade | API Key | Link |
|---|---|---|---|---|
| **Kie.ai Z-Image** (padrão) | ~$0.004/img | Excelente | `KIE_API_KEY` | [kie.ai/api-key](https://kie.ai/api-key) |
| DALL-E 3 (OpenAI) | ~$0.04/img | Excelente | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Stability AI (SDXL) | ~$0.003/img | Alta | `STABILITY_API_KEY` | [platform.stability.ai](https://platform.stability.ai/account/keys) |

**Kie.ai Z-Image** é o provider padrão do projeto — modelo Alibaba de 6B parâmetros, fotorrealista, ultra-rápido. Suporta aspect ratios 1:1, 4:3, 3:4, 16:9, 9:16. A API é assíncrona (cria task → poll resultado).

### Imagens Stock (Gratuitas)

| Provider | Custo | Limite Free | API Key | Link |
|---|---|---|---|---|
| **Pexels** | Grátis | 200/hr, 20k/mês | `PEXELS_API_KEY` | [pexels.com/api](https://www.pexels.com/api/) |
| **Unsplash** | Grátis | 50 req/hora | `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/oauth/applications) |
| **Pixabay** | Grátis | 100 req/min | `PIXABAY_API_KEY` | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |

Notas:
- **Pexels** — melhor opção geral: sem atribuição obrigatória, key instantânea
- **Unsplash** — fotos excelentes, exige crédito ao fotógrafo
- **Pixabay** — cobre imagem, vídeo, áudio e música com uma única key

### Narração / Text-to-Speech (TTS)

| Provider | Custo | Qualidade | Idiomas | API Key | Link |
|---|---|---|---|---|---|
| **ElevenLabs** | $5/mês ou $0.30/1k chars | Excelente | 30+ | `ELEVENLABS_API_KEY` | [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys) |
| OpenAI TTS | $0.015/1k chars | Alta | 57+ | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) |
| MiniMax | ~$0.01/1k chars | Alta | PT-BR, EN, ZH, ES | `MINIMAX_API_KEY` + `MINIMAX_GROUP_ID` | [api.minimax.chat](https://api.minimax.chat) |
| **Piper (local)** | Grátis | Boa | 20+ | Nenhuma | Instalar: `pip install piper-tts` |

Vozes recomendadas (OpenAI TTS):
- **nova** — amigável, feminina (recomendada para PT-BR)
- **onyx** — grave, autoritária
- **echo** — quente, conversacional
- **shimmer** — suave, gentil

### Efeitos Sonoros (SFX)

| Provider | Custo | Acervo | API Key | Link |
|---|---|---|---|---|
| **Pixabay Audio** | Grátis | Bom | `PIXABAY_API_KEY` | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |
| **Freesound.org** | Grátis | 500k+ sons | `FREESOUND_API_KEY` | [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply) |

Nota sobre Freesound: cada som tem licença individual (CC0, CC-BY ou CC-BY-NC) — verificar antes de uso comercial.

### Música

| Provider | Custo | Tipo | API Key | Link |
|---|---|---|---|---|
| **Pixabay Music** | Grátis | Royalty-free | `PIXABAY_API_KEY` | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |
| Suno AI | ~$0.05/track | Geração por IA | `SUNO_API_KEY` | [suno.ai](https://suno.ai) |

### Vídeos (Remotion)

| Composição | Formato | Uso |
|---|---|---|
| **DynamicAd** | 1080x1920 (9:16) | Reels, Stories, Shorts — lê scene_plan.json |
| **DynamicAdSquare** | 1080x1080 (1:1) | Feed — lê scene_plan.json |
| ColdBrewAd | 1080x1080 (1:1) | Template fixo original |

Renderizar vídeo dinâmico a partir de scene plan:

```bash
node pipeline/render-video.js <output.mp4> <scene_plan.json>
```

### Configuração rápida no .env

```bash
# Imagens IA (provider padrão)
KIE_API_KEY=sua-key-aqui

# Imagens stock (grátis)
PEXELS_API_KEY=sua-key-aqui
PIXABAY_API_KEY=sua-key-aqui
UNSPLASH_ACCESS_KEY=sua-key-aqui

# Narração
ELEVENLABS_API_KEY=sua-key-aqui

# SFX e Música (Pixabay cobre ambos)
# Mesma PIXABAY_API_KEY acima

# Opcional
OPENAI_API_KEY=sua-key-aqui        # DALL-E + OpenAI TTS
FREESOUND_API_KEY=sua-key-aqui     # SFX alternativo
```

### Como o sistema escolhe os providers

O módulo `media/providers.js` seleciona automaticamente o melhor provider disponível com base nas keys configuradas no `.env`:

```
Solicitação de imagem
    ↓
Tem KIE_API_KEY? → Usa Kie.ai Z-Image (padrão, IA)
    ↓ não
Tem OPENAI_API_KEY? → Usa DALL-E 3
    ↓ não
Tem STABILITY_API_KEY? → Usa Stability AI
    ↓ não
Nenhuma key de IA → Fallback para stock (Pexels/Unsplash/Pixabay)
```

```
Solicitação de narração/TTS
    ↓
Tem ELEVENLABS_API_KEY? → Usa ElevenLabs (melhor qualidade)
    ↓ não
Tem OPENAI_API_KEY? → Usa OpenAI TTS
    ↓ não
Tem MINIMAX_API_KEY? → Usa MiniMax
    ↓ não
Piper instalado? → Usa Piper (local, grátis, offline)
    ↓ não
Erro: nenhum provider disponível
```

Você pode forçar um provider específico passando `{ provider: 'nome' }`:

```javascript
const media = require('./media');

// Forçar provider específico
await media.image.generate('café', 'out.png', { provider: 'dalle' });
await media.tts.speak('Bom dia', 'out.mp3', { provider: 'elevenlabs' });

// Usar o padrão (automático)
await media.image.generate('café', 'out.png');
await media.sfx.fetch('pop sound', 'out.mp3');
await media.music.fetch('lo-fi piano', 'out.mp3');
```

No pipeline, os agents decidem automaticamente. Se você quiser usar um provider específico, mencione no prompt da campanha (ex: "usa DALL-E para os backgrounds" ou "narra com ElevenLabs").

---

### Fluxo de Geração de Vídeos

O sistema gera vídeos em 3 etapas: conceito criativo, scene plan, e renderização.

```
1. VIDEO AD SPECIALIST (Claude CLI)
   │
   │  Lê: research_results.json + knowledge files + campaign brief
   │  Gera: scene_plan.json com roteiro detalhado
   │
   ↓
2. SCENE PLAN (JSON)
   │
   │  Contém para cada cena:
   │  ├── tipo (hook, produto, benefit, flashback, cta)
   │  ├── timing (frame_inicio, frame_fim, duracao_frames)
   │  ├── texto overlay (texto, fonte, tamanho, animação)
   │  ├── paleta de cores da campanha
   │  ├── assets Remotion (produto via staticFile)
   │  └── descrição visual detalhada
   │
   ↓
3. REMOTION (renderização React → MP4)
   │
   │  render-video.js lê o scene_plan.json
   │  Passa como --props para o Remotion
   │  DynamicAd.tsx recebe as props e monta:
   │
   │  ┌─────────────────────────────┐
   │  │ <Sequence> Cena 1: Hook     │ → fundo escuro + texto bold
   │  │ <Sequence> Cena 2: Produto  │ → imagem real + glow + rings
   │  │ <Sequence> Cena 3: Benefit  │ → flood amber + sparkles
   │  │ <Sequence> Cena 4: CTA      │ → fundo claro + botão
   │  └─────────────────────────────┘
   │
   ↓
4. OUTPUT: ad_01.mp4, ad_02.mp4, etc.
```

Cada cena no JSON é mapeada para um tratamento visual:

| Tipo de Cena | Background | Elementos | Animação de Texto |
|---|---|---|---|
| `hook` | Escuro radial | SVG alarme ou produto | per-word fade-in |
| `produto` / `solution` | Azul frio + glow rings | Produto com glow e float | slide-up |
| `benefit` / `conexao` | Flood amber | Sparkles + personagem | per-word |
| `flashback` / `memoria` | Sépia desaturado + vinheta | Produto sutil | fade italic |
| `presente` / `gift` | Flash branco → escuro | Produto spring-pop + sparkles | per-word |
| `cta` | Claro (off-white) | Produto + botão pulsante | punch-in |

As composições disponíveis no Remotion:

| ID | Dimensões | Duração | Uso |
|---|---|---|---|
| `DynamicAd` | 1080x1920 (9:16) | 15s (450 frames) | Reels, Stories, Shorts |
| `DynamicAdSquare` | 1080x1080 (1:1) | 15s (450 frames) | Feed Instagram |
| `ColdBrewAd` | 1080x1080 (1:1) | 20s (600 frames) | Template fixo (fallback) |

O render escolhe a composição automaticamente baseado no aspect ratio do scene plan:
- `height > width` → DynamicAd (vertical)
- `height <= width` → DynamicAdSquare (quadrado)

---

## Supabase Setup

Ensure you have a Supabase project with:

1. A **storage bucket** named `campaign-uploads` set to **public**
2. The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured in `.env`

The Service Role Key is used because the pipeline runs server-side with no user session — it bypasses RLS to upload files directly.

---

## Troubleshooting

| Issue | Fix |
|---|---|
| `npm install` fails | Ensure Node.js v18+ is installed |
| Playwright render fails | Run `npx playwright install chromium` |
| Instagram publish returns "Cannot parse access token" | Ensure you are using a **Page Access Token** (not User Token) from the Graph API Explorer, and that the API host is `graph.facebook.com` |
| YouTube upload returns 401 | Refresh Token may have expired; regenerate via the OAuth Playground. If your Google Cloud app is in "Testing" mode, tokens expire every 7 days |
| Supabase upload 404 | Confirm the `campaign-uploads` bucket exists and is set to public in the Supabase dashboard |
| Redis connection fails | Verify `UPSTASH_REDIS_ENDPOINT` uses the `rediss://` protocol (with double s for TLS). Para Redis local: `docker run -d --name redis -p 6379:6379 redis:alpine` |
| Remotion render fails | Ensure `remotion-ad/` dependencies are installed (`cd remotion-ad && npm install`) |
| Kie.ai image timeout | A API é assíncrona — pode levar até 2 min. Verificar se `KIE_API_KEY` está válida |
| ElevenLabs 401 | Verificar se `ELEVENLABS_API_KEY` está correta e a conta tem créditos |
| Dynamic video identical to fixed | Verificar se o scene_plan.json está sendo passado ao render-video.js como segundo argumento |

---

## Começando do Zero

Se você clonou este repositório e quer rodar, siga estes passos:

### 1. Instalar dependências

```bash
npm install
cd remotion-ad && npm install && cd ..
npx playwright install chromium
```

### 2. Subir Redis (Docker)

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### 3. Criar o .env

```bash
cp .env.example .env
```

Preencha no `.env` pelo menos:

```
TAVILY_API_KEY=sua-key          # pesquisa de mercado (tavily.com)
SUPABASE_URL=sua-url            # hospedagem de mídia (supabase.com)
SUPABASE_SERVICE_ROLE_KEY=sua-key
```

Opcionais (mas recomendados):

```
KIE_API_KEY=sua-key             # imagens IA (kie.ai)
PEXELS_API_KEY=sua-key          # fotos grátis (pexels.com/api)
PIXABAY_API_KEY=sua-key         # fotos + música + SFX grátis (pixabay.com/api/docs)
ELEVENLABS_API_KEY=sua-key      # narração por voz (elevenlabs.io)
```

### 4. Rodar uma campanha

```bash
# Terminal 1 — worker
node pipeline/worker.js

# Terminal 2 — disparar campanha
node pipeline/orchestrator.js --file pipeline/payloads/dia_das_maes_2026.json
```

### 5. Renderizar vídeo avulso

```bash
node pipeline/render-video.js output.mp4 scene_plan.json
```

### 6. Ver providers configurados

```bash
npm run media:status
```

Pronto. O pipeline roda os 5 agentes em sequência e salva tudo em `outputs/`.
