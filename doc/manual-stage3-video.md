# Manual — Etapa 3: Video

## Visao geral

A terceira etapa produz videos da campanha. Dois agentes **independentes** podem rodar:

- **Video Quick** (default) — sempre roda, a menos que `skip_video: true`
- **Video Pro** (sob demanda) — roda quando `video_mode: 'pro'` ou `video_pro: true`

Ambos podem rodar na mesma campanha simultaneamente.

---

## Video Quick

**Skill:** `skills/video-quick/SKILL.md`

### O que faz
- Slideshow rapido (10-20s) usando imagens do Ad Creative Designer
- 4-6 cenas com 2-4 segundos cada
- Transicoes simples, Ken Burns, text overlays
- Narracao opcional (ElevenLabs)
- Musica de fundo opcional

### Renderer
- **ffmpeg** (`pipeline/render-video-ffmpeg.js`)
- Rapido, qualidade basica

### Inputs
| Fonte | O que usa |
|---|---|
| `ads/*.png` | Imagens do Designer como slides |
| `copy/narrative.json` | Textos para overlay |
| ElevenLabs API (opcional) | Narracao |
| `assets/music/` (opcional) | Musica de fundo |

### Outputs
| Arquivo | Descricao |
|---|---|
| `video/<task_name>_video_01_scene_plan.json` | Plano de cenas |
| `video/<task_name>_video_01.mp4` | Video renderizado |

### Skip em rerun
Se `skip_completed: true` e o video final ja existe, pula a geracao.

---

## Video Pro

**Skill:** `skills/video-editor-agent/SKILL.md` (mode: pro)

### O que faz
Producao profissional em 4 fases:

#### FASE 1 — Roteiro + Rascunho
- Agente Claude cria scene plan com 30-50 cortes
- Narracao obrigatoria (ElevenLabs)
- Musica obrigatoria
- Frameworks narrativos (AIDA, PAS, Hero's Journey)
- Render de rascunho (ffmpeg, fundos coloridos) para aprovacao rapida

#### FASE 2 — Imagens reais (se `image_source: 'api'`)
- Gera imagens via API para cada cena unica do roteiro
- Deduplicacao de prompts (cenas com mesmo prompt reutilizam mesma imagem)
- Integra imagens no scene plan

#### FASE 3 — Aprovacao do roteiro
- Worker emite `[VIDEO_APPROVAL_NEEDED]`
- Bot auto-aprova (ou usuario revisa via Telegram)
- Timeout: 30 minutos

#### FASE 4 — Render final
- **Remotion** (`pipeline/render-video-remotion.js`) — default
- Fallback automatico para ffmpeg se Remotion falhar
- Timeout: 10 minutos por video

### Renderer — Remotion

O adapter `render-video-remotion.js` converte o scene plan do Video Pro para props do Remotion:

```
Scene Plan (Video Pro) → Adapter → Remotion Props → DynamicAd → .mp4
```

#### Mapeamento de campos
| Scene Plan | Remotion Prop |
|---|---|
| `motion.type` | `camera_effect` (ken-burns-in, pan-right, drift, etc.) |
| `text_overlay` | `text_overlay.texto` |
| `text_layout.font_size` | `text_overlay.tamanho` |
| `text_layout.font_weight` | `text_overlay.peso` |
| `text_layout.color` | `text_overlay.cor` |
| `text_layout.position` | `text_overlay.posicao` |
| `text_layout.font_family` | `text_overlay.font_family` (normalizado via FONT_MAP) |
| `text_animation` | `text_overlay.animacao` (normalizado via ANIM_MAP) |
| `transition` | `transition` (normalizado via TRANSITION_MAP) |
| `color_grading` | `color_grading` (brightness, contrast, saturate, sepia, hueRotate) |
| `text_band` | `text_band` (style, color, opacity, height) |
| `lower_third` | `lower_third` (text, subtext, style) |
| `subtitles` | `subtitles` (array de segmentos com startFrame/endFrame) |
| `cta_style` | `cta_style` (solid, glass, outline, pill) |

### Inputs
| Fonte | O que usa |
|---|---|
| `creative/creative_brief.json` | Angulo, direcao visual |
| `copy/narrative.json` | Roteiro, arco emocional |
| `knowledge/brand_identity.md` | Cores, tom visual |
| `skills/video-art-direction/SKILL.md` | 12 presets de estilo visual |
| `skills/typography-on-image/SKILL.md` | Regras de tipografia sobre imagem |

### Outputs
| Arquivo | Descricao |
|---|---|
| `video/<task_name>_video_01_scene_plan_motion.json` | Plano de cenas enriquecido |
| `video/<task_name>_video_01_draft.mp4` | Rascunho (fundos coloridos) |
| `video/<task_name>_video_01.mp4` | Video final |

### Notificacoes no Telegram
O worker emite sinais de progresso:
- `[VIDEO_PRO_PROGRESS] plan_ready` — roteiro criado
- `[STAGE3_DRAFT_READY]` — rascunho renderizado (video enviado ao chat)
- `[VIDEO_PRO_PROGRESS] images_start` — gerando imagens
- `[VIDEO_PRO_PROGRESS] render_start` — renderizando final

---

## Video Art Direction

**Skill:** `skills/video-art-direction/SKILL.md`

12 presets de estilo visual usados por ambos os agentes de video:

| Preset | Mood | Uso tipico |
|---|---|---|
| Neon Futurista | Tech, inovacao | SaaS, apps |
| Premium Minimal | Elegancia, luxo | Moda, joias |
| Energetico | Energia, acao | Fitness, esporte |
| Cinematico | Narrativo, emocional | Storytelling |
| Editorial | Sofisticacao | Revistas, moda |
| Bold | Impacto, contraste | Lancamentos |
| Organico | Natural, suave | Saude, bem-estar |
| Retro | Nostalgia | Vintage, cultura |
| Corporate | Profissional | B2B, consultoria |
| Playful | Divertido, jovem | Gen Z, social |
| Documentary | Autenticidade | Depoimentos |
| Glitch | Digital, disruptivo | Arte, musica |

---

## Typography on Image

**Skill:** `skills/typography-on-image/SKILL.md`

Guia de decisao para texto sobre imagens:
- Quando usar texto grande vs pequeno (por tipo de cena)
- Onde posicionar baseado na composicao (regra dos tercos)
- Quando sobrepor vs quando nao (protecao necessaria)
- 6 combinacoes de fonte por estilo (editorial, tech, bold, elegante, jovem, corporativo)
- Regras de contraste e legibilidade
- Adaptacao por formato (9:16, 1:1, 16:9)

---

## Aprovacao 3

O bot envia ao usuario:
- Video(s) renderizado(s) no Telegram
- Selecao de plataformas para Etapa 4

O usuario pode:
- **Aprovar** — avanca para Etapa 4
- **Pedir ajuste** — feedback textual, agente refaz o roteiro
- **Rejeitar** — pula video
