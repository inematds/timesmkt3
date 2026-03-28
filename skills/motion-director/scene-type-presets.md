# Scene Type Presets — Motion Director

Combinações prontas de movimento + layout por tipo de cena. Usar como ponto de partida e ajustar com base na análise da imagem real.

---

## hook

**Objetivo:** Parar o scroll nos primeiros 2 segundos.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `zoom_in` |
| `motion.intensity` | `aggressive` |
| `motion.zoom_start` | 1.0 |
| `motion.zoom_end` | 1.20 |
| `text_layout.position` | `top` |
| `text_layout.font_size` | 96 (ajustar por comprimento) |
| `text_layout.background` | `none` ou `dark_box` se imagem clara |
| `text_layout.background_opacity` | 0.70 |
| `transition_out` | `cut` ou `crossfade` 0.3s |

**Ajustes obrigatórios:**
- Se houver rosto no terço superior → mover texto para `bottom`
- Se texto > 30 chars → reduzir font_size para 80 e adicionar `\n`

---

## tension / problem

**Objetivo:** Criar desconforto emocional — o espectador se identifica com o problema.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `zoom_in` ou `pan_left` |
| `motion.intensity` | `aggressive` |
| `text_layout.position` | `top` ou `center` |
| `text_layout.font_size` | 80 |
| `text_layout.background` | `dark_box` |
| `text_layout.background_opacity` | 0.75 |
| `transition_out` | `crossfade` 0.4s |

---

## product_showcase

**Objetivo:** Revelar o produto com clareza e destaque.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `zoom_out` ou `pan_right` |
| `motion.intensity` | `moderate` |
| `motion.zoom_start` | 1.12 |
| `motion.zoom_end` | 1.0 |
| `text_layout.position` | `bottom` |
| `text_layout.font_size` | 72 |
| `text_layout.background` | `gradient` |
| `text_layout.background_opacity` | 0.60 |
| `transition_out` | `crossfade` 0.4s |

**Ajustes obrigatórios:**
- Produto no centro da imagem → texto no `bottom`, nunca `center`
- Produto lateral → texto no lado oposto

---

## benefit / solution

**Objetivo:** Entregar o valor de forma clara e crível.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `zoom_out` |
| `motion.intensity` | `moderate` |
| `text_layout.position` | `bottom` |
| `text_layout.font_size` | 68 |
| `text_layout.background` | `gradient` |
| `text_layout.background_opacity` | 0.55 |
| `transition_out` | `crossfade` 0.5s |

---

## social_proof

**Objetivo:** Mostrar resultado real, comunidade, credibilidade.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `pan_right` |
| `motion.intensity` | `subtle` |
| `text_layout.position` | `bottom` |
| `text_layout.font_size` | 64 |
| `text_layout.background` | `dark_box` |
| `text_layout.background_opacity` | 0.65 |
| `transition_out` | `crossfade` 0.5s |

**Ajuste:** Se imagem mostrar rosto → texto no bottom com safe area 140px.

---

## cta

**Objetivo:** Direcionar a ação. Clareza acima de tudo.

| Campo | Valor padrão |
|---|---|
| `motion.type` | `static` |
| `motion.intensity` | `static` |
| `text_layout.position` | `bottom` |
| `text_layout.font_size` | 80 |
| `text_layout.font_weight` | `bold` |
| `text_layout.background` | `dark_box` |
| `text_layout.background_opacity` | 0.80 |
| `transition_out` | `fade_black` 0.6s |

**Regras:**
- CTA deve ter +1s adicional de duração — dar tempo para ler e agir
- Texto do CTA máximo 6 palavras — se maior, quebrar em 2 linhas
- Nunca movimento agressivo no CTA — confunde o espectador
