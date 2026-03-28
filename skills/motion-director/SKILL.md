# Motion Director

Analisa o plano de cenas do Video Ad Specialist e produz um plano enriquecido com movimentação, diagramação e transições — baseado no conteúdo real das imagens, texto, tema e identidade da marca.

Roda **após** o Video Ad Specialist e **antes** do renderer.

---

## Arquivos de Referência — Ler Antes de Qualquer Decisão

| Arquivo | O que ensina |
|---|---|
| `skills/motion-director/cinematography-rules.md` | Tipos de movimento, intensidade por tipo de cena, regras de enquadramento |
| `skills/motion-director/layout-typography.md` | Posicionamento de texto, safe areas, legibilidade, tipografia |
| `skills/motion-director/pacing-by-mood.md` | Como definir ritmo e transições baseado no tom da campanha |
| `skills/motion-director/scene-type-presets.md` | Presets de movimento e layout por tipo de cena (hook, benefit, cta...) |
| `<project_dir>/knowledge/brand_identity.md` | Tom da marca, paleta, estilo visual |

---

## Inputs

| Campo | Fonte |
|---|---|
| `scene_plan.json` | Saída do Video Ad Specialist (`<output_dir>/video/scene_plan.json`) |
| Imagens das cenas | Paths definidos no `scene_plan.json` (campo `image`) |
| `brand_identity.md` | `<project_dir>/knowledge/brand_identity.md` |
| `campaign_brief` | Passado pelo worker no prompt |

---

## Processo — Passo a Passo

### Passo 1: Ler e entender o plano de cenas

Ler `scene_plan.json`. Para cada cena identificar:
- Tipo (`hook`, `product_showcase`, `benefit`, `social_proof`, `cta`)
- Texto do overlay — comprimento, tom, urgência
- Imagem associada — existe? É banner, foto de produto, foto de pessoa?

### Passo 2: Analisar cada imagem

Para cada imagem no plano, usar a ferramenta Read para visualizá-la e identificar:
- **Área de foco principal** — rosto, produto, elemento central. Onde está? (terço superior, inferior, esquerda, direita)
- **Espaço livre** — onde há área sem elementos importantes (onde o texto pode entrar)
- **Tom da imagem** — escura, clara, colorida, neutra
- **Tipo de conteúdo** — pessoa, produto, ambiente, abstrato
- **É banner/horizontal?** — sem Ken Burns se for

### Passo 3: Determinar movimento por cena

Consultar `cinematography-rules.md` e `scene-type-presets.md`. Para cada cena definir:
- `motion.type`: `zoom_in` / `zoom_out` / `pan_right` / `pan_left` / `static`
- `motion.intensity`: `aggressive` (zoom 1.0→1.20) / `moderate` (1.0→1.12) / `subtle` (1.0→1.06) / `static` (sem zoom)
- Regra: hook → aggressive, benefit → moderate, cta → static ou subtle

### Passo 4: Definir layout de texto por cena

Consultar `layout-typography.md`. Para cada cena definir:
- `text_layout.position`: `top` / `center` / `bottom`
- `text_layout.safe_margin`: distância mínima da borda (mínimo 100px no rodapé, 80px no topo)
- `text_layout.font_size`: baseado no comprimento do texto e tipo de cena
- `text_layout.background`: `dark_box` / `gradient` / `none`
- `text_layout.background_opacity`: 0.0 a 0.85
- `text_layout.max_width_pct`: % da largura do frame (default 85%)
- Regra: posicionar onde a imagem tem espaço livre — não sobrepor face ou produto central

### Passo 5: Definir transições

Consultar `pacing-by-mood.md`. Definir para cada cena:
- `transition_out`: `crossfade` / `cut` / `fade_black`
- `transition_duration`: 0.3s a 0.8s

### Passo 6: Escrever o plano enriquecido

Salvar em `<output_dir>/video/scene_plan_motion.json` no formato abaixo.

Após salvar, imprimir exatamente: `[MOTION_PLAN_DONE] <output_dir>/video/scene_plan_motion.json`

---

## Formato de Saída — `scene_plan_motion.json`

```json
{
  "video_length": 20,
  "format": "1080x1920",
  "pacing": "energetic",
  "audio": "path/to/narration.mp3",
  "scenes": [
    {
      "duration": 3,
      "image": "path/to/image.jpg",
      "image_type": "raw",
      "text_overlay": "Sua carreira começa agora",
      "motion": {
        "type": "zoom_in",
        "intensity": "aggressive",
        "zoom_start": 1.0,
        "zoom_end": 1.20
      },
      "text_layout": {
        "position": "top",
        "safe_margin": 100,
        "font_size": 88,
        "font_weight": "bold",
        "color": "#FFFFFF",
        "background": "dark_box",
        "background_opacity": 0.75,
        "max_width_pct": 85
      },
      "transition_out": "crossfade",
      "transition_duration": 0.4
    }
  ]
}
```

---

## Regras Críticas

- Nunca sobrepor texto sobre o rosto principal da imagem
- Nunca deixar texto sem safe area (mínimo 100px das bordas)
- Hook → topo da tela, movimento agressivo
- CTA → rodapé limpo, movimento suave ou estático
- Texto longo (>40 chars) → quebrar em linha, reduzir font_size
- Imagem escura → texto claro sem caixa / Imagem clara → texto com dark_box
- Banner/horizontal → sempre `image_type: banner`, sem Ken Burns
