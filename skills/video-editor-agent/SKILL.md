# Video Editor Agent — Diretor de Edição

> Agente que pensa como um editor de vídeo profissional. Produz planos de edição com 30-50+ cortes rápidos em 60 segundos, com ritmo variado, transições diversas e pacing sincronizado com narração.

---

## Quando Usar

- Produção de vídeo promocional para qualquer campanha
- Geração de Reels, Stories, Shorts, TikTok (formato 9:16)
- Sempre que o pipeline precisar de vídeo de alta qualidade com edição profissional

---

## CRÍTICO: Ler Arquivos Antes de Tudo

Antes de qualquer decisão criativa, leia **todos** estes arquivos:

1. `<project_dir>/knowledge/brand_identity.md` — tom, cores, CTAs, identidade visual
2. `<project_dir>/knowledge/product_campaign.md` — produto, features, ângulos
3. `<output_dir>/research_results.json` — inteligência de mercado (se existir)
4. `<output_dir>/creative/creative_brief.json` — ângulo criativo, direção visual, mensagens-chave
5. `skills/video-composition/advanced-composition-reference.md` — referência de composição

---

## Processo em 4 Fases

### FASE A: Análise e Roteiro (Script Planning)

**Objetivo:** Entender o contexto completo e criar um roteiro narrativo.

1. Leia TODOS os arquivos listados acima
2. Liste os assets visuais disponíveis em `<project_dir>/assets/`:
   - Rode: `ls -la <project_dir>/assets/*.{jpg,jpeg,png,webp,mp4} 2>/dev/null`
   - Rode: `ls -la <project_dir>/assets/music/*.{mp3,wav,aac,m4a} 2>/dev/null`
   - Anote dimensões de cada imagem com: `identify <path>` ou `file <path>`
3. Selecione o **framework narrativo** baseado no objetivo da campanha:

| Framework | Duração ideal | Quando usar |
|-----------|--------------|-------------|
| AIDA | 30-45s | Lançamento de produto, conversão direta |
| PAS | 45-60s | Produto que resolve dor específica |
| Hero's Journey | 60s | Marca aspiracional, comunidade, educação |
| Before/After | 30-45s | Transformação, resultados, cases |
| Edu-Tainment | 60s | Conteúdo educativo, dados, estatísticas |

4. Escreva o **narration_script** completo:
   - 50-60 segundos de fala natural em pt-BR
   - Tom alinhado com brand_identity.md
   - Cada frase vira um ou mais cortes
   - Hook nos primeiros 3 segundos (OBRIGATÓRIO)
   - CTA claro nos últimos 5 segundos

5. Defina o **mood** geral:

| Mood | BPM | Cortes/min | Duração média |
|------|-----|-----------|---------------|
| energetic | 120-140 | 30-60 | 1-2s |
| lifestyle | 80-100 | 17-30 | 2-3.5s |
| premium | 60-80 | 12-20 | 3-5s |
| emotional | 70-90 | 10-16 | 4-6s |
| festive | 100-120 | 20-40 | 1.5-3s |

---

### FASE B: Edit Decision List (EDL) — 30-50 cortes

**Objetivo:** Criar a lista de cortes cena a cena, como um editor profissional.

**Budget de cortes OBRIGATÓRIO:**
- Vídeo 60s mood energetic: **mínimo 30 cortes, máximo 50**
- Vídeo 60s mood premium: **mínimo 15 cortes, máximo 25**
- Vídeo 60s mood emotional: **mínimo 12 cortes, máximo 20**
- Vídeo 30s: divida os valores acima por 2

**Distribuição por seção (Hero's Journey 60s como exemplo):**

| Seção | Tempo | Cortes | Duração/corte | Energia |
|-------|-------|--------|---------------|---------|
| HOOK | 0-6s | 5-8 | 0.5-1.5s | 5 (máxima) |
| PROBLEMA | 6-18s | 6-8 | 1-2s | 3-4 |
| SOLUÇÃO | 18-38s | 10-15 | 1-3s | 4-5 (crescendo) |
| PROVA | 38-52s | 6-10 | 1.5-3s | 4 |
| CTA | 52-60s | 3-5 | 2-4s | 3 (hold firme) |

**Regras de edição profissional (OBRIGATÓRIAS):**

1. **Nunca mesmo motion 2x seguidas:** Se corte N usa `zoom_in`, corte N+1 DEVE ser diferente
2. **Nunca mesmo text_position 3x seguidas:** Máximo 2 consecutivas iguais
3. **Padrões rítmicos:** Varie duração: short-short-long (1s-1s-3s), short-long-short (0.5s-2.5s-1s)
4. **Curva de energia:** Hook alto → dip no problema → build na solução → peak na prova → hold no CTA
5. **Primeiro corte ≤ 1.5s:** Hook sempre rápido
6. **Último corte ≥ 3s:** CTA precisa de tempo para ser lido
7. **Sem texto em cortes < 0.8s:** Cortes muito rápidos são visuais puros (text_overlay vazio)
8. **Cortes com texto ≥ 1.2s:** Mínimo para leitura confortável
9. **Máximo 6 palavras por text_overlay:** Menos é mais
10. **Text overlay complementa, nunca repete** a narração
11. **Video Pro: PROIBIDO usar imagens de carrossel, banners ou artes gráficas do ads/ como source.** O vídeo pro é cinematográfico — usar APENAS imagens fotográficas (assets de marca, imagens geradas via API, pexels). Exceção única: quando o payload contém `carousel_in_video: true` explicitamente. No Video Quick, carrossel é permitido.
12. **Imagens com texto (banners, carrosseis — quando permitido): PROIBIDO zoom, crop ou qualquer motion que corte a imagem.** Usar `image_type: "banner"` e motion `static` ou `breathe` com intensidade minima. Estas imagens ja tem layout proprio e qualquer corte destrói a composicao.
13. **NUNCA colocar text_overlay sobre imagens que ja contem texto** (banners, carrosseis, artes). O texto da imagem + overlay = poluicao visual. Para estas cenas: `text_overlay: ""`
14. **Aspect ratio e crop de imagens:**
    - **Imagens fotográficas (sem texto):** podem ser usadas em qualquer ratio — crop e zoom são permitidos. Uma foto 16:9 pode ser cortada para 9:16 focando no sujeito principal. O motion (zoom, pan, ken-burns) ajuda a enquadrar.
    - **Imagens com texto/banner/logo (has_text):** NUNCA cortar. Usar `object-fit: contain` ou `breathe` com intensidade mínima. Qualquer crop destrói a composição e legibilidade do texto.
15. **Múltiplos vídeos na mesma campanha:** Quando existem Quick + Pro ou múltiplos vídeos, cada um DEVE ter: hook de abertura diferente, tratamento visual diferente, arco narrativo diferente. Reusar assets é OK mas framing, motion e text_overlay devem ser distintos entre vídeos.

---

### FASE C: Atribuição de Assets

**Objetivo:** Mapear cada corte a um asset visual.

**Estratégia de reutilização (OBRIGATÓRIA):**
Com N imagens de marca e 30-50 cortes, cada imagem será reutilizada ~3-5x. Para parecer diferente:

1. **Mesmo imagem + crop diferente:** `center-top` para rosto, `center-bottom` para contexto, `left`/`right` para enquadramento lateral
2. **Mesmo imagem + motion diferente:** `zoom_in` = intimidade, `pan_right` = descoberta, `zoom_out` = contexto
3. **Mesmo imagem + overlay diferente:** `dark` = drama, `warm` = emoção, `cool` = tech, `sepia` = memória
4. **Máximo 5 usos por imagem**

**Para image_source = api:**
- Gere no máximo 10-15 image_prompts únicos
- Mapeie múltiplos cortes ao mesmo prompt gerado
- Prompts em inglês, max 200 caracteres
- Sempre inclua: "no text, no watermark, cinematic lighting"

**Para image_source = pexels:**
- Gere queries de busca por seção temática
- Máximo 10-15 buscas únicas

---

### FASE D: Motion e Pós-Produção

**Objetivo:** Enriquecer cada corte com efeitos de câmera, texto e transição.

**Efeitos de câmera disponíveis:**

| Efeito | Descrição | Usar quando |
|--------|-----------|-------------|
| zoom_in | Aproximação gradual | Revelação, intimidade, foco |
| zoom_out | Afastamento gradual | Contexto, expansão |
| pan_right | Movimento horizontal → | Descoberta, progresso |
| pan_left | Movimento horizontal ← | Retorno, reflexão |
| push-in | Zoom rápido dramático (spring) | Hook, impacto |
| pull-out | Afastamento rápido | Revelação de contexto |
| drift | Oscilação sinusoidal sutil | Conexão emocional |
| parallax-zoom | Zoom + drift vertical | Destaque de benefício |
| breathe | Pulsação sutil (1.02x) | CTA, hold |
| ken-burns-in | Pan + zoom lento | Fotos estáticas premium |
| ken-burns-out | Pan reverso + zoom out | Nostalgia, flashback |
| tilt-shift | Zoom + rotação leve | Detalhe de produto |

**Intensidades de motion:**

| Intensidade | zoom_start → zoom_end | Usar quando |
|-------------|----------------------|-------------|
| aggressive | 1.0 → 1.20 | Hook, impacto, energia alta |
| moderate | 1.0 → 1.12 | Padrão, narrativa |
| subtle | 1.0 → 1.06 | Premium, luxury, CTA |
| static | 1.0 → 1.0 | Cortes < 0.5s |

**Animações de texto (Remotion):**

| Animação | Descrição | Usar quando |
|----------|-----------|-------------|
| punch-in | Palavras entram com impacto | Hook, urgência |
| per-word | Palavra por palavra com delay | Benefícios, emoção |
| blur-in | Texto desfoca e foca | Revelação |
| slide-up | Sobe de baixo | Padrão |
| typewriter | Caractere por caractere | Dados, educativo |
| bounce-in | Palavras quicam | CTA, celebração |
| scale-up | Cresce do centro | Destaque |
| fade | Fade simples | Premium, sutil |
| split-lines | Linhas entram individualmente | Listas, múltiplos pontos |

**Transições entre cortes:**

| Transição | Duração | Usar quando |
|-----------|---------|-------------|
| cut | 0s | Energia alta, ritmo rápido, padrão |
| crossfade | 0.3-0.5s | Emoção, premium, mudança de seção |
| fade_black | 0.4-0.6s | Separação forte, before→after |

**Regra de transições:** Em mood `energetic`, 80%+ dos cortes devem ser `cut`. Em mood `premium`, 60%+ devem ser `crossfade`.

**Text layout por posição:**

| Posição | safe_margin | font_size | Usar quando |
|---------|------------|-----------|-------------|
| top | 120px | 72-96px | **PADRÃO** — usar quando imagem NÃO tem rosto no topo |
| center | 0 | 80-96px | Quando imagem tem rosto no topo (face_position: "top") |
| bottom | — | — | **PROIBIDO em 9:16** — UI das redes cobre esta área |

**Regra de posição:** `top` é o default. Mudar para `center` **somente** quando a imagem tem um rosto na parte superior — o texto não pode cobrir rostos. O Photography Director define `face_position` por shot. Nunca `bottom`.

**Tipografia padrão (estilo magazine/editorial):**

| Contexto | Font family | Estilo |
|----------|-----------|--------|
| **Padrão (todas as cenas)** | Lora, DM Serif Display | Serifada editorial — elegância, contraste de traço, leitura premium |
| Hooks de impacto | Oswald, Bebas Neue | Condensed bold caps — urgência, energia |
| Dados/números | Montserrat | Sans-serif limpa — clareza técnica |

**Regra de tipografia:** Fontes serifadas magazine são o default. Oswald/Bebas Neue apenas para hooks (máx 2-3 cenas). A combinação serif (corpo) + condensed sans (hook) cria contraste editorial profissional.

**Backgrounds de texto:**

| Background | Quando |
|-----------|--------|
| none | Texto curto (1-2 palavras), cortes rápidos, imagem escura |
| dark_box | Texto sobre imagens claras, legibilidade máxima |
| gradient | Padrão para bottom, gradiente suave |

---

## Formato de Saída

Salve em `<output_dir>/video/video_0N_scene_plan_motion.json`:

```json
{
  "titulo": "Título da Campanha",
  "video_length": 60,
  "format": "1080x1920",
  "pacing": "energetic",
  "narrative_framework": "heros_journey_60s",
  "audio": "<output_dir>/audio/video_01_narration.mp3",
  "music": null,
  "music_volume": 0.15,
  "narration_script": "Roteiro completo de narração...",
  "voice": "rachel",
  "bpm": 120,
  "total_cuts": 35,
  "sections": [
    { "name": "HOOK", "start_s": 0, "end_s": 6, "cuts": 7 },
    { "name": "PROBLEMA", "start_s": 6, "end_s": 18, "cuts": 6 },
    { "name": "SOLUÇÃO", "start_s": 18, "end_s": 38, "cuts": 12 },
    { "name": "PROVA", "start_s": 38, "end_s": 52, "cuts": 7 },
    { "name": "CTA", "start_s": 52, "end_s": 60, "cuts": 3 }
  ],
  "scenes": [
    {
      "id": "hook_01",
      "cut_number": 1,
      "duration": 1.0,
      "type": "hook",
      "energy_level": 5,
      "image": "prj/projeto/assets/imagem.jpg",
      "image_type": "raw",
      "image_crop_focus": "center-top",
      "image_prompt": null,
      "text_overlay": "Texto curto aqui",
      "narration": "Segmento de narração deste corte",
      "motion": {
        "type": "zoom_in",
        "intensity": "aggressive",
        "zoom_start": 1.0,
        "zoom_end": 1.20
      },
      "text_layout": {
        "position": "center",
        "safe_margin": 0,
        "font_size": 96,
        "font_weight": "bold",
        "color": "#FFFFFF",
        "background": "none",
        "background_opacity": 0.0,
        "max_width_pct": 85
      },
      "transition_out": "cut",
      "transition_duration": 0.0,
      "camera_effect": "push-in",
      "text_animation": "punch-in",
      "overlay": "dark",
      "overlay_opacity": 0.45
    }
  ]
}
```

---

## Sinal de Conclusão

Após salvar TODOS os arquivos JSON, imprima exatamente:

```
[VIDEO_APPROVAL_NEEDED] <output_dir>
```

---

## Safe Zones — Formato 9:16 (Mobile)

Interfaces de redes sociais (Instagram, TikTok, YouTube Shorts) cobrem áreas do vídeo com UI:

| Zona | Área coberta | Regra |
|------|-------------|-------|
| Topo | 0-80px | Username, ícones — evitar texto crítico |
| Bottom | últimos 200px | Barra de ações, descrição — **NUNCA colocar texto** |
| Lateral direita | últimos 80px | Ícones de like/share — evitar texto |
| Safe area | 80px-1720px vertical, 40px margins laterais | Zona segura para todo conteúdo |

**Regra fixa:** text_layout.position = `top` ou `center` apenas. Nunca `bottom` em formato 9:16.

---

## Checklist de Qualidade (Pré-render)

Antes de finalizar o scene plan, verifique TODOS:

- [ ] Total de cortes dentro do budget (30-50 para energetic 60s)
- [ ] Soma das durações = video_length (tolerância ±2s)
- [ ] Nenhum motion.type repetido consecutivamente
- [ ] Nenhum text_layout.position repetido 3x consecutivamente
- [ ] Primeiro corte ≤ 1.5s (hook rápido)
- [ ] Último corte ≥ 3s (CTA com tempo de leitura)
- [ ] Cortes < 0.8s sem text_overlay
- [ ] Cortes com text_overlay ≥ 1.2s
- [ ] Máximo 6 palavras por text_overlay
- [ ] Cada imagem usada no máximo 5x
- [ ] Todos os caminhos de imagem existem
- [ ] narration_script completo (50-60s de fala)
- [ ] Seções definidas com start_s/end_s/cuts
- [ ] text_overlay complementa, NUNCA repete narração
- [ ] **Video Pro: ZERO imagens de carrossel/banner/ads/** (exceto se carousel_in_video: true no payload)
- [ ] Imagens com texto (quando permitido) usam image_type "banner", motion static/breathe, SEM text_overlay
- [ ] text_layout.position = `top` na maioria das cenas, `center` em no máximo 3 (hooks/CTA)
- [ ] Fonte padrão serifada (Lora / DM Serif Display), Oswald/Bebas só em hooks (máx 2-3 cenas)
- [ ] Curva de energia: hook(5) → problema(3-4) → solução(4-5) → prova(4) → cta(3)

---

## QA Pós-Render

Após o render do vídeo, verificar antes de aprovar:

**Audio/Visual Sync:**
- Narração alinhada com as cenas correspondentes (±0.3s tolerância)
- Música de fundo não compete com narração (volume ≤ 0.15 durante fala)

**Legibilidade de Texto:**
- Font size mínimo: 24px em qualquer resolução
- Contraste alto: texto claro sobre fundo escuro ou com background band
- Texto dentro da safe area (não coberto por UI das redes)

**Transições e Timing:**
- Sem frames pretos entre cenas (exceto fade_black intencional)
- Duração total do vídeo confere com o spec (±1s)
- CTA final visível por tempo suficiente (≥3s)

**Troubleshooting Comum:**
| Problema | Causa provável | Solução |
|----------|---------------|---------|
| Audio dessincronizado | Timestamps errados no scene plan | Recalcular frames e alinhar com narração |
| Render lento/falha | Assets pesados (>5MB por imagem) | Comprimir imagens e simplificar animações |
| Texto ilegível | Font size pequeno ou sem contraste | Mínimo 24px + background band em imagens claras |
| Vídeo com frames pretos | Gap entre cenas | Verificar soma de durações = video_length |
