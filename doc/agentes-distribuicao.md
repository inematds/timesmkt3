# Agentes de Distribuicao — ITAGMKT v4.2.6

## Stage 4 — Agentes de Plataforma

Cada agente e especialista na sua plataforma. Recebe a narrativa (narrative.json), o brief criativo, e os visuais prontos (ads/, video/). Gera copy e conteudo nativo para a plataforma.

### Selecao de plataformas

As plataformas alvo sao definidas por `platform_targets` no payload. Podem vir de:
1. **Briefing** — definido no payload ao criar a campanha
2. **Selecao no Telegram** — no Stage 3 (aprovacao de video), o bot mostra as plataformas e permite alterar antes de avancar

Exemplo no Telegram:
```
Plataformas selecionadas:
  ✅ instagram — Instagram (carousel + stories + reels)
  ✅ youtube — YouTube (video + shorts)
  ✅ tiktok — TikTok (video curto)
  ✅ facebook — Facebook (feed + stories + reels + video)
  ✅ threads — Threads (texto + imagem)
  ✅ linkedin — LinkedIn (post profissional)

Responda "sim" ou liste as desejadas: instagram,youtube,tiktok
```

So rodam os agentes das plataformas selecionadas.

### Inputs comuns

| Fonte | O que extrai |
|---|---|
| `copy/narrative.json` | Narrativa, headlines, key_phrases, emotional_arc, CTAs |
| `creative/creative_brief.json` | Angulo, direcao visual, guardrails |
| `knowledge/brand_identity.md` | Voz, CTAs aprovados, hashtags, emojis |
| `knowledge/platform_guidelines.md` | Regras por plataforma |
| `research_results.json` | Tendencias, horarios, audiencia |
| `ads/*.png` | Imagens geradas (carousel, stories) |
| `video/*.mp4` | Videos gerados |

### Formatos de conteudo por plataforma

| Plataforma | Imagem | Video longo | Video curto | Texto |
|---|---|---|---|---|
| Instagram | carousel 1:1 + stories 9:16 | — | reels 9:16 | caption + hashtags |
| YouTube | thumbnail 16:9 | video 16:9 | shorts 9:16 | titulo + descricao + tags |
| TikTok | — | — | video 9:16 | caption curto |
| Facebook | feed 1:1/16:9 + stories 9:16 | video 16:9 | reels 9:16 | post + descricao |
| Threads | opcional | — | — | post (500 chars) |
| LinkedIn | 1200x627 ou 1:1 | — | — | post profissional |

### Instagram Agent (`platform_instagram`)

**Dependencias:** ad_creative_designer, copywriter

**Gera:**
- Carousel: caption principal (hook + beneficio + CTA + hashtags), slide_captions por slide
- Stories: sequencia com image, text_overlay, CTA, sticker interativo
- Reels: caption curto + hashtags + sugestao de audio
- Scheduling: dias/horarios da pesquisa, ordem de postagem
- rework_needed: sinaliza se visual nao serve

**Output:** `platforms/instagram.json` + `.md`

### YouTube Agent (`platform_youtube`)

**Dependencias:** video_editor_agent, copywriter

**Gera:**
- Por video: title SEO (60-70 chars), description, tags (8-12), thumbnail_text
- Shorts: titulo e descricao separados
- Scheduling: long-form primeiro, Shorts 24h depois
- rework_needed / video_format_request: pede formato se nao existe

**Output:** `platforms/youtube.json` + `.md`

### TikTok Agent (`platform_tiktok`)

**Dependencias:** video_editor_agent, copywriter

**Gera:**
- Video: caption (max 150 chars), hashtags (max 5), sound suggestion
- Hook strategy: o que acontece nos primeiros 2 segundos
- Text overlays para o video
- rework_needed / video_format_request: pede 9:16 se nao existe

**Output:** `platforms/tiktok.json` + `.md`

### Facebook Agent (`platform_facebook`)

**Dependencias:** ad_creative_designer, video_editor_agent, copywriter

**Gera:**
- Feed post: imagem ou video + caption longo (storytelling)
- Stories: sequencia vertical
- Reels: video 9:16 + caption
- Video: 16:9 + titulo + descricao
- rework_needed / video_format_request

**Output:** `platforms/facebook.json` + `.md`

### Threads Agent (`platform_threads`)

**Dependencias:** copywriter

**Gera:**
- Post principal: max 500 chars, com/sem imagem
- Thread follow-up: contexto extra, NAO repete
- Post standalone: outro angulo para outro dia
- Scheduling: dias/horarios

**Output:** `platforms/threads.json` + `.md`

### LinkedIn Agent (`platform_linkedin`)

**Dependencias:** ad_creative_designer, copywriter

**Gera:**
- Post profissional: hook na primeira linha, insight + valor + CTA
- Carousel document (PDF): se aplicavel
- Article: thought leadership, se o angulo justifica
- Scheduling: Ter-Qui, 8-10h

**Output:** `platforms/linkedin.json` + `.md`

### Retrabalho (rework)

Cada agente pode pedir ajustes via dois campos no JSON:
- `rework_needed`: descricao textual do problema
- `video_format_request`: pedido especifico de formato de video
  ```json
  { "format": "9:16", "duration": "15-30s", "style": "quick cuts, hook first 2s" }
  ```

O Distribution Agent (Stage 5) loga warnings de rework no Publish MD.

---

## Stage 5 — Distribution Agent

### Funcao

O Distribution Agent tem 3 responsabilidades sequenciais:

### Fluxo

```
1. GUARDAR — Upload de toda midia para Supabase
   → node pipeline/supabase-upload.js <project_dir> <task_name> <date> <files...>
   → imagens (ads/*.png) + videos (video/*.mp4)
   → Salva media_urls.json com URLs publicas

2. AGENDAR — Monta o calendario de publicacao
   → Le scheduling de cada platforms/*.json
   → Unifica num calendario
   → Checa rework warnings dos agentes de plataforma
   → Gera Publish MD com tudo pronto

3. PUBLICAR — Executa a postagem
   → node pipeline/publish_now.js <output_dir>
   → Detecta quais plataformas tem API no .env
   → API configurada -> publica direto
   → Sem API -> envia conteudo pelo Telegram para postagem manual
   → Atualiza Publish MD com status (publicado / manual / falhou)
```

### Gate de Publicacao

Os passos 1 e 2 rodam automaticamente quando o stage 5 e enfileirado.
O passo 3 (publicar) so executa com aprovacao explicita:

```
Executar Publish <task_name> <date>.md
```

Sem essa referencia, NENHUMA chamada de API e feita.

### APIs de Publicacao

| Plataforma | API | Credenciais | Status |
|---|---|---|---|
| Instagram | Graph API (container + publish) | INSTAGRAM_ACCOUNT_ID, INSTAGRAM_ACCESS_TOKEN | Implementado |
| YouTube | Data API (OAuth + multipart upload) | YOUTUBE_CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN | Implementado |
| Threads | graph.threads.net | THREADS_USER_ID, THREADS_ACCESS_TOKEN | Implementado |
| Facebook | Graph API | FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN | Placeholder |
| TikTok | Content Posting API | TIKTOK_ACCESS_TOKEN | Placeholder |
| LinkedIn | Marketing API | LINKEDIN_ACCESS_TOKEN, LINKEDIN_ORGANIZATION_ID | Placeholder |

### Scripts

| Script | Funcao | Uso |
|---|---|---|
| `pipeline/supabase-upload.js` | Upload de arquivos para Supabase Storage | `node pipeline/supabase-upload.js <prj_dir> <task> <date> <files...>` |
| `pipeline/publish_now.js` | Publicacao generica em todas as plataformas | `node pipeline/publish_now.js <output_dir> [--dry-run]` |

### publish_now.js — Fluxo

```
1. Le media_urls.json (URLs do Supabase)
2. Le platforms/*.json (copy de cada plataforma)
3. Detecta quais APIs estao configuradas no .env
4. Para cada plataforma:
   - API configurada -> publica direto
   - Sem API -> marca como "manual" no Publish MD
5. Atualiza Publish MD com status de cada publicacao
```

### Deteccao de credenciais (.env)

| Plataforma | Variaveis necessarias | Status |
|---|---|---|
| Instagram | INSTAGRAM_ACCOUNT_ID + INSTAGRAM_ACCESS_TOKEN | Implementado |
| YouTube | YOUTUBE_CLIENT_ID + CLIENT_SECRET + REFRESH_TOKEN | Implementado |
| Threads | THREADS_USER_ID + THREADS_ACCESS_TOKEN | Implementado |
| Facebook | FACEBOOK_PAGE_ID + FACEBOOK_ACCESS_TOKEN | Placeholder |
| TikTok | TIKTOK_ACCESS_TOKEN | Placeholder |
| LinkedIn | LINKEDIN_ACCESS_TOKEN + LINKEDIN_ORGANIZATION_ID | Placeholder |

Plataformas sem credenciais no .env sao marcadas como "manual" — o conteudo e gerado e disponibilizado para o usuario postar manualmente.

### Output

```
outputs/<task_name>_<date>/
├── media_urls.json                    ← URLs publicas do Supabase
└── Publish <task_name> <date>.md      ← Guia completo + status de publicacao
```
