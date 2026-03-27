# Media Help — Sistema de Comandos de Mídia

Quando o usuário digitar `/help`, mostre TODOS os comandos abaixo formatados.
Quando o usuário usar qualquer um dos comandos abaixo, interprete os parâmetros e execute a ação correspondente usando os scripts em `media/`.

Primeiro execute `node -e "require('./media/providers').printStatus()"` para mostrar o status atual dos providers.

---

# Comandos Disponíveis

## 🖼️ IMAGENS

### `/img-api [prompt]`
Gera imagem via IA (Kie.ai Z-Image por padrão).

```
/img-api mãe e filha tomando café juntas numa manhã ensolarada
/img-api --provider dalle café em estilo cartoon
/img-api --ratio 9:16 cold brew em fundo escuro
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `kie`, `dalle`, `stability` | `kie` |
| `--ratio` | `1:1`, `4:3`, `3:4`, `16:9`, `9:16` | `1:1` |
| `--quality` | `standard`, `hd` | `standard` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/img_[timestamp].png` |

**Execução:** `media.image.generate(prompt, outputPath, { provider, aspectRatio })`

---

### `/img-free [busca]`
Busca foto gratuita em banco de imagens stock.

```
/img-free café da manhã com família
/img-free --provider pexels coffee morning lifestyle
/img-free --provider pixabay --orientation portrait café
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `pexels`, `unsplash`, `pixabay` | `pexels` |
| `--orientation` | `landscape`, `portrait`, `square` | `square` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/stock_[timestamp].jpg` |

**Execução:** `media.image.stock(query, outputPath, { provider, orientation })`

---

### `/img-svg [descrição]`
Gera imagem usando SVGs programáticos via Playwright (HTML → PNG). Sem API, sem custo.

```
/img-svg card de produto cold brew com fundo escuro e texto dourado
/img-svg --size 1080x1920 story com headline bold
/img-svg --size 1080x1080 slide de carrossel com CTA
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--size` | `1080x1080`, `1080x1920`, `1920x1080` | `1080x1080` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/svg_[timestamp].png` |

**Execução:** Claude gera HTML+CSS → renderiza com Playwright → salva PNG.

---

### `/img-pasta [caminho]`
Usa imagens de uma pasta local existente. Não gera nada — apenas referencia.

```
/img-pasta prj/coldbrew-coffee-co/assets/
/img-pasta prj/coldbrew-coffee-co/outputs/dia_das_maes_2026-05-10/ads/
/img-pasta ~/minhas-fotos/campanha/
```

**Execução:** Lista os arquivos de imagem na pasta e os disponibiliza para os agentes.

---

## 🎬 VÍDEOS

### `/video-fmt [formato]`
Define o formato do vídeo a ser gerado.

```
/video-fmt v          → vertical 1080x1920 (Reels/Stories/Shorts)
/video-fmt q          → quadrado 1080x1080 (Feed)
/video-fmt h          → horizontal 1920x1080 (YouTube)
/video-fmt v,q        → gera em ambos os formatos
```

| Valor | Dimensões | Composição Remotion | Uso |
|---|---|---|---|
| `v` | 1080x1920 (9:16) | `DynamicAd` | Reels, Stories, Shorts |
| `q` | 1080x1080 (1:1) | `DynamicAdSquare` | Feed Instagram |
| `h` | 1920x1080 (16:9) | `DynamicAdWide` | YouTube standard |

---

### `/video-api [prompt]`
Gera vídeo completo: scene plan (Claude) → renderização (Remotion).

```
/video-api mãe e filha preparando cold brew juntas
/video-api --count 2 --fmt v campanha de Páscoa
/video-api --duration 15 --fmt v,q campanha de Natal
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--count` | `1`, `2`, `3`... | `1` |
| `--fmt` | `v`, `q`, `h`, `v,q` | `v` |
| `--duration` | `10`, `15`, `20`, `30` | `15` |
| `--output` | pasta de saída | `<project_dir>/outputs/media/video/` |

**Execução:** Video Ad Specialist gera scene_plan.json → render-video.js renderiza via Remotion.

---

### `/video-clip-pasta [caminho]`
Usa vídeo clips de uma pasta local como assets para composição.

```
/video-clip-pasta prj/coldbrew-coffee-co/assets/clips/
/video-clip-pasta ~/meus-videos/b-roll/
```

**Execução:** Lista os clips disponíveis e os disponibiliza como assets para Remotion (`staticFile()`).

---

## 🎵 MÚSICA

### `/musica-free [busca]`
Busca música royalty-free gratuita.

```
/musica-free lo-fi piano suave
/musica-free --provider pixabay upbeat coffee shop
/musica-free --duration 30 piano acústico
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `pixabay`, `freesound` | `pixabay` |
| `--duration` | duração máx em segundos | sem limite |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/music_[timestamp].mp3` |

**Execução:** `media.music.fetch(query, outputPath, { provider })`

---

### `/musica-api [prompt]`
Gera música via IA.

```
/musica-api lo-fi piano suave para vídeo de Dia das Mães
/musica-api --provider suno beat animado para Reels
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `suno` | `suno` |
| `--duration` | `15`, `30`, `60` | `30` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/music_ai_[timestamp].mp3` |

**Execução:** `media.music.generate(prompt, outputPath, { provider })` (requer `SUNO_API_KEY`)

---

## 🔊 EFEITOS SONOROS

### `/sfx-free [busca]`
Busca efeito sonoro gratuito.

```
/sfx-free café sendo servido
/sfx-free --provider freesound pop click
/sfx-free whoosh transition
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `pixabay`, `freesound` | `pixabay` |
| `--duration` | duração máx em segundos | `10` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/sfx_[timestamp].mp3` |

**Execução:** `media.sfx.fetch(query, outputPath, { provider })`

---

## 🗣️ NARRAÇÃO / TTS

### `/tts-api [texto]`
Gera narração com voz IA premium.

```
/tts-api Presente perfeito para quem te deu tudo.
/tts-api --provider elevenlabs --voice Rachel Bom dia, mãe.
/tts-api --provider openai --voice nova Cada gole é um abraço.
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--provider` | `elevenlabs`, `openai`, `minimax` | `elevenlabs` |
| `--voice` | ver tabela abaixo | `Rachel` (ElevenLabs) / `nova` (OpenAI) |
| `--lang` | `pt-BR`, `en`, `es` | `pt-BR` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/tts_[timestamp].mp3` |

Vozes ElevenLabs: `Rachel` (feminina, quente), `Bella` (feminina, suave), `Antoni` (masculina), `Josh` (masculina, grave), `Arnold` (masculina, forte)

Vozes OpenAI: `nova` (feminina, amigável), `shimmer` (feminina, suave), `echo` (quente), `onyx` (masculina, grave), `alloy` (neutra), `fable` (expressiva)

**Execução:** `media.tts.speak(text, outputPath, { provider, voiceId })`

---

### `/tts-free [texto]`
Gera narração com TTS local gratuito (Piper).

```
/tts-free Presente perfeito para quem te deu tudo.
/tts-free --lang pt-BR Cada gole é um abraço.
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--lang` | `pt-BR`, `en`, `es` | `pt-BR` |
| `--output` | caminho do arquivo | `<project_dir>/outputs/media/tts_local_[timestamp].wav` |

**Execução:** `media.tts.speak(text, outputPath, { provider: 'local-piper' })` (requer `pip install piper-tts`)

---

## 🚀 PIPELINE COMPLETO

### `/campanha [nome]`
Roda o pipeline completo com todos os agentes.

```
/campanha dia_das_maes --date 2026-05-10 --platforms instagram,threads,youtube --lang pt-BR --images 8 --videos 2
```

| Parâmetro | Valores | Default |
|---|---|---|
| `--date` | `YYYY-MM-DD` | hoje |
| `--platforms` | `instagram,threads,youtube` | `instagram,threads,youtube` |
| `--lang` | `pt-BR`, `en` | `pt-BR` |
| `--images` | quantidade total | `1` |
| `--videos` | quantidade | `1` |
| `--skip-research` | flag | desligado |

---

## ⚙️ UTILITÁRIOS

### `/media-status`
Mostra quais providers estão configurados e disponíveis.

```
/media-status
```

### `/help`
Mostra este guia completo de comandos.

---

## Resumo Rápido

| Comando | O que faz | Custo |
|---|---|---|
| `/img-api` | Gera imagem por IA (Kie.ai) | ~$0.004 |
| `/img-free` | Busca foto stock (Pexels) | grátis |
| `/img-svg` | Gera HTML→PNG (Playwright) | grátis |
| `/img-pasta` | Usa imagens locais | grátis |
| `/video-api` | Gera vídeo (Remotion) | grátis |
| `/video-fmt` | Define formato do vídeo | — |
| `/video-clip-pasta` | Usa clips locais | grátis |
| `/musica-free` | Busca música (Pixabay) | grátis |
| `/musica-api` | Gera música (Suno) | ~$0.05 |
| `/sfx-free` | Busca SFX (Pixabay) | grátis |
| `/tts-api` | Narração IA (ElevenLabs) | ~$0.30/1k chars |
| `/tts-free` | Narração local (Piper) | grátis |
| `/campanha` | Pipeline completo | variável |
| `/media-status` | Status dos providers | — |
| `/help` | Este guia | — |
