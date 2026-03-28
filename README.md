# ATMKT — Time de Agentes de Marketing
### v3.0.0

Sistema de automação de conteúdo para redes sociais usando **5 agentes de IA coordenados**. Os agentes pesquisam, criam textos, geram imagens, renderizam vídeos e preparam a distribuição de campanhas de marketing — tudo automatizado.

O projeto funciona com o **Claude Code** como motor dos agentes. Cada agente é uma skill especializada que o Claude executa via CLI. Um orquestrador (BullMQ + Redis) coordena a ordem de execução e as dependências entre agentes.

A marca de demonstração usada é a **Cold Brew Coffee Co.**, mas o sistema serve para qualquer marca — basta trocar os knowledge files e assets.

> Documentação técnica completa da arquitetura em [`CLAUDE.md`](CLAUDE.md).

---

## Como funciona — Fluxo v3

O **Bot Telegram é o controlador** de todo o fluxo. O Orquestrador enfileira jobs, o Worker executa. Nenhum agente decide quando rodar — o bot controla cada etapa.

```
Usuário define campanha no Telegram
    ↓
BOT → ORQUESTRADOR enfileira: research + diretor_criacao
    ↓
WORKER executa: Research Agent
WORKER executa: Diretor de Criação → gera Creative Brief

⏸ APROVAÇÃO 1 (humano / agente / auto)
  BOT envia: resumo do brief + link para relatório completo
  BOT pergunta: "aprovar estratégia?"
  BOT pergunta: "quer aprovar o vídeo antes de renderizar?"
    ↓
BOT → ORQUESTRADOR enfileira: ad_creative + copywriter (paralelo)
    ↓
WORKER executa: Ad Creative Designer
  — gera imagem → envia imediatamente no chat
  — gera imagem → envia imediatamente no chat
  — ...
WORKER executa: Copywriter Agent

⏸ APROVAÇÃO 2 (humano / agente / auto)
  BOT envia: imagens geradas + textos por plataforma
  BOT pergunta: "aprovar e partir para o vídeo?"
    ↓
BOT → ORQUESTRADOR enfileira: video_specialist
    ↓
WORKER executa: Video Ad Specialist
  — usa imagens aprovadas da etapa anterior
  — gera roteiro de cenas

⏸ APROVAÇÃO 3 — só se usuário quis aprovar vídeo (humano / agente / auto)
  BOT envia: link para roteiro do vídeo
  BOT pergunta: "aprovar roteiro?"
  → se aprovado ou auto: renderiza vídeo com ffmpeg
    ↓
⏸ APROVAÇÃO 4 (humano / agente / auto)
  BOT envia: resumo completo da campanha (imagens + vídeo + textos)
  BOT pergunta: "aprovar e distribuir?"
    ↓
BOT → ORQUESTRADOR enfileira: distribution
    ↓
WORKER executa: Distribution Agent
  — sobe mídia no Supabase
  — monta Publish MD
    ↓
BOT envia: resumo final + /enviar disponível
```

---

## Modos de Aprovação

Cada etapa pode ter um modo independente:

| Modo | Comportamento |
|---|---|
| `humano` | Pausa e espera resposta no Telegram **(padrão)** |
| `agente` | Agente Revisor avalia e decide — bot notifica o resultado |
| `auto` | Aprova automaticamente sem interação |

**Configuração por campanha:**
```json
{
  "aprovacoes": {
    "brief":      "humano",
    "criativo":   "humano",
    "video":      "humano",
    "distribuir": "humano"
  },
  "notificacoes": true
}
```

**Flag de notificações:**
- `true` — envia imagens, roteiro e resumos no chat **(padrão)**
- `false` — roda silencioso, avisa só quando terminar

**Exemplos de uso:**
```
Pipeline rápido     → todas "auto",   notificacoes: false
Pipeline monitorado → todas "agente", notificacoes: true
Distribuição segura → brief/criativo/video "auto", distribuir "humano"
```

---

## Papéis no Sistema

| Componente | Papel |
|---|---|
| **Bot Telegram** | Controlador — recebe instruções, gerencia aprovações, decide quando avançar |
| **Orquestrador** | Enfileirador — coloca jobs na fila BullMQ quando o bot manda |
| **Worker** | Executor — pega job da fila e executa via Claude CLI, nunca pausa esperando humano |
| **Agentes** | Especialistas — executados pelo worker via `claude -p` |
| **Agente Revisor** | Aprovador automático — avalia com critérios da marca quando modo = "agente" |

---

## Agentes (v3)

| # | Agente | O que faz | Quando roda |
|---|---|---|---|
| 1 | **Research Agent** | Pesquisa tendências, concorrentes, público via Tavily | Etapa 1 |
| 2 | **Diretor de Criação** | Gera Creative Brief — ângulo, mensagem, tom, anti-diretrizes | Etapa 1 |
| 3 | **Ad Creative Designer** | Cria imagens (HTML→PNG ou KIE API), envia cada uma ao vivo | Etapa 2 |
| 4 | **Copywriter Agent** | Escreve textos por plataforma alinhados ao brief | Etapa 2 |
| 5 | **Video Ad Specialist** | Gera roteiro + renderiza vídeo usando imagens aprovadas | Etapa 3 |
| 6 | **Agente Revisor** | Avalia qualidade e alinhamento com a marca (modo "agente") | Aprovações 1-4 |
| 7 | **Distribution Agent** | Sobe mídia no Supabase + monta guia de publicação | Etapa 4 |

---

## Recursos de Mídia

O sistema usa múltiplos providers para imagens, áudio e vídeo. Escolhe automaticamente o melhor disponível baseado nas API keys configuradas.

### Imagens

| Provider | Custo | Tipo | Link para API key |
|---|---|---|---|
| **Kie.ai Z-Image** (padrão) | ~$0.004/img | Geração por IA | [kie.ai/api-key](https://kie.ai/api-key) |
| DALL-E 3 | ~$0.04/img | Geração por IA | [platform.openai.com](https://platform.openai.com/api-keys) |
| Stability AI | ~$0.003/img | Geração por IA | [platform.stability.ai](https://platform.stability.ai/account/keys) |
| **Pexels** | Grátis | Fotos stock | [pexels.com/api](https://www.pexels.com/api/) |
| Unsplash | Grátis | Fotos stock | [unsplash.com/developers](https://unsplash.com/oauth/applications) |
| **Pixabay** | Grátis | Fotos + áudio + música | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |

### Narração / Voz (TTS)

| Provider | Custo | Qualidade | Link |
|---|---|---|---|
| **ElevenLabs** | $0.30/1k chars | Excelente | [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys) |
| OpenAI TTS | $0.015/1k chars | Alta | [platform.openai.com](https://platform.openai.com/api-keys) |
| MiniMax | ~$0.01/1k chars | Alta | [api.minimax.chat](https://api.minimax.chat) |
| **Piper (local)** | Grátis | Boa | `pip install piper-tts` |

### Efeitos Sonoros e Música

| Provider | Custo | Tipo | Link |
|---|---|---|---|
| **Pixabay** | Grátis | SFX + Música | [pixabay.com/api/docs](https://pixabay.com/api/docs/) |
| Freesound | Grátis | SFX (500k+ sons) | [freesound.org/apiv2/apply](https://freesound.org/apiv2/apply) |
| ElevenLabs | Pago | Geração de música por IA | [elevenlabs.io](https://elevenlabs.io) |
| Suno AI | ~$0.05/track | Geração de música por IA | [suno.ai](https://suno.ai) |

### Vídeos (Remotion)

| Composição | Formato | Uso |
|---|---|---|
| **DynamicAd** | 1080x1920 (9:16) | Reels, Stories, Shorts |
| **DynamicAdSquare** | 1080x1080 (1:1) | Feed Instagram |
| ColdBrewAd | 1080x1080 (1:1) | Template fixo (fallback) |

### Seleção automática de provider

O sistema escolhe o provider baseado nas keys configuradas:

```
Imagem → Kie.ai → DALL-E → Stability → Pexels/Unsplash/Pixabay (fallback grátis)
Voz    → ElevenLabs → OpenAI TTS → MiniMax → Piper local (fallback grátis)
Música → Pixabay (grátis) ou Suno/ElevenLabs (IA paga)
```

Verificar quais estão ativos: `npm run media:status`

---

## Fluxo de Geração de Imagens

Cada campanha define uma **fonte de imagens** (`image_source`) que controla como o sistema obtém as imagens para ads e vídeos.

### Fontes disponíveis

| Fonte | Parâmetro | Custo | Quando usar |
|---|---|---|---|
| Imagens da marca | `brand` | Grátis | Fotos e banners já existentes no projeto |
| Fotos stock | `pexels` | Grátis | Fotos genéricas sem custo |
| Geração por IA | `api` | Pago (~$0.004/img) | Imagens únicas e temáticas criadas para a campanha |

---

### Fluxo: `brand` — imagens da marca

```
Sistema lê imgs/ e assets/ do projeto (inclui subpastas: banners/, clips/)
    ↓
Cada imagem é classificada automaticamente:
  - banner → imagem com texto/logo embutido (pasta banners/, ou nome contém "banner", "logo", etc.)
  - clip   → arquivo de vídeo (.mp4, .mov)
  - raw    → foto limpa sem texto
    ↓
Agente recebe lista com dimensões e tipo de cada imagem
    ↓
Agente escolhe a imagem certa para cada cena/slide baseado no conteúdo emocional
    ↓
Renderização respeita o tipo:
  - banner → só redimensiona (letterbox), nunca recorta
  - clip   → usa como fonte de vídeo diretamente, sem Ken Burns
  - raw    → aplica efeito Ken Burns (zoom in/out, pan esquerda/direita)
```

---

### Fluxo: `pexels` — fotos stock grátis

```
Agente faz busca na Pexels API com tema da campanha
    ↓
Baixa as fotos mais relevantes para outputs/<campanha>/imgs/
    ↓
Se a foto tiver texto visível → define image_type: "banner" (não recorta)
Se for foto limpa → image_type: "raw" (pode aplicar Ken Burns)
    ↓
Renderiza normalmente
```

---

### Fluxo: `api` — geração por IA (KIE)

```
Sistema lê brand_identity.md do projeto (cores, estilo, personalidade)
    ↓
Para cada imagem, monta um prompt rico com:
  - Tema da campanha extraído do briefing
  - Propósito da cena: hook / tension / solution / social_proof / cta
  - Paleta de cores da marca (se use_brand_overlay: true)
  - Palavras-chave de estilo visual
  - Formato e orientação (1:1 para carousel, 9:16 para stories/vídeo)
    ↓
Envia para KIE API (modelo padrão: definido em KIE_DEFAULT_MODEL no .env)
    ↓
Aguarda geração (polling) e baixa para outputs/<campanha>/imgs/
    ↓
⏸ PAUSA — sistema envia imagens geradas para aprovação no Telegram
    ↓
Usuário responde:
  "sim" → aprovado, segue para montagem
  "não" → cancela
  [texto] → feedback para re-geração
    ↓
Imagens aprovadas são usadas na montagem dos ads/vídeos
```

#### Modelos disponíveis (KIE)

| Modelo | Velocidade | Qualidade | Quando usar |
|---|---|---|---|
| `z-image` | Rápida | Alta | Padrão — melhor equilíbrio |
| `z-image-turbo` | Muito rápida | Boa | Testes, pré-visualizações |
| `flux-kontext-pro` | Média | Muito alta | Campanhas com mais qualidade |
| `flux-kontext-max` | Lenta | Máxima | Campanhas premium |
| `gpt-image-1` | Média | Alta | Estilo mais realista/fotográfico |

O modelo padrão é sempre lido do `.env` (`KIE_DEFAULT_MODEL`). Só muda se o usuário pedir outro explicitamente.

#### Contexto de marca nas imagens

Quando `use_brand_overlay: true` (padrão ao usar `api`):
- O sistema lê `knowledge/brand_identity.md` do projeto
- Extrai cores (#HEX), palavras-chave visuais, nome e personalidade da marca
- Injeta tudo no prompt de geração → imagens saem com a identidade visual da marca

---

### Classificação de imagens

Independente da fonte, toda imagem é classificada antes de ser usada:

| Tipo | Critério de detecção | Tratamento no vídeo | Tratamento no ad |
|---|---|---|---|
| `banner` | Pasta `banners/`, nome contém "banner"/"logo"/"promo", ratio > 2.5 | Letterbox (sem crop, sem Ken Burns) | `object-fit: contain` |
| `clip` | Extensão `.mp4`, `.mov`, `.webm` | Fonte de vídeo direta, trim por duração | Referenciado no layout.json |
| `raw` | Todos os demais | Ken Burns (zoom/pan alternado por cena) | `object-fit: cover` com crop |

---

Movimentos aplicados sobre fotos de fundo simulando câmera cinematográfica:

| Efeito | Descrição | Uso automático |
|---|---|---|
| `push-in` | Zoom rápido para o centro | Hooks, impacto |
| `pull-out` | Zoom afastando | Revelações |
| `ken-burns-in` | Zoom lento e suave | Produto, close-ups |
| `ken-burns-out` | Zoom afastando suave | Flashbacks |
| `pan-left` / `pan-right` | Panorâmica horizontal | Narrativa |
| `pan-up` / `pan-down` | Panorâmica vertical | Esperança, calma |
| `drift` | Movimento aleatório sutil | Emocional, onírico |
| `parallax-zoom` | Zoom com drift vertical | Dinâmico |
| `tilt-shift` | Zoom com rotação | Artístico |
| `breathe` | Pulso de escala sutil | CTAs, finais |

### Animações de Texto

| Animação | Descrição | Uso automático |
|---|---|---|
| `blur-in` | Surge de desfocado para nítido | Hooks |
| `slide-up` / `slide-down` | Desliza vertical | Produto |
| `per-word` | Cada palavra surge separadamente | Conexão, benefícios |
| `punch-in` | Palavras com spring de impacto | Presentes, reveals |
| `bounce-in` | Palavras com bounce | CTAs |
| `typewriter` | Letra por letra com cursor | Flashbacks, memórias |
| `scale-up` | Cresce de pequeno para normal | Destaque |
| `fade` | Fade in simples | Close-ups |

### Seleção automática por tipo de cena

| Tipo de Cena | Câmera | Overlay | Texto |
|---|---|---|---|
| `hook` | `push-in` | escuro | `blur-in` |
| `produto_em_acao` | `ken-burns-in` | frio | `slide-up` |
| `conexao_emocional` | `drift` | quente | `per-word` |
| `flashback_infancia` | `ken-burns-out` | sépia | `typewriter` |
| `flashback_adolescencia` | `pan-left` | sépia | `typewriter` |
| `presente` | `push-in` | escuro | `punch-in` |
| `cta` | `breathe` | claro | `bounce-in` |

O sistema resolve nesta ordem: valor explícito no JSON → detecção por palavras no roteiro → mapeamento pelo tipo → default.

---

## Regras de Texto sobre Imagens

Quando fotos reais são usadas como fundo, o sistema segue estas regras:

1. **Analisar a imagem antes** de posicionar texto
2. **Nunca cobrir rostos** — texto só em áreas livres
3. **Texto deve caber no frame** — padding 40px, overflow hidden
4. **Gradientes localizados** — só na zona do texto, opacidade 0.4-0.7

| Imagem com... | Onde colocar texto |
|---|---|
| Pessoas no centro | Rodapé ou topo |
| Pessoas na esquerda | Direita |
| Produto no centro | Topo ou rodapé |
| Texto já na imagem | Não duplicar na mesma área |

---

## Fluxo de Geração de Vídeos

```
1. Agente de Vídeo (Claude) gera scene_plan.json
   ↓
2. Scene plan define: cenas, timing, texto, cores, câmera, imagens
   ↓
3. render-video.js passa o JSON como props para o Remotion
   ↓
4. DynamicAd.tsx monta <Sequence> por cena com:
   - Foto de fundo + efeito de câmera
   - Texto animado
   - Produto com glow (se houver)
   - Narração contínua + música de fundo
   ↓
5. Output: ad_01.mp4, ad_02.mp4, etc.
```

### Áudio nos vídeos

```json
{
  "narration_file": "audio/v1_full.mp3",
  "narration_volume": 1,
  "background_music": "audio/bgm_v1.mp3",
  "background_music_volume": 0.2
}
```

- Narração é um áudio único e contínuo (não cortado por cena)
- Duração das cenas acompanha o ritmo da voz
- CTA final fica com hold longo (5-9s) depois da voz terminar
- Música de fundo a 20% do volume para não competir

---

## Publicação no Instagram

Para publicar via API, é necessário:

1. **Conta Business ou Creator** no Instagram vinculada a uma Facebook Page
2. **App no Meta Developer** com o produto "Instagram Graph API"
3. **Credenciais**:
   - `INSTAGRAM_ACCOUNT_ID` — ID numérico da conta (`GET /me?fields=instagram_business_account`)
   - `INSTAGRAM_ACCESS_TOKEN` — token com permissões `instagram_business_basic` + `instagram_business_content_publish`
4. Token expira em **60 dias** — renovar antes
5. Imagens devem estar em **URL pública** (o sistema usa Supabase)

---

## Supabase

O projeto usa o Supabase **apenas como Storage** para hospedar os arquivos de mídia das campanhas. Não há tabelas no banco de dados — todos os metadados (captions, research, layouts, URLs) ficam em arquivos locais na pasta `outputs/`.

### O que é armazenado

O Agente de Distribuição faz upload de imagens (PNG) e vídeos (MP4) para o bucket e gera URLs públicas que são usadas para publicação via API (Instagram, YouTube).

```
Campanha gerada
    ↓
Upload de PNGs e MP4s → Supabase Storage (bucket: campaign-uploads)
    ↓
URLs públicas salvas em media_urls.json (local)
    ↓
URLs usadas para publicar via Instagram Graph API / YouTube Data API
```

### Configuração

1. Criar um bucket chamado `campaign-uploads` marcado como **público**
2. Adicionar no `.env`:

```
SUPABASE_URL=sua-url
SUPABASE_SERVICE_ROLE_KEY=sua-key
```

### Exemplo de media_urls.json

```json
{
  "campanha_carousel_01.png": "https://xxx.supabase.co/storage/v1/object/public/campaign-uploads/campanha_carousel_01.png",
  "campanha_ad_01.mp4": "https://xxx.supabase.co/storage/v1/object/public/campaign-uploads/campanha_ad_01.mp4"
}
```

### Publish MD — O guia de publicação

Após o upload no Supabase, o Agente de Distribuição gera um arquivo `Publish <task_name> <date>.md` com tudo pronto para publicar. Esse arquivo funciona como um **guia completo da campanha** e contém:

| Seção | O que tem |
|---|---|
| Status | Checklist por plataforma (Instagram, YouTube, Threads) |
| Mídias hospedadas | Tabela com todos os arquivos, tipo, plataforma e URL pública |
| Instagram — Carrossel | Slides na ordem exata + caption com hashtags |
| Instagram — Stories | Sequência de stories com texto e instruções de formato |
| YouTube | Título, descrição, tags e URL do vídeo por vídeo |
| Threads | Texto pronto para colar (publicação manual) |
| Agendamento | Calendário da semana com datas, horários e justificativa estratégica |
| Instruções de execução | Como acionar a publicação via API |

### Trava de publicação

A publicação real nas APIs (Instagram Graph API, YouTube Data API) **só acontece quando o usuário referencia o Publish MD pelo nome**:

```
Executar Publish dia_das_maes 2026-05-10.md
```

Sem essa referência explícita, nenhuma chamada de API é feita. Isso garante que o usuário sempre revisa o conteúdo antes de publicar.

```
Pipeline completo
    ↓
Publish MD gerado com todo o conteúdo
    ↓
Usuário revisa captions, hashtags, agendamento
    ↓
Usuário referencia o arquivo pelo nome → publicação executa
    ↓
Instagram: Graph API (container → publish)
YouTube: Data API (upload com título/descrição/tags)
Threads: manual (sem API pública)
```

---

## Estrutura do Projeto

```
timesmkt2/
├── prj/                             # Projetos (um por cliente/marca)
│   ├── coldbrew-coffee-co/          # Projeto demo
│   │   ├── assets/                  # Fotos de produto e mídia da marca
│   │   ├── imgs/                    # Imagens de campanha
│   │   │   └── banners/             # Banners com texto (nunca recortados)
│   │   ├── knowledge/               # brand_identity.md, product_campaign.md, platform_guidelines.md
│   │   └── outputs/                 # Campanhas geradas
│   │       └── <campanha>_<data>/   # Uma pasta por campanha
│   │           ├── ads/             # Imagens e HTMLs gerados
│   │           ├── video/           # Vídeos e scene plans
│   │           ├── copy/            # Textos por plataforma
│   │           ├── audio/           # Narrações geradas
│   │           ├── imgs/            # Imagens geradas via API
│   │           ├── logs/            # Log por agente
│   │           └── Publish *.md     # Guia de publicação
│   └── inema/                       # Exemplo de segundo projeto
│       ├── assets/                  # Fotos e mídia
│       ├── imgs/
│       │   └── banners/             # Banners da marca
│       └── knowledge/
│
├── pipeline/                        # Orquestração e renderização
│   ├── orchestrator.js              # Enfileira jobs no BullMQ
│   ├── worker.js                    # Executa agentes via Claude CLI (com gate de dependências)
│   ├── render-video-ffmpeg.js       # Renderiza vídeo com ffmpeg (Ken Burns, letterbox)
│   ├── render-video.js              # Renderiza vídeo com Remotion
│   ├── generate-image-kie.js        # Geração de imagens via KIE API (brand-aware)
│   ├── generate-audio.js            # Geração de narração via ElevenLabs
│   ├── supabase-upload.js           # Upload de mídia para Supabase Storage
│   ├── publish_now.js               # Publicação via APIs (Instagram, YouTube)
│   ├── queues.js / redis.js         # Configuração BullMQ + Redis
│   └── payloads/                    # JSONs de campanha de exemplo
│
├── telegram/                        # Interface do bot Telegram
│   ├── bot.js                       # Comandos, fluxo de campanha, aprovações
│   ├── session.js                   # Sessão por chat (projeto ativo, pendentes)
│   ├── formatter.js                 # Formatação de mensagens HTML
│   ├── media.js                     # Envio de mídia
│   └── config.js                    # Configuração do bot
│
├── skills/                          # Skills dos 5 agentes
│   ├── orchestrator/SKILL.md
│   ├── marketing-research-agent/SKILL.md
│   ├── ad-creative-designer/SKILL.md
│   ├── video-ad-specialist/SKILL.md
│   ├── copywriter-agent/SKILL.md
│   └── distribution-agent/SKILL.md
│
├── media/                           # Módulo multi-provider (imagem, voz, SFX)
├── remotion-ad/                     # Projeto Remotion (renderização de vídeo alternativa)
│   ├── src/DynamicAd.tsx
│   ├── src/scenes/
│   └── src/components/
│
├── doc/                             # Documentação e referências
├── .env                             # Variáveis de ambiente (não versionado)
├── .env.example                     # Template de variáveis
└── CLAUDE.md                        # Documentação técnica completa da arquitetura
```

---

## Exemplo de Campanha — Dia das Mães

Campanha gerada com fotos, vídeos com narração e música.

### Vídeo 1 — "Domingo com Ela" (21s)

| Cena | Tempo | Background | Câmera | Narração |
|---|---|---|---|---|
| Hook | 0-3s | Grãos de café | `push-in` | *"Domingos têm um cheiro especial."* |
| Conexão | 3-6.5s | Mãe e filha | `drift` | *"Ela ensinou tudo. Até o café perfeito."* |
| Produto | 6.5-9.5s | Cold brew | `ken-burns-in` | *"Suave. Gelado. Perfeito."* |
| Brinde | 9.5-12s | Cozinha | `parallax-zoom` | *"Um brinde pra ela."* |
| **CTA** | **12-21s** | **Abraço** | `breathe` | *"Presente perfeito para quem te deu tudo."* + **hold** |

### Vídeo 2 — "Anos de Café" (19s)

| Cena | Tempo | Background | Câmera | Narração |
|---|---|---|---|---|
| Hook | 0-2.7s | Grãos de café | `push-in` | *"Ela sempre teve um café pra te oferecer."* |
| Infância | 2.7-5.8s | Cozinha (sépia) | `ken-burns-out` | *"Quando você tinha cinco anos..."* |
| Adolescência | 5.8-8.8s | Mãe e filha (sépia) | `pan-left` | *"...e quando você tinha dezessete."* |
| Presente | 8.8-12s | Cold brew (flash) | `push-in` | *"Hoje é a sua vez de cuidar dela."* |
| **CTA** | **12-19s** | **Abraço** | `breathe` | *"Cada gole é um abraço."* + **hold** |

---

## Problemas Comuns

| Problema | Solução |
|---|---|
| `npm install` falha | Instalar Node.js v18+ |
| Playwright não renderiza | `npx playwright install chromium` |
| Redis não conecta | `docker run -d --name redis -p 6379:6379 redis:alpine` |
| Remotion falha | `cd remotion-ad && npm install` |
| ElevenLabs 401 | Verificar key e permissões em elevenlabs.io |
| Vídeo sai igual ao template fixo | Passar o scene_plan.json como segundo argumento no render-video.js |
| Texto sobre rosto nas imagens | Seguir regras de posicionamento (analisar imagem antes) |

---

## Começando do Zero

### 1. Instalar

```bash
npm install
cd remotion-ad && npm install && cd ..
npx playwright install chromium
```

### 2. Redis

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### 3. Configurar .env

```bash
cp .env.example .env
```

Preencher pelo menos:

```
TAVILY_API_KEY=sua-key
SUPABASE_URL=sua-url
SUPABASE_SERVICE_ROLE_KEY=sua-key
```

Recomendados:

```
KIE_API_KEY=sua-key
PEXELS_API_KEY=sua-key
PIXABAY_API_KEY=sua-key
ELEVENLABS_API_KEY=sua-key
```

### 4. Rodar

```bash
# Terminal 1
node pipeline/worker.js

# Terminal 2
node pipeline/orchestrator.js --file pipeline/payloads/dia_das_maes_2026.json
```

### 5. Renderizar vídeo avulso

```bash
node pipeline/render-video.js output.mp4 scene_plan.json
```

### 6. Ver providers ativos

```bash
npm run media:status
```

O pipeline roda os 5 agentes e salva tudo em `outputs/`.
