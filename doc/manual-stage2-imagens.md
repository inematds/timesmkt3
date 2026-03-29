# Manual — Etapa 2: Imagens

## Visao geral

A segunda etapa gera as imagens estaticas da campanha (carousel, stories, banners). Um unico agente (Ad Creative Designer) consome o brief criativo e a narrativa para produzir visuais profissionais.

---

## Ad Creative Designer

**Skill:** `skills/ad-creative-designer/SKILL.md`

### O que faz
- Funcao **puramente visual** — nao escreve copy (texto vem do narrative.json)
- Seleciona layout por formato (Product Focus, Split, Lifestyle)
- Monta HTML + CSS com imagens e textos
- Renderiza PNG via Playwright (chromium headless)

### Inputs
| Fonte | O que usa |
|---|---|
| `creative/creative_brief.json` | `carousel_structure` com `conceito_visual` por slide, `approved_ctas` |
| `copy/narrative.json` | `carousel_texts`, `story_texts`, `headline` |
| `knowledge/brand_identity.md` | Cores, logo, tom visual |
| `assets/` | Imagens do produto/marca |

### Fontes de imagem (`image_source`)

| Valor | Alias (pt-BR) | Comportamento |
|---|---|---|
| `api` | — | Provider de IA do .env (`IMAGE_PROVIDER`) |
| `free` | `gratis` | Banco gratis (`FREE_IMAGE_PROVIDER`, default pexels) |
| `brand` | `marca` | Imagens de `assets/` e `imgs/` do projeto |
| `folder` | `pasta` | Pasta especifica via `image_folder` no payload |

### Regra fixa de imagens geradas por IA
Imagens geradas por modelos de IA **nao contem texto**. Texto e sempre sobreposto via HTML/CSS na montagem do ad.

### Outputs
| Arquivo | Descricao |
|---|---|
| `ads/layout.json` | Especificacao do design (consumido pelo Video Quick) |
| `ads/ad.html` + `styles.css` | HTML/CSS do anuncio |
| `ads/<task_name>_carousel_01.png` | Imagens renderizadas (1080x1080 ou 1080x1920) |

### Formatos por plataforma
| Formato | Dimensao | Uso |
|---|---|---|
| 1:1 | 1080x1080 | Instagram feed, Facebook feed |
| 9:16 | 1080x1920 | Stories, Reels, TikTok, Shorts |
| 16:9 | 1920x1080 | YouTube thumbnail, Facebook video |

---

## Gate interno de imagens

Quando imagens sao geradas via API, o worker emite `[IMAGE_APPROVAL_NEEDED]` para aguardar confirmacao. O bot v3 auto-aprova este gate interno (escreve `imgs/approved.json`). Isso e separado da aprovacao de stage.

## Aprovacao 2

O bot envia ao usuario:
- Imagens geradas como fotos no Telegram (streaming — cada imagem assim que fica pronta)
- `layout.json` como referencia

O usuario pode:
- **Aprovar** — avanca para Etapa 3
- **Pedir ajuste** — re-gera imagens especificas
- **Rejeitar** — campanha para

---

## Sinal emitido

`[STAGE2_IMAGE_READY] <output_dir> <image_path>` — para cada imagem gerada (streaming ao bot).
