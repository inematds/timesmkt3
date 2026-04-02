# Scene Plan — Mudanças de Prompt (Opus → Sonnet)

Análise dos commits `820e870` → `7da25ac` → `1cad32b`

## O que mudou (3 commits)

### 1. 820e870 — Opus → Sonnet no scene plan

- Antes: Scene plan rodava com Opus (modelo mais caro/lento)
- Depois: Roda com Sonnet
- Photography Director continua com Opus (decisão criativa)

### 2. 7da25ac + 1cad32b — Prompt reduzido ~70%

#### O que foi REMOVIDO

| Seção removida | O que fazia |
|---|---|
| "STRICT RULES — DO NOT OVERRIDE" | 8 linhas repetindo "siga o photography plan" |
| "Phase A/B/C/D" | 4 fases de planejamento (analisar, EDL, imagens, motion) |
| "CRITICAL RULES" (bloco grande) | 12 regras detalhadas (min 25 cuts, duração, etc.) |
| "AUDIO-VISUAL SYNC" | 6 linhas sobre sincronia narração/cena |
| "TYPOGRAPHY — MAGAZINE COVER" | 8 linhas com fontes, pesos, line-height |
| "GLOBAL VIDEO SETTINGS" explicados | Parágrafos sobre color_grading, film_grain, shake |
| "ADVANCED SCENE FIELDS" | HUD text, speed ramps, lens transitions |
| STEP 1-5 com leitura de arquivos | Mandava o CLI ler 5+ arquivos do disco |
| photographyNote (resumo textual) | Substituído pela injeção direta do JSON compactado |

#### O que foi ADICIONADO/MANTIDO

| O que ficou | Como |
|---|---|
| Photography plan | Injetado direto no prompt como JSON compactado (14KB → 4KB) |
| Schema do JSON | Exemplo inline com todos os campos (color_grading, film_grain, etc.) |
| Regras essenciais | 5 linhas compactas (25-40 cuts, image_has_text, posição, motion) |
| Áudio/música | Mesmas instruções |

## Ganhos

- ~60% mais rápido (Sonnet vs Opus)
- ~70% menos tokens no prompt (menos custo)
- Sem leitura de disco pelo CLI — photography plan já vem no prompt
- Timeout de 900s → 600s

## Perdas potenciais

- **Regras de tipografia detalhadas** — fontes específicas por contexto (Oswald/Playfair/Poppins), peso 900 vs 700, line-height 1.0 vs 1.15. Agora só tem font_size ≥60px
- **Audio-visual sync** — instrução de sincronia narração/cena (~2.5 palavras/s pt-BR) foi removida
- **Fases de planejamento** — o "pense em etapas" (Phase A→D) sumiu, agora é direto
- **Regras avançadas** — HUD text, speed ramps, lens transitions não são mais mencionados no prompt (dependem do Sonnet "lembrar" do SKILL.md... que ele não lê mais)
- **Leitura do SKILL.md** — antes o prompt mandava ler skills/video-editor-agent/SKILL.md. Agora não. Sonnet opera só com o que recebe no prompt
- **Guardrails detalhados** — regras como "cuts < 0.8s sem texto", "min 1.2s para texto" foram simplificadas

## Resumo

Trocou profundidade criativa por velocidade. O Photography Director (Opus) continua fazendo o trabalho pesado de decisão visual. O scene plan virou "execução mecânica" pelo Sonnet — mais rápido e barato, mas com menos nuance tipográfica e sem as regras avançadas dos componentes Remotion.
