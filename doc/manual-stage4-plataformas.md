# Manual — Etapa 4: Plataformas

## Visao geral

A quarta etapa adapta a narrativa e os visuais da campanha em **conteudo nativo** para cada plataforma selecionada. Cada agente e especialista na sua plataforma e gera copy, formatacao e recomendacoes de agendamento.

So rodam os agentes cujas plataformas estao em `platform_targets` do payload. A selecao pode ser alterada pelo usuario na aprovacao da Etapa 3.

---

## Inputs comuns a todos os agentes

| Fonte | O que extrai |
|---|---|
| `copy/narrative.json` | Narrativa, headlines, key_phrases, emotional_arc, CTAs |
| `creative/creative_brief.json` | Angulo, direcao visual, guardrails |
| `knowledge/brand_identity.md` | Voz, CTAs aprovados, hashtags, emojis |
| `knowledge/platform_guidelines.md` | Regras por plataforma |
| `research_results.json` | Tendencias, horarios, audiencia |
| `ads/*.png` | Imagens geradas (carousel, stories) |
| `video/*.mp4` | Videos gerados |

---

## Instagram Agent

**Funcao:** Copy nativo para Instagram (carousel + stories + reels)

### Gera
- **Carousel:** caption principal (hook + beneficio + CTA + hashtags), slide_captions por slide
- **Stories:** sequencia com image, text_overlay, CTA, sticker interativo
- **Reels:** caption curto + hashtags + sugestao de audio
- **Scheduling:** dias/horarios da pesquisa, ordem de postagem

### Output
`platforms/instagram.json` + `platforms/instagram.md`

### Formatos
| Tipo | Dimensao |
|---|---|
| Feed (carousel) | 1:1 (1080x1080) |
| Stories | 9:16 (1080x1920) |
| Reels | 9:16 (1080x1920) |

---

## YouTube Agent

**Funcao:** Copy otimizado para YouTube (video + shorts)

### Gera
- **Video longo:** title SEO (60-70 chars), description, tags (8-12), thumbnail_text
- **Shorts:** titulo e descricao separados
- **Scheduling:** long-form primeiro, Shorts 24h depois

### Output
`platforms/youtube.json` + `platforms/youtube.md`

### Formatos
| Tipo | Dimensao |
|---|---|
| Video | 16:9 (1920x1080) |
| Shorts | 9:16 (1080x1920) |
| Thumbnail | 16:9 (1280x720) |

---

## TikTok Agent

**Funcao:** Copy nativo para TikTok (video curto)

### Gera
- **Video:** caption (max 150 chars), hashtags (max 5), sound suggestion
- **Hook strategy:** o que acontece nos primeiros 2 segundos
- **Text overlays:** sugestoes de texto no video

### Output
`platforms/tiktok.json` + `platforms/tiktok.md`

### Formatos
| Tipo | Dimensao |
|---|---|
| Video | 9:16 (1080x1920) |

---

## Facebook Agent

**Funcao:** Copy nativo para Facebook (feed + stories + reels + video)

### Gera
- **Feed post:** imagem ou video + caption longo (storytelling)
- **Stories:** sequencia vertical
- **Reels:** video 9:16 + caption
- **Video:** 16:9 + titulo + descricao

### Output
`platforms/facebook.json` + `platforms/facebook.md`

### Formatos
| Tipo | Dimensao |
|---|---|
| Feed | 1:1 ou 16:9 |
| Stories | 9:16 |
| Reels | 9:16 |
| Video | 16:9 |

---

## Threads Agent

**Funcao:** Copy nativo para Threads (texto conversacional)

### Gera
- **Post principal:** max 500 chars, com/sem imagem
- **Thread follow-up:** contexto extra (NAO repete o principal)
- **Post standalone:** outro angulo para outro dia
- **Scheduling:** dias/horarios

### Output
`platforms/threads.json` + `platforms/threads.md`

---

## LinkedIn Agent

**Funcao:** Copy profissional para LinkedIn

### Gera
- **Post profissional:** hook na primeira linha, insight + valor + CTA
- **Carousel document (PDF):** se aplicavel
- **Article:** thought leadership, se o angulo justifica
- **Scheduling:** Ter-Qui, 8-10h

### Output
`platforms/linkedin.json` + `platforms/linkedin.md`

### Formatos
| Tipo | Dimensao |
|---|---|
| Post imagem | 1200x627 ou 1:1 |
| Carousel PDF | multi-pagina |

---

## Retrabalho (rework)

Cada agente pode pedir ajustes ao Designer ou Video via dois campos no JSON:
- `rework_needed`: descricao textual do problema
- `video_format_request`: pedido especifico de formato
  ```json
  { "format": "9:16", "duration": "15-30s", "style": "quick cuts, hook first 2s" }
  ```

O Distribution Agent (Etapa 5) loga warnings de rework no Publish MD.

---

## Aprovacao 4

O bot envia ao usuario:
- Resumo do copy gerado por plataforma
- Links para os arquivos `.md` de cada plataforma

O usuario pode:
- **Aprovar** — avanca para Etapa 5
- **Pedir ajuste** — feedback especifico por plataforma
- **Rejeitar** — exclui plataformas especificas
