# Manual — Etapa 1: Estrategia & Narrativa

## Visao geral

A primeira etapa gera a base estrategica de toda a campanha. Tres agentes rodam em sequencia e produzem:
1. Pesquisa de mercado (Research Agent)
2. Brief criativo com angulo estrategico (Diretor Criativo)
3. Narrativa central da campanha (Copywriter)

Ao final, o resultado passa pela **Aprovacao 1** — o usuario avalia o brief e a narrativa antes de prosseguir.

---

## Research Agent

**Skill:** `skills/marketing-research-agent/SKILL.md`

### O que faz
- Executa 5 pesquisas via Tavily AI SDK:
  1. Tendencias do setor
  2. Analise de concorrentes
  3. Perfil de audiencia
  4. Hooks e angulos criativos
  5. Topicos virais relacionados

### Inputs
| Fonte | O que usa |
|---|---|
| `knowledge/brand_identity.md` | Setor, tom de voz, publico |
| `knowledge/product_campaign.md` | Produto, pontos de venda, ideias |
| Payload | `task_name`, `language` |

### Outputs
| Arquivo | Descricao |
|---|---|
| `research_results.json` | Dados estruturados (consumido pelos agentes seguintes) |
| `research_brief.md` | Relatorio legivel com graficos Mermaid |
| `interactive_report.html` | Dashboard interativo com Chart.js |

### Configuracao
- Requer `TAVILY_API_KEY` no `.env`
- Script: `pipeline/tavily-search.js`

---

## Diretor Criativo

**Skill:** `skills/creative-director/SKILL.md`

### O que faz
- Le a pesquisa + identidade da marca + campanha do produto
- Escolhe **UM angulo estrategico** (intersecao de desejo do publico + autenticidade da marca)
- Define direcao visual: mood, cores, estilo fotografico, tipografia
- Define guardrails (o que evitar)
- Escreve mensagens-chave por plataforma

### Inputs
| Fonte | O que usa |
|---|---|
| `research_results.json` | Tendencias, audiencia, hooks |
| `knowledge/brand_identity.md` | Voz, valores, CTAs aprovados |
| `knowledge/product_campaign.md` | Features, selling points |

### Outputs
| Arquivo | Destino |
|---|---|
| `creative/creative_brief.json` | Consumido por Designer, Copywriter, Video |
| `creative/creative_brief.md` | Exibido na Aprovacao 1 |

### Campos do creative_brief.json
```json
{
  "campaign_angle": "string — angulo escolhido",
  "visual_direction": {
    "mood": "string",
    "colors": ["#hex", ...],
    "photography_style": "string",
    "typography": "string"
  },
  "key_messages": { "instagram": "...", "youtube": "..." },
  "approved_ctas": ["CTA 1", "CTA 2"],
  "guardrails": ["evitar X", "nao usar Y"],
  "carousel_structure": [
    { "slide": 1, "conceito_visual": "descricao da imagem" }
  ]
}
```

---

## Copywriter (Narrador da Campanha)

**Skill:** `skills/copywriter-agent/SKILL.md`

### O que faz
- Cria a **narrativa central** — nao copy de plataforma (isso e Etapa 4)
- Arco emocional: hook → tensao → solucao → prova → CTA
- Headlines, frases-chave, textos para carousel/stories
- Roteiro de video (se aplicavel)

### Inputs
| Fonte | O que usa |
|---|---|
| `creative/creative_brief.json` | Angulo, direcao, guardrails |
| `research_results.json` | Dados de audiencia |
| `knowledge/brand_identity.md` | Tom de voz, CTAs |

### Outputs
| Arquivo | Descricao |
|---|---|
| `copy/narrative.json` | Narrativa estruturada (headlines, key_phrases, emotional_arc, CTAs) |
| `copy/narrative.md` | Narrativa legivel |

### Campos do narrative.json
```json
{
  "headline": "string",
  "subheadline": "string",
  "key_phrases": ["frase 1", "frase 2"],
  "emotional_arc": [
    { "stage": "hook", "text": "..." },
    { "stage": "tension", "text": "..." },
    { "stage": "solution", "text": "..." },
    { "stage": "proof", "text": "..." },
    { "stage": "cta", "text": "..." }
  ],
  "carousel_texts": ["texto slide 1", "texto slide 2"],
  "story_texts": ["texto story 1", "texto story 2"],
  "video_script": "roteiro narrado"
}
```

---

## Aprovacao 1

O bot envia ao usuario:
- `creative_brief.md` — brief visual e estrategico
- `narrative.md` — narrativa da campanha

O usuario pode:
- **Aprovar** — avanca para Etapa 2
- **Pedir ajuste** — agente refaz com feedback
- **Rejeitar** — campanha para

---

## Sinal emitido

`[STAGE1_DONE] <output_dir>` — worker emite quando todos os 3 agentes completam.
