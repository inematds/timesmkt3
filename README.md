# Time de Agentes de Marketing

Sistema de automação de conteúdo para redes sociais usando **5 agentes de IA coordenados**. Os agentes pesquisam, criam textos, geram imagens, renderizam vídeos e preparam a distribuição de campanhas de marketing — tudo automatizado.

O projeto funciona com o **Claude Code** como motor dos agentes. Cada agente é uma skill especializada que o Claude executa via CLI. Um orquestrador (BullMQ + Redis) coordena a ordem de execução e as dependências entre agentes.

A marca de demonstração usada é a **Cold Brew Coffee Co.**, mas o sistema serve para qualquer marca — basta trocar os knowledge files e assets.

> Documentação técnica completa da arquitetura em [`CLAUDE.md`](CLAUDE.md).

---

## Como funciona

```
Você define uma campanha (JSON ou conversa)
    ↓
1. Agente de Pesquisa → pesquisa mercado via Tavily
    ↓
2. Três agentes criativos rodam em paralelo:
   ├── Designer de Ads → imagens para carousel + stories (Playwright)
   ├── Especialista de Vídeo → roteiro + renderização (Remotion)
   └── Copywriter → textos para Instagram, Threads, YouTube
    ↓
3. Agente de Distribuição → sobe mídia no Supabase + monta guia de publicação
    ↓
Resultado: pasta com tudo pronto para publicar
```

### Os 5 agentes

| Agente | O que faz | Ferramenta |
|---|---|---|
| **Pesquisa de Marketing** | Pesquisa tendências, concorrentes, público-alvo | Tavily AI SDK |
| **Designer de Ads** | Cria imagens para carousel e stories | Playwright (HTML→PNG) |
| **Especialista de Vídeo** | Gera roteiro e renderiza vídeos com efeitos | Remotion |
| **Copywriter** | Escreve textos adaptados por plataforma | Claude |
| **Distribuição** | Sobe mídia e monta o guia de publicação | Supabase |

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

## Efeitos de Câmera nos Vídeos

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

Necessário um projeto Supabase com:

1. Bucket de storage chamado `campaign-uploads` marcado como **público**
2. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no `.env`

---

## Estrutura do Projeto

```
timesmkt/
├── assets/                  # Imagens da marca (fotos de produto)
├── knowledge/               # Identidade, guidelines, briefing
├── skills/                  # Definições dos 5 agentes + media-help
├── media/                   # Módulo multi-provider (imagem, voz, SFX, música)
├── pipeline/                # Orquestrador, worker, render de vídeo
│   ├── orchestrator.js      # Enfileira jobs no BullMQ
│   ├── worker.js            # Executa agentes via Claude CLI
│   ├── render-video.js      # Renderiza vídeo com Remotion
│   └── payloads/            # JSONs de campanha
├── remotion-ad/             # Projeto Remotion (vídeo)
│   ├── src/DynamicAd.tsx    # Composição dinâmica
│   ├── src/scenes/          # Cenas por tipo
│   ├── src/components/      # CameraMotion, TextOverlay, etc.
│   └── public/              # Assets e áudios
├── outputs/                 # Campanhas geradas
├── .env.example             # Template de variáveis
└── CLAUDE.md                # Documentação técnica completa
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
