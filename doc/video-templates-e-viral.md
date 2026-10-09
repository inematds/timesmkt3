# Video Pro Templates e Video Viral (V1)

## Video Pro Templates

Templates controlam o `visual_type` de cada cena (não só fotos). Uso: `"video_template": "<template>"` no payload, ou "template <nome>" na descrição no Telegram.

| Template | Mix visual |
|---|---|
| `auto` (padrão) | Agente decide |
| `data_story` | ~60% chart, ~20% text_card, ~20% photo |
| `explainer` | ~40% list/text_card, ~30% photo, ~30% chart |
| `narrativo` | ~50% text_card, ~30% photo, ~20% chart |
| `brand_film` | ~70% photo, ~20% text_card, ~10% chart |

**Visual types por cena:** `photo`, `chart` (Chart.js bar/line/pie/donut), `text_card`, `list`, `split`.

**Implementação:** `pipeline/render-visual-png.js` (PNGs via Playwright), `pipeline/render-video-ffmpeg.js` (pre-render), `pipeline/worker-video-pro.js` (injeta template no scene plan). Múltiplos templates coexistem no mesmo output dir (compartilham áudio/imagens).

## Video Viral (V1)

Tipo paralelo a Quick e Pro — pegada Reels/TikTok. Diferenças do gatilho/report:

- **Determinístico** (sem agente Claude no scene plan)
- **Bg image full-frame** + texto enorme overlay (estilo ad em movimento)
- **Punch hook nos 0-3s** (cena 1 tem texto extra-grande, sempre on)
- **N vídeos por hook** lidos do research (mesmo extrator do gatilho)

**Flags opcionais:**

| Flag payload | Token /loterun | Default | O que faz |
|---|---|---|---|
| `music_enabled: true` | `musica` ou `music` | OFF | Trilha de fundo com ducking sob narração (volume 0.12) |
| `captions_enabled: true` | `caption` ou `legenda` | OFF | Captions baked nos slides (V1) — V2: word-by-word ASS karaoke |
| `video_template: <nome>` | token do template (`data_story`, `narrativo`, `brand_film`, `explainer`) | `viral` | Estilo visual dos slides — combina com qualquer tipo |

Sintaxe:
```
/loterun c99 video viral                       → cru (só narração + bg, template viral default)
/loterun c99 video viral musica caption        → com música + captions
/loterun c99 video viral data_story            → slides chart-heavy estilo data_story
/loterun c99 video viral brand_film            → slides photo-dominantes minimal
/loterun c99 video pro viral                   → roda os dois em paralelo
/loterun c99 video pro viral data_story        → ambos com mesmo estilo data_story
```

**Output:** `<output_dir>/viral/v01_<slug>/{video.mp4, narration.mp3, scene_plan.json, slide_NN.png, caption_timing.json, _meta.json}`

**Word timing (V1):** estimador estilo Phase 1.5 do Pro — divide audioDuration ÷ totalWords com peso por length de palavra. Drift ±200-400ms aceito. V2 troca por Whisper.

**Música:** se `music_enabled=true`, busca em `prj/<dir>/assets/music/` → fallback `assets/music/` global. Pega o primeiro arquivo (V2: mood-matched).

**Implementação:** `pipeline/worker-video-viral.js` (worker) + `pipeline/render-slide-png.js` (template `viral`) + `pipeline/render-video-ffmpeg.js` (compõe vídeo, já suporta `music`/`music_volume` no plan).

**V2 features (não nesse build):** Whisper word-level, pattern interrupts (zoom in/out), pacing adaptativo, multi-template, self-eval LLM.

_Movido do CLAUDE.md em 2026-10-08 (carrega só quando a tarefa envolver templates do Video Pro ou o Video Viral)._
