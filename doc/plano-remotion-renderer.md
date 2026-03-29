# Plano: Remotion Renderer para ITAGMKT

## Resumo

O projeto tem um setup Remotion parcial em `remotion-ad/` com componentes base (CameraMotion, TextOverlay, DynamicScene, CTAButton, ProductImage, SceneBackgrounds). Esses componentes foram feitos para um formato antigo de scene plan. O Video Pro agora gera um formato diferente com motion.type, motion.intensity, text_animation, overlay, crop_focus. O renderer precisa de um **adapter layer** e upgrades significativos nos componentes.

---

## 1. Arquitetura: Bridging de Formatos

**Problema:** Dois formatos incompativeis de scene plan.

O **formato Video Pro** (usado pelo worker) usa:
- `scenes[].duration` (segundos), `type`, `text_overlay` (string), `text_color`, `text_position`
- `motion.type` (push-in, pull-out, ken-burns-in, zoom_in, zoom_out, pan_right, etc.)
- `motion.intensity` (aggressive, moderate, subtle, static)
- `text_animation`, `overlay`, `overlay_opacity`
- `text_layout.position`, `text_layout.font_size`, `text_layout.color`, `text_layout.background`

O **formato Remotion existente** usa:
- `scenes[].frame_inicio`, `frame_fim`, `duracao_frames`, `tipo`
- `text_overlay.texto`, `text_overlay.animacao`
- `camera_effect`, `background_image`

**Solucao:** Criar um **ScenePlanAdapter** que converte o formato Video Pro em props Remotion no render time.

Transformacoes:
- `duration` (s) × fps = `duracao_frames`; soma cumulativa = `frame_inicio`
- `motion.type` normalizado (zoom_in → ken-burns-in, etc.)
- `motion.intensity` → numerico (aggressive=0.9, moderate=0.6, subtle=0.3, static=0)
- `text_overlay` string → `{ texto: string }`
- `image` paths resolvidos e copiados para `remotion-ad/public/`

---

## 2. Arvore de Componentes

```
RemotionRoot
  Composition "VideoAd" (dynamic width/height/fps/duration)
    VideoAdComposition (top-level)
      Audio (narration_file - continuo)
      Audio (music - continuo, volume menor)
      for each scene:
        Sequence (from=frameStart, durationInFrames=frameDur)
          SceneRenderer
            CameraMotion (imagem + camera effect)
              GradientOverlay (dark/warm/cool/sepia)
              TextBackgroundBand (gradiente atras do texto)
              AnimatedText (text_animation + text_layout)
              SceneTransition (fade-in/out, crossfade)
```

### Componentes novos

| Componente | Funcao |
|---|---|
| `VideoAdComposition` | Top-level, substitui DynamicAd, le props adaptadas |
| `SceneRenderer` | Renderiza cena a partir dos dados, sem type-guessing |
| `TextBackgroundBand` | Gradiente/dark_box atras da area de texto |
| `GlassmorphismCTA` | Botao CTA com efeito glassmorphism |
| `SceneTransition` | Crossfade, fade_black, cut entre cenas |
| `ImageFilter` | brightness, contrast, saturation, vignette por cena |

### Componentes para atualizar

| Componente | Mudanca |
|---|---|
| `CameraMotion` | Adicionar crop_focus, intensity de string para numerico |
| `TextOverlay` | Adicionar color, fontSize, fontWeight, background band |

---

## 3. Sistema de Animacao

### Camera (CameraMotion.tsx)

Ja implementado para 12 efeitos. Mudancas:

**Mapeamento de intensidade:**
```
aggressive -> 0.9
moderate   -> 0.6
subtle     -> 0.3
static     -> 0.0
```

**Normalizacao de motion type:**
- `zoom_in` → `ken-burns-in`
- `zoom_out` → `ken-burns-out`
- `pan_right` → `pan-right`
- `pan_left` → `pan-left`
- push-in, pull-out, drift, parallax-zoom, tilt-shift, breathe → manter

**Crop focus:** `image_crop_focus` (center, center-top, center-bottom, left, right) controla `objectPosition` no `<Img>`.

### Texto (TextOverlay.tsx)

Animacoes ja existentes: blur-in, slide-up, slide-down, per-word, punch-in, bounce-in, typewriter, scale-up, fade, split-lines.

**Adicoes:**
- Cor do texto por cena (text_layout.color)
- Font size por cena (text_layout.font_size)
- Font weight por cena (text_layout.font_weight)
- Text position com safe_margin em pixels

### Transicoes (SceneTransition — novo)

| Tipo | Duracao | Implementacao |
|---|---|---|
| `cut` | 0s | Hard cut, sem efeito |
| `crossfade` | 0.3-0.5s | Sequences sobrepostas com opacity fade |
| `fade_black` | 0.4-0.6s | Fade to black no final, fade from black no inicio |

---

## 4. Audio

Remotion ja suporta `<Audio>` continuo. Mudancas:

- Campo `audio` ou `narration_file` normalizado pelo adapter
- `music_volume` → `background_music_volume`
- Arquivos de audio copiados para `remotion-ad/public/audio/` antes do render
- Cleanup apos render

---

## 5. Pipeline de Render

### render-video-remotion.js (novo)

Fluxo:
```
1. Recebe scene_plan_motion.json
2. Le o JSON
3. Resolve paths de imagens (unique_images + image_source_id)
4. Copia imagens + audio para remotion-ad/public/assets/
5. Transforma scene plan para formato Remotion (adapter)
6. Escreve props transformadas em arquivo temp
7. Chama renderMedia() via @remotion/renderer
8. Limpa arquivos temp
```

**Usar Remotion Node.js API** (nao CLI) — evita problemas de shell escaping com JSONs grandes (35+ cenas):

```js
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
```

**Nova dependencia:** `@remotion/renderer` e `@remotion/bundler` no `remotion-ad/package.json`.

### Formatos suportados

| Formato | Dimensoes | Uso |
|---|---|---|
| 9:16 | 1080×1920 | Reels, Stories, Shorts |
| 1:1 | 1080×1080 | Feed |
| 16:9 | 1920×1080 | YouTube |

---

## 6. Migracao

**Fase 1:** Manter ambos renderers. ffmpeg continua default. Criar render-video-remotion.js separado.

**Fase 2:** Rodar ambos no mesmo scene plan, comparar outputs. Adicionar campo `renderer: "remotion"` ou `"ffmpeg"` no JSON.

**Fase 3:** Remotion vira default. ffmpeg como fallback.

No worker.js, os 4 call sites de render:
```js
const renderer = scenePlan.renderer || 'ffmpeg';
const renderScript = renderer === 'remotion'
  ? 'pipeline/render-video-remotion.js'
  : 'pipeline/render-video-ffmpeg.js';
```

---

## 7. Estrutura de Arquivos

```
remotion-ad/
  src/
    index.ts                        (manter)
    Root.tsx                        (ATUALIZAR — registrar VideoAd)
    VideoAdComposition.tsx          (NOVO)
    DynamicAd.tsx                   (MANTER — legado)

    adapters/
      scenePlanAdapter.ts           (NOVO — converte Video Pro → Remotion)
      motionMapper.ts               (NOVO — motion.type + intensity → CameraEffect)

    components/
      CameraMotion.tsx              (ATUALIZAR — crop_focus, intensity string)
      TextOverlay.tsx               (ATUALIZAR — color, fontSize, background band)
      TextBackgroundBand.tsx        (NOVO)
      CTAButton.tsx                 (ATUALIZAR — variante glassmorphism)
      GlassmorphismCTA.tsx          (NOVO)
      ProductImage.tsx              (MANTER)
      SceneBackgrounds.tsx          (MANTER)
      SVGIcons.tsx                  (MANTER)
      SceneTransition.tsx           (NOVO)
      ImageFilter.tsx               (NOVO)

    scenes/
      SceneRenderer.tsx             (NOVO — universal)
      DynamicScene.tsx              (MANTER — legado)

    theme/
      colors.ts                     (MANTER)

pipeline/
  render-video-remotion.js          (NOVO)
  render-video-ffmpeg.js            (MANTER — fallback)
  render-video.js                   (ATUALIZAR — dispatcher)
```

---

## 8. Complexidade por Componente

| Componente | Esforco | Linhas | Notas |
|---|---|---|---|
| `adapters/scenePlanAdapter.ts` | Medio | ~150 | Transformacao de dados, resolve paths |
| `adapters/motionMapper.ts` | Baixo | ~50 | Duas lookup tables |
| `VideoAdComposition.tsx` | Medio | ~100 | Similar ao DynamicAd existente |
| `SceneRenderer.tsx` | Medio-Alto | ~200 | Compoe CameraMotion + TextOverlay + transitions |
| `SceneTransition.tsx` | Medio | ~80 | Fade-in/out com Sequences sobrepostas |
| `TextBackgroundBand.tsx` | Baixo | ~60 | Retangulo gradiente atras do texto |
| `GlassmorphismCTA.tsx` | Baixo | ~70 | backdrop-filter: blur() |
| `ImageFilter.tsx` | Baixo | ~40 | CSS filters wrapper |
| `CameraMotion.tsx` updates | Baixo | ~30 | cropFocus + intensity conversion |
| `TextOverlay.tsx` updates | Medio | ~50 | color, fontSize, fontWeight overrides |
| `Root.tsx` updates | Baixo | ~20 | Registrar nova composition |
| `render-video-remotion.js` | Alto | ~250 | Asset copy, adapter, renderer API |
| `render-video.js` update | Baixo | ~20 | Dispatcher entre renderers |

**Total estimado:** ~1.100 linhas em 8 arquivos novos e 5 atualizados.

---

## 9. Decisoes Tecnicas

1. **Usar Remotion Node.js API, nao CLI.** CLI tem problemas de shell escaping com JSONs grandes (35+ cenas).

2. **Audio copiado para public/, nao symlink.** Remotion exige arquivos em public/. Symlinks podem falhar.

3. **Adapter fora dos componentes Remotion.** Transformacao no Node.js antes do render. Componentes recebem props limpas.

4. **Transicoes via Sequences sobrepostas.** Crossfade: duas Sequences adjacentes se sobrepoem por `transition_duration × fps` frames.

5. **Fonte: Montserrat Black para headlines.** ffmpeg usa Montserrat via ASS. Remotion: `@remotion/google-fonts/Montserrat`. `font_weight: "bold"` → weight 900.

6. **Imagens high-res para crop_focus.** CameraMotion ja usa `inset: '-10%'` para overscan. Crop_focus via `objectPosition` no `<Img>`.
