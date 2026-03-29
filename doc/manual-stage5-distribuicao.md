# Manual — Etapa 5: Distribuicao

## Visao geral

A quinta e ultima etapa cuida de hospedar, agendar e publicar o conteudo da campanha. O Distribution Agent executa 3 responsabilidades sequenciais.

---

## Distribution Agent

**Skill:** `skills/distribution-agent/SKILL.md`

### Fluxo em 3 passos

```
1. GUARDAR — Upload de toda midia para Supabase
   → imagens (ads/*.png) + videos (video/*.mp4)
   → Salva media_urls.json com URLs publicas

2. AGENDAR — Monta o calendario de publicacao
   → Le scheduling de cada platforms/*.json
   → Unifica num calendario
   → Checa rework warnings dos agentes de plataforma
   → Gera Publish MD com tudo pronto

3. PUBLICAR — Executa a postagem
   → Detecta quais plataformas tem API no .env
   → API configurada → publica direto
   → Sem API → envia conteudo pelo Telegram para postagem manual
   → Atualiza Publish MD com status
```

### Gate de publicacao

Os passos 1 e 2 rodam automaticamente quando a etapa 5 e enfileirada.
O passo 3 (publicar) **so executa com aprovacao explicita** — o usuario deve referenciar o Publish MD pelo nome.

---

## Scripts

| Script | Funcao | Uso |
|---|---|---|
| `pipeline/supabase-upload.js` | Upload para Supabase Storage | `node pipeline/supabase-upload.js <prj_dir> <task> <date> <files...>` |
| `pipeline/publish_now.js` | Publicacao generica multi-plataforma | `node pipeline/publish_now.js <output_dir> [--dry-run]` |

---

## APIs de publicacao

| Plataforma | API | Credenciais necessarias | Status |
|---|---|---|---|
| Instagram | Graph API | `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` | Implementado |
| YouTube | Data API (OAuth) | `YOUTUBE_CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` | Implementado |
| Threads | graph.threads.net | `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN` | Implementado |
| Facebook | Graph API | `FACEBOOK_PAGE_ID`, `FACEBOOK_ACCESS_TOKEN` | Placeholder |
| TikTok | Content Posting API | `TIKTOK_ACCESS_TOKEN` | Placeholder |
| LinkedIn | Marketing API | `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_ORGANIZATION_ID` | Placeholder |

Plataformas sem credenciais no `.env` sao marcadas como "manual" — o conteudo e gerado e disponibilizado para postagem manual.

---

## Inputs

| Fonte | O que usa |
|---|---|
| `platforms/*.json` | Copy e scheduling de cada plataforma |
| `ads/*.png` | Imagens para upload |
| `video/*.mp4` | Videos para upload |
| `media_urls.json` | URLs geradas apos upload (consumido pelo publish_now.js) |

---

## Outputs

| Arquivo | Descricao |
|---|---|
| `media_urls.json` | URLs publicas do Supabase para toda a midia |
| `Publish <task_name> <date>.md` | Guia completo de publicacao com status |

### Estrutura do Publish MD
```markdown
# Publish <task_name> <date>

## Calendario
| Plataforma | Data/Hora | Tipo | Status |
|---|---|---|---|
| Instagram | 2026-03-30 10:00 | Carousel | ✅ Publicado |
| YouTube | 2026-03-30 14:00 | Video | 📋 Manual |

## Instagram
- Caption: ...
- Hashtags: ...
- Media: [URL]

## YouTube
- Title: ...
- Description: ...
- Tags: ...
- Media: [URL]

... (uma secao por plataforma)
```

---

## publish_now.js — Fluxo detalhado

```
1. Le media_urls.json (URLs do Supabase)
2. Le platforms/*.json (copy de cada plataforma)
3. Detecta quais APIs estao configuradas no .env
4. Para cada plataforma:
   - API configurada → publica direto
   - Sem API → marca como "manual" no Publish MD
5. Atualiza Publish MD com status de cada publicacao
```

### Flags
- `--dry-run` — simula publicacao sem executar APIs

---

## Aprovacao 5

O bot envia ao usuario:
- Link para o Publish MD
- Resumo do calendario

O usuario deve **referenciar o Publish MD pelo nome** para autorizar a publicacao real.
