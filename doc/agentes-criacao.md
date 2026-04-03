# Agentes de Criacao — timesmkt3 v4.2.6

## Pipeline 5 Estagios

```
Stage 1: Research + Diretor Criativo + Copywriter (narrativa)
            -> aprovacao 1 (brief + narrativa)

Stage 2: Ad Creative Designer (imagens estaticas)
            -> aprovacao 2 (imagens)

Stage 3: Video (Quick + Pro independentes, podem rodar juntos)
            -> aprovacao 3 (video)

Stage 4: Agentes de Plataforma (Instagram, YouTube, TikTok, Facebook, Threads, LinkedIn)
            -> aprovacao 4 (copy de plataforma)

Stage 5: Distribution (guardar + agendar + publicar)
            -> aprovacao 5 (publicar)
```

## Stage 1 — Estrategia e Narrativa

### Research Agent
- Pesquisa via Tavily: tendencias, concorrentes, audiencia, hooks, viral
- Output: research_results.json, research_brief.md, interactive_report.html

### Diretor Criativo
- Le pesquisa + brand identity + product campaign
- Escolhe UM angulo estrategico
- Define direcao visual (mood, cores, fotografia, tipografia)
- Output: creative_brief.json, creative_brief.md

### Copywriter (Narrador da Campanha)
- Cria a NARRATIVA central — nao copy de plataforma
- Arco emocional: hook -> tensao -> solucao -> prova -> CTA
- Headlines, frases-chave, textos para carousel/stories, roteiro de video
- Output: narrative.json, narrative.md

## Stage 2 — Imagens

### Ad Creative Designer
- Funcao: PURAMENTE VISUAL — nao escreve copy
- Consome textos do narrative.json (carousel_texts, story_texts, headlines)
- CTAs do creative_brief.json (approved_ctas)
- Monta HTML + CSS, renderiza PNG via Playwright
- Output: ads/ (layout.json, HTMLs, PNGs)

### Fontes de imagem (image_source)

| Valor | Alias | Comportamento |
|---|---|---|
| `api` | — | Provider do .env (IMAGE_PROVIDER) ou image_provider do payload |
| `free` | `gratis` | Banco gratis do .env (FREE_IMAGE_PROVIDER, default pexels) |
| `brand` | `marca` | Imagens de assets/ e imgs/ do projeto |
| `folder` | `pasta` | Pasta especifica via image_folder no payload |

## Stage 3 — Video

### Video Quick (default)
- Sempre roda (a menos que skip_video)
- Usa imagens do Designer (ads/)
- 10-20s slideshow com transicoes
- Narracao: opcional (se ElevenLabs configurado)
- Musica: opcional (se disponivel)
- Renderizacao: ffmpeg (`pipeline/render-video-ffmpeg.js`)

### Video Pro (sob demanda — video_mode: 'pro')
- Ativado quando usuario pede "video pro"
- **Independente do Quick** — ambos podem rodar na mesma campanha
- Producao profissional: 30-60s, 30-50 cortes
- Narracao + musica obrigatorios
- Frameworks narrativos (AIDA, PAS, Hero's Journey)
- Renderizacao: Remotion (`pipeline/render-video.js`) — qualidade profissional
- Fluxo em 2 fases:
  1. Rascunho: SVG/placeholders/Remotion preview -> aprovacao
  2. Final: gera imagens reais via API + renderiza completo
- Pode pedir retrabalho ao Designer

### Video Art Direction
- Skill dedicada: `skills/video-art-direction/SKILL.md`
- 12 presets de estilo visual (cinematic, editorial, bold, minimal, etc.)
- Define paleta de cores, tipografia, transicoes e mood por preset
- Aplicavel tanto ao Quick quanto ao Pro

## Stage 4 — Plataformas

So rodam os agentes cujas plataformas estao em `platform_targets`.
Selecao pode ser alterada pelo usuario na aprovacao do Stage 3.

Ver documentacao detalhada em [agentes-distribuicao.md](agentes-distribuicao.md).

| Agente | Conteudo | Formatos |
|---|---|---|
| Instagram | carousel + stories + reels + captions | 1:1 + 9:16 |
| YouTube | titulo SEO + descricao + tags + shorts | 16:9 + 9:16 |
| TikTok | video curto + caption + hook 2s | 9:16 |
| Facebook | feed + stories + reels + video | 1:1/16:9 + 9:16 |
| Threads | posts + thread + standalone | texto |
| LinkedIn | post profissional + carousel PDF | 1200x627 |

Cada agente pode pedir retrabalho via `rework_needed` e `video_format_request`.

## Stage 5 — Distribuicao

### Distribution Agent — 3 responsabilidades
1. **Guardar** — upload midia no Supabase, gera media_urls.json
2. **Agendar** — le platforms/*.json, monta calendario unificado, gera Publish MD
3. **Publicar** — detecta APIs no .env, publica ou marca como manual

Passos 1-2 automaticos. Passo 3 so com aprovacao explicita (referenciar o Publish MD).

Ver documentacao detalhada em [agentes-distribuicao.md](agentes-distribuicao.md).
