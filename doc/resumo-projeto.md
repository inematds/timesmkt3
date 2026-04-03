# timesmkt3 v4.2.8 — Resumo do Projeto

> INEMA Time de Agentes de Marketing

Sistema de automacao de conteudo para marketing digital, alimentado por IA. Usa **13+ agentes especializados** coordenados por um bot Telegram em um pipeline de 5 etapas com aprovacoes.

## Pipeline — 5 Estagios

| Etapa | Agentes | Aprovacao |
|---|---|---|
| 1. Estrategia & Narrativa | Research + Diretor Criativo + Copywriter | Brief + narrativa |
| 2. Imagens | Ad Creative Designer | Imagens estaticas |
| 3. Video | Video Quick (default) + Video Pro (sob demanda) — independentes | Video |
| 4. Plataformas | Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn | Copy nativo |
| 5. Distribuicao | Distribution Agent | Guardar, agendar, publicar |

## Como funciona

- **Bot Telegram** (`telegram/bot.js`) controla o fluxo e coleta aprovacoes
- **Orchestrator** (`pipeline/orchestrator.js`) enfileira jobs por etapa via BullMQ
- **Worker** (`pipeline/worker.js`) executa agentes como subprocessos Claude CLI
- Cada agente le seu spec em `skills/` + knowledge files do projeto em `prj/<projeto>/knowledge/`

## Agentes

| # | Agente | Funcao | Stage |
|---|---|---|---|
| 1 | Research Agent | Pesquisa tendencias, concorrentes, audiencia via Tavily | 1 |
| 2 | Diretor Criativo | Define angulo estrategico + direcao visual | 1 |
| 3 | Copywriter | Cria narrativa central da campanha (nao copy de plataforma) | 1 |
| 4 | Ad Creative Designer | Cria imagens estaticas (HTML -> PNG via Playwright) | 2 |
| 5 | Video Quick | Slideshow rapido com imagens do Designer (10-20s, ffmpeg) | 3 |
| 6 | Video Pro | Producao profissional com rascunho + aprovacao + final (30-60s, Remotion) | 3 |
| 7 | Instagram Agent | Copy nativo: carousel + stories + reels | 4 |
| 8 | YouTube Agent | Titulo SEO + descricao + tags + shorts | 4 |
| 9 | TikTok Agent | Video curto 9:16 + caption + hook strategy | 4 |
| 10 | Facebook Agent | Feed + stories + reels + video 16:9 | 4 |
| 11 | Threads Agent | Posts conversacionais (max 500 chars) | 4 |
| 12 | LinkedIn Agent | Post profissional + carousel PDF | 4 |
| 13 | Distribution Agent | Guardar (Supabase) + Agendar (Publish MD) + Publicar (APIs) | 5 |

## Stack

| Ferramenta | Uso |
|---|---|
| BullMQ + Redis | Fila de jobs e orquestracao |
| Tavily AI SDK | Pesquisa de mercado |
| Playwright | Render HTML -> PNG |
| ffmpeg | Render de video basico (Video Quick) |
| Remotion | Render de video profissional (Video Pro) — 15 componentes |
| Supabase | Hosting de midia |
| Instagram Graph API | Publicacao Instagram |
| YouTube Data API | Publicacao YouTube |
| Threads API | Publicacao Threads |

## Remotion — Componentes de Video (v4.2.8)

O renderer Remotion (`remotion-ad/`) conta com 15 componentes para producao profissional:

| Componente | Funcao |
|---|---|
| DynamicAd | Composicao principal — monta cenas, audio, subtitles, progress bar |
| DynamicScene | Cena dinamica — resolve tipo, camera, overlay, texto, efeitos |
| CameraMotion | 12 efeitos de camera (ken-burns, pan, drift, parallax, push-in, breathe...) + color grading |
| TextOverlay | 11 animacoes de texto (fade, slide, per-word, punch-in, typewriter, blur-in...) |
| TextBackgroundBand | Faixa localizada atras do texto (gradient, solid, blur, glass) |
| CTAButton | Botao CTA com 4 estilos (solid, glass, outline, pill) |
| LowerThird | Barra inferior com info da marca (bar, pill, glass, minimal) |
| Subtitles | Legendas sincronizadas (default, bold, karaoke, minimal) |
| ParticleEffects | Particulas decorativas (bokeh, dust, sparkle, glitch) |
| SplitScreen | Tela dividida antes/depois (horizontal, vertical) |
| ProgressBar | Barra de progresso estilo stories (stories, line, dots) |
| KineticText | Tipografia cinetica (grow, wave, stagger-scale, rotate-in, elastic, slam) |
| ProductImage | Imagem de produto com animacao de entrada e glow |
| SceneBackgrounds | Fundos solidos, gradientes, glow rings, flash, vignette |
| SVGIcons | Icones decorativos (sparkle burst, alarm clock) |

### 8 fontes Google carregadas

Inter, Montserrat, Playfair Display, Oswald, Space Grotesk, Poppins, Raleway, Bebas Neue

### 5 tipos de transicao entre cenas

crossfade (default), fade_black, slide_left, slide_right, wipe

## Projetos

Organizados em `prj/`. Cada projeto tem:
- `assets/` — imagens e midia do produto
- `knowledge/` — brand identity, campanha, guidelines de plataforma
- `outputs/` — entregaveis gerados (research, ads, copy, video, platforms, logs)

## Aprovacoes

3 modos configuraveis por etapa:
- **humano** (padrao) — via Telegram, usuario aprova manualmente
- **auto** — avanca sozinho sem aprovacao
- **agente** — agente revisor IA decide automaticamente

## Comandos do Bot

| Comando | Funcao |
|---|---|
| `/nova` | Criar nova campanha |
| `/status` | Status do pipeline atual |
| `/rerun <campanha> <etapas>` | Reprocessar etapas de campanha existente |
| `/help` | Ajuda |

## Skills (specs de agente)

| Skill | Arquivo |
|---|---|
| Research Agent | `skills/marketing-research-agent/SKILL.md` |
| Creative Director | `skills/creative-director/SKILL.md` |
| Copywriter | `skills/copywriter-agent/SKILL.md` |
| Ad Creative Designer | `skills/ad-creative-designer/SKILL.md` |
| Video Quick | `skills/video-quick/SKILL.md` |
| Video Editor (Pro) | `skills/video-editor-agent/SKILL.md` |
| Video Art Direction | `skills/video-art-direction/SKILL.md` |
| Video Composition | `skills/video-composition/SKILL.md` |
| Typography on Image | `skills/typography-on-image/SKILL.md` |
| Distribution Agent | `skills/distribution-agent/SKILL.md` |
| Orchestrator | `skills/orchestrator/SKILL.md` |
| Agente Revisor | `skills/agente-revisor/SKILL.md` |
