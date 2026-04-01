# Video Quick — Slideshow Rapido

Cria videos curtos (10-20s) usando as imagens ja produzidas pelo Ad Creative Designer. Nao gera imagens novas — usa o que ja existe em `ads/`.

## Quando Usar

- Default no Stage 3 (roda automaticamente a menos que `skip_video`)
- Videos para Reels, Stories, Shorts, TikTok
- Quando velocidade importa mais que producao profissional

## Inputs

| Fonte | O que usar |
|---|---|
| `<output_dir>/ads/*.png` | Imagens do Designer — fonte principal |
| `<output_dir>/copy/narrative.json` | Headlines, key_phrases, emotional_arc |
| `<output_dir>/creative/creative_brief.json` | Angulo, direcao visual, CTAs aprovados |
| `<project_dir>/knowledge/brand_identity.md` | Cores, tom |

## Processo

1. Listar imagens disponíveis em `ads/`
2. Ler narrative.json para headlines e key_phrases
3. Montar scene plan com 4-6 cenas (1 imagem por cena)
4. Narração (opcional): se ElevenLabs configurado, gerar audio curto (15-20s max)
5. Musica (opcional): se disponivel em assets/music/
6. Salvar scene plan JSON

## Scene Plan

```json
{
  "titulo": "titulo curto",
  "video_length": 15,
  "format": "9:16",
  "width": 1080,
  "height": 1920,
  "narration_file": "path ou null",
  "narration_volume": 1,
  "music": "path ou null",
  "music_volume": 0.15,
  "scenes": [
    {
      "id": "hook",
      "type": "hook",
      "duration": 3,
      "image": "/absolute/path/to/carousel_01.png",
      "image_type": "raw",
      "narration": "frase exata da narracao neste momento",
      "text_overlay": "PALAVRA-CHAVE",
      "text_color": "#FFFFFF",
      "text_position": "center",
      "overlay_opacity": 0.5,
      "font_family": "Lora",
      "font_size": 88,
      "font_weight": "900",
      "text_shadow": "0 4px 12px rgba(0,0,0,0.8)",
      "motion": { "type": "push-in", "intensity": "moderate" }
    }
  ]
}
```

## Tipografia — Estilo Magazine no Topo (CRITICO)

O texto do Quick segue estilo **capa de revista** — grande, bold, ocupando o terco superior da tela.

| Campo | Regra |
|---|---|
| text_position | **"center" default** — evita rostos no topo e UI no bottom. NUNCA "bottom" |
| font_size | 80-108px — grande o suficiente para dominar o topo |
| font_weight | 900 (black) — peso visual maximo |
| font_family | **"Lora" ou "DM Serif Display"** (default editorial). "Bebas Neue" so para hook |
| text_color | "#FFFFFF" com text_shadow forte |
| text_shadow | "0 4px 12px rgba(0,0,0,0.8)" |
| overlay_opacity | 0.45-0.55 (overlay escuro para legibilidade) |
| max palavras | 4-5 palavras — curto e impactante |

## Sincronizacao Texto × Narracao (CRITICO)

- Cada cena DEVE ter campo `narration` com o trecho exato da narracao falada naquele momento
- O `text_overlay` e a PALAVRA-CHAVE extraida da narracao — nao texto generico
- O texto deve refletir o que o narrador esta dizendo naquela cena especifica
- Se a narracao diz "A inteligencia artificial mudou tudo", o text_overlay pode ser "IA MUDOU TUDO"
- Nunca inventar texto desconectado da narracao

## Regras

- **4-6 cenas**, 2-4 segundos cada, totalizando 10-20 segundos
- Usar SOMENTE imagens de `ads/` — nunca gerar ou baixar novas
- Cada cena usa imagem DIFERENTE
- Ultima cena SEMPRE e CTA com texto do `creative_brief.json → approved_ctas`
- Motion: alternar entre push-in, ken-burns-in, drift, breathe
- Nunca repetir o mesmo motion em 2 cenas consecutivas
- Formato: 9:16 (1080x1920)

## Narracao Quick vs Pro

A narracao do Video Quick e DIFERENTE do Video Pro (video-editor-agent):

- **Quick**: narracao CURTA e direta. Maximo 15-20 segundos. Cada frase corresponde a UMA cena. O text_overlay e a versao resumida da narracao — ambos sincronizados.
- **Pro**: narracao longa e cinematica (50-70s), com roteiro narrativo completo, arco emocional e sincronizacao frame-a-frame.

**Regras de narracao Quick:**
- Cada cena tem UMA frase curta que o narrador fala
- O text_overlay e a versao RESUMIDA dessa frase (palavra-chave, 3-5 palavras max)
- Se gerar audio (ElevenLabs), o script deve ser a concatenacao das narracoes de cada cena
- Tom: direto, impactante, como legendas de Stories/Reels

## Output

Salvar em `<output_dir>/video/`:
- `video_0N_scene_plan.json` — scene plan
- Apos render: `video_0N.mp4`

## Sinal de conclusao

Apos salvar os scene plans:
```
[VIDEO_APPROVAL_NEEDED] <output_dir>
```
