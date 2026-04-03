# Video Art Direction — Guia de Direção de Arte para Vídeo

> Referência completa de direção de arte visual para o Video Pro agent.
> Leia este arquivo ANTES de criar qualquer scene plan. Ele define estilos visuais, paletas, tipografia, transições, composição e regras de sincronização audiovisual.

---

## 1. Catálogo de Estilos Visuais (12 Presets)

Cada estilo define TODOS os parâmetros visuais para uma campanha. Selecione o estilo com base no tipo de campanha, personalidade da marca e público-alvo. Combine no máximo 2 estilos se necessário (primário + secundário para acentos).

---

### 1.1 Neon Futurista

**Quando usar:** Tecnologia, IA, inovação, startups, cursos de tech, lançamentos digitais.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#00E5FF` (cyan), `#39FF14` (neon green) |
| **Paleta secundária** | `#7B2FFF` (violeta elétrico), `#FF00AA` (magenta) |
| **Paleta de acento** | `#FFFFFF` (texto principal), `#B0BEC5` (texto secundário) |
| **Background** | `#080C14` (dark navy), `#0D0D0D` (quase preto) |
| **Tipografia principal** | Space Grotesk 800, ALL CAPS para headlines |
| **Tipografia suporte** | Inter 400-500, JetBrains Mono 400 para labels |
| **Tamanho headline** | 80-96px |
| **Efeitos de texto** | Glow cyan (`text-shadow: 0 0 20px #00E5FF88`), neon pulse |
| **Camera motion** | `push-in`, `zoom_in` aggressive no hook; `parallax-zoom` moderate no benefit |
| **Text animations** | `punch-in`, `typewriter`, `blur-in` |
| **Transições** | `cut` (80%), `glitch` (accent), `fade_black` entre blocos |
| **Overlay** | Gradiente radial escuro, opacidade 0.55-0.70 |
| **Partículas/efeitos** | Partículas cyan flutuantes, linhas de circuito, grid digital, data flow |
| **Audio mood** | Eletrônica/synthwave, 110-130 BPM, bass profundo |
| **Marcas referência** | MasterClass dark mode, Notion launches, Apple WWDC, INEMA |

**Regra:** Nunca usar mais de 2 cores neon no mesmo frame. Alternar cyan e green entre cenas.

---

### 1.2 Premium Minimal

**Quando usar:** Luxo, exclusividade, moda premium, joalheria, design de interiores, produtos de alto valor.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#FFFFFF` (branco), `#1A1A1A` (quase preto) |
| **Paleta secundária** | `#C9A96E` (dourado), `#8C8C8C` (cinza neutro) |
| **Paleta de acento** | `#D4AF37` (ouro), `#E8E0D0` (marfim) |
| **Background** | `#FAFAFA` (branco quente) ou `#0A0A0A` (preto profundo) |
| **Tipografia principal** | Playfair Display 700 ou Cormorant Garamond 600 |
| **Tipografia suporte** | Inter 300-400 (light para elegância) |
| **Tamanho headline** | 72-88px, tracking expandido (+2px) |
| **Efeitos de texto** | Nenhum glow. Sombra sutil `0 2px 8px rgba(0,0,0,0.15)` |
| **Camera motion** | `ken-burns-in` subtle, `drift` sutil, `zoom_in` subtle. NUNCA aggressive |
| **Text animations** | `fade`, `slide-up` lento (600ms), `per-word` com delay 200ms |
| **Transições** | `crossfade` 0.5-0.8s (dominante), `fade_black` entre blocos |
| **Overlay** | Gradiente linear sutil, opacidade 0.30-0.45 |
| **Partículas/efeitos** | Nenhuma partícula. Bokeh muito sutil se necessário. Limpeza visual total |
| **Audio mood** | Piano solo, ambient orquestral, 60-80 BPM, silêncios intencionais |
| **Marcas referência** | Cartier, Rolex, Aesop, Apple product reveals |

**Regra:** Máximo 15 cortes por minuto. Cada corte dura 4-6s. Respiração visual obrigatória.

---

### 1.3 Energético

**Quando usar:** Fitness, juventude, eventos, esportes, promoções de impacto, lançamentos com urgência.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#FF4500` (laranja-vermelho), `#FFD700` (amarelo vibrante) |
| **Paleta secundária** | `#00FF88` (verde energético), `#FF1744` (vermelho ação) |
| **Paleta de acento** | `#FFFFFF` (texto), `#000000` (contraste) |
| **Background** | `#111111` (escuro alto contraste) ou gradiente vibrante |
| **Tipografia principal** | Oswald 800 ou Impact, ALL CAPS obrigatório |
| **Tipografia suporte** | Bebas Neue 400-700 |
| **Tamanho headline** | 88-108px, condensado |
| **Efeitos de texto** | Stroke 3px preto, sombra dura `3px 3px 0 #000`, itálico para ênfase |
| **Camera motion** | `push-in` aggressive, `zoom_in` aggressive, `pan_right` rápido |
| **Text animations** | `punch-in`, `bounce-in`, `scale-up` rápido (200ms) |
| **Transições** | `cut` (90%+), `whip_pan`, `zoom_blur` como accent |
| **Overlay** | Gradiente diagonal bold, opacidade 0.40-0.55 |
| **Partículas/efeitos** | Faíscas, explosões de cor, linhas de velocidade, shake sutil no frame |
| **Audio mood** | EDM, trap, hip-hop energético, 120-145 BPM, drops sincronizados com cortes |
| **Marcas referência** | Nike, Gatorade, Monster Energy, CrossFit, Red Bull |

**Regra:** Mínimo 30 cortes por minuto. Nenhum corte > 3s exceto CTA final. Ritmo acelerado constante.

---

### 1.4 Emocional Cinematic

**Quando usar:** Família, saúde, causas sociais, datas comemorativas (Dia das Mães, Natal), storytelling humano.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#FFF5E1` (branco quente), `#2C1810` (marrom profundo) |
| **Paleta secundária** | `#D4956A` (terra quente), `#8B6F47` (caramelo) |
| **Paleta de acento** | `#E8B84B` (dourado quente), `#FFFFFF` (texto) |
| **Background** | `#1A1209` (marrom-preto quente), gradiente warm |
| **Tipografia principal** | Lora 700 ou Georgia Bold (serifada = emoção) |
| **Tipografia suporte** | Inter 400, peso leve para sentimento de delicadeza |
| **Tamanho headline** | 72-88px |
| **Efeitos de texto** | Sombra difusa suave `0 4px 12px rgba(0,0,0,0.25)`, sem glow |
| **Camera motion** | `zoom_in` subtle, `drift` sutil, `ken-burns-in` lento. NUNCA aggressive |
| **Text animations** | `fade` lento (800ms), `per-word` com delay 250ms, `slide-up` suave |
| **Transições** | `crossfade` 0.6-1.0s (dominante). NUNCA corte seco |
| **Overlay** | Gradiente quente do rodapé, opacidade 0.40-0.55. Vignette sutil |
| **Partículas/efeitos** | Bokeh dourado suave, floating light particles, lens flare sutil |
| **Audio mood** | Piano + cordas, folk acústico, 70-90 BPM, crescendo emocional no climax |
| **Marcas referência** | Dove, Johnson & Johnson, Hallmark, Airbnb "Belong Anywhere" |

**Regra:** Máximo 16 cortes por minuto. Crossfades longos. Tempo para absorver emoção. Sem pressa.

---

### 1.5 Corporate Clean

**Quando usar:** B2B, SaaS, LinkedIn, apresentações corporativas, whitepapers em vídeo, onboarding.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#0066CC` (azul corporativo), `#FFFFFF` (branco) |
| **Paleta secundária** | `#003D7A` (azul escuro), `#E8F0FE` (azul claro) |
| **Paleta de acento** | `#00B894` (verde sucesso), `#FF6B35` (CTA laranja) |
| **Background** | `#FFFFFF` (branco limpo) ou `#F5F7FA` (cinza-azulado) |
| **Tipografia principal** | Inter 700 ou Helvetica Neue Bold |
| **Tipografia suporte** | Inter 400, Regular para body |
| **Tamanho headline** | 64-80px |
| **Efeitos de texto** | Nenhum efeito decorativo. Sombra mínima se necessário. Clareza acima de tudo |
| **Camera motion** | `zoom_in` subtle, `pan_right` moderate, `static` para dados. Movimento mínimo |
| **Text animations** | `slide-up`, `fade`, `split-lines` para bullet points |
| **Transições** | `crossfade` 0.4s (dominante), `fade_black` entre seções |
| **Overlay** | Gradiente linear sutil branco→transparente, opacidade 0.25-0.40 |
| **Partículas/efeitos** | Nenhum. Gráficos de dados se relevante. Ícones flat |
| **Audio mood** | Ambient corporativo, 80-100 BPM, melodia repetitiva e discreta |
| **Marcas referência** | Salesforce, HubSpot, Stripe, Notion, Slack |

**Regra:** Sem efeitos decorativos. Cada frame comunica 1 informação. Dados > emoção.

---

### 1.6 Streetwear Urban

**Quando usar:** Moda, cultura urbana, TikTok, marca jovem, streetwear, música, lifestyle 18-30 anos.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#000000` (preto), `#FFFFFF` (branco) |
| **Paleta secundária** | `#FF3366` (rosa neon), `#00FFAA` (verde acid) |
| **Paleta de acento** | `#FFE600` (amarelo gritante), cor da marca como splash |
| **Background** | `#000000` (preto) ou textura de concreto/graffiti |
| **Tipografia principal** | Archivo Black 900 ou Druk Wide Bold, ALL CAPS |
| **Tipografia suporte** | Roboto Condensed 700 |
| **Tamanho headline** | 88-108px, condensado e alto |
| **Efeitos de texto** | Stroke grosso 4px, distorção glitch, rotação ±3 graus, outline neon |
| **Camera motion** | `push-in` aggressive, `zoom_in` aggressive, movimentos abruptos |
| **Text animations** | `punch-in` rápido, `scale-up` com bounce, `glitch-in` |
| **Transições** | `cut` (85%+), `glitch` como accent, `zoom_blur` |
| **Overlay** | Textura de ruído/grain, scanlines, distorção RGB |
| **Partículas/efeitos** | Grain de filme (film noise), RGB split, scanlines, halftone dots |
| **Audio mood** | Trap, drill, lo-fi beat pesado, 130-150 BPM, bass 808 |
| **Marcas referência** | Supreme, Off-White, Nike SNKRS, Balenciaga, Palace |

**Regra:** Mínimo 35 cortes por minuto. Texto pode sair da safe zone intencionalmente. Imperfeição = autenticidade.

---

### 1.7 Nature Organic

**Quando usar:** Sustentabilidade, wellness, alimentação natural, cosméticos orgânicos, yoga, saúde holística.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#2D5016` (verde floresta), `#8B6F47` (terra) |
| **Paleta secundária** | `#A8C686` (verde claro), `#F5E6CA` (creme natural) |
| **Paleta de acento** | `#E8B84B` (mel/dourado), `#D4956A` (terracota) |
| **Background** | `#FAF5EB` (off-white quente) ou `#1A2612` (verde-escuro) |
| **Tipografia principal** | DM Serif Display 400 ou Libre Baskerville 700 |
| **Tipografia suporte** | Nunito 400 ou Source Sans Pro 400 (arredondada, amigável) |
| **Tamanho headline** | 68-84px |
| **Efeitos de texto** | Sem efeitos pesados. Sombra leve natural `0 2px 6px rgba(0,0,0,0.12)` |
| **Camera motion** | `ken-burns-in` moderate, `pan_right` moderate, `drift` sutil |
| **Text animations** | `fade` 600ms, `slide-up` suave, `per-word` delicado |
| **Transições** | `crossfade` 0.5-0.7s (dominante), `fade_black` raro |
| **Overlay** | Gradiente warm/green sutil, opacidade 0.30-0.45 |
| **Partículas/efeitos** | Floating leaves, dust motes dourados, raios de sol (god rays), bokeh verde |
| **Audio mood** | Acústico, folk suave, sons da natureza, 70-90 BPM, violão, flauta |
| **Marcas referência** | Aesop, Whole Foods, Lush, The Body Shop, Natura |

**Regra:** Paleta máxima de 4 cores por frame. Zero elementos artificiais (sem grid, sem partículas digitais).

---

### 1.8 Retro Vintage

**Quando usar:** Nostalgia, artesanal, heritage brands, cervejarias craft, barbearias, produtos com história.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#C75B12` (burnt orange), `#2B1810` (marrom escuro) |
| **Paleta secundária** | `#F4D03F` (amarelo vintage), `#8B4513` (saddlebrown) |
| **Paleta de acento** | `#F5DEB3` (wheat), `#FFFDE7` (creme) |
| **Background** | `#1E1208` (sepia-dark) ou `#F5E6C8` (papel envelhecido) |
| **Tipografia principal** | Abril Fatface 400 ou Playfair Display 900 |
| **Tipografia suporte** | Courier Prime 400 (monospace vintage), EB Garamond 400 |
| **Tamanho headline** | 72-88px |
| **Efeitos de texto** | Textura de papel, letterpress effect, sombra offset (2px 2px 0 cor escura) |
| **Camera motion** | `ken-burns-in` moderate, `zoom_in` subtle, `pan_right` lento |
| **Text animations** | `fade` lento (800ms), `typewriter` para efeito retrô |
| **Transições** | `crossfade` 0.6s com grain, `fade_black` com vignette |
| **Overlay** | Sepia `rgba(139,69,19,0.15)`, vignette forte (0.65-0.80), film grain |
| **Partículas/efeitos** | Film grain obrigatório, scratches de película, poeira de projetor, vignette |
| **Audio mood** | Jazz, blues, oldies instrumental, 70-95 BPM, vinil crackling |
| **Marcas referência** | Jack Daniel's, Levi's vintage, Harley-Davidson, barbershops |

**Regra:** Sepia e/ou grain obrigatórios em 100% dos frames. Color grading quente (temperatura > 6000K).

---

### 1.9 Bold Pop

**Quando usar:** Bens de consumo, promoções, Black Friday, saldões, fast food, e-commerce, CTAs diretos.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#FF0055` (vermelho-rosa), `#FFD600` (amarelo puro) |
| **Paleta secundária** | `#00C853` (verde vibrante), `#2979FF` (azul puro) |
| **Paleta de acento** | `#FFFFFF` (texto), `#000000` (stroke/fundo) |
| **Background** | Cor sólida vibrante (muda por cena), gradiente diagonal bold |
| **Tipografia principal** | Montserrat 900 Black, ALL CAPS obrigatório |
| **Tipografia suporte** | Poppins 700 |
| **Tamanho headline** | 88-108px |
| **Efeitos de texto** | Stroke preto 4px, sombra dura, rotação ±5 graus, escala exagerada |
| **Camera motion** | `push-in` moderate, `zoom_in` moderate, `breathe` para CTA |
| **Text animations** | `bounce-in`, `scale-up` exagerado, `punch-in` |
| **Transições** | `cut` (75%), `slide_horizontal`, `spin` para reveals |
| **Overlay** | Pattern geométrico (listras, dots), opacidade 0.20-0.35 |
| **Partículas/efeitos** | Confetti, explosões de cor, starburst, tag de preço animado |
| **Audio mood** | Pop comercial, jingle, 100-120 BPM, percussão alegre |
| **Marcas referência** | McDonald's, SHEIN, Amazon Prime Day, Magazine Luiza |

**Regra:** Cada cena pode ter fundo de cor diferente. Máxima saturação. Sem sutileza.

---

### 1.10 Dark Dramatic

**Quando usar:** Thriller, mistério, premium alcohol, perfumaria, marca com aura de poder, games mature.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#0D0D0D` (preto profundo), `#1A1A2E` (azul-escuro) |
| **Paleta secundária** | `#8B0000` (vermelho sangue), `#4A0E4E` (roxo escuro) |
| **Paleta de acento** | `#C0C0C0` (prata), `#FFD700` (ouro — usado com parcimônia) |
| **Background** | `#050505` (preto absoluto), gradiente preto→cinza-escuro |
| **Tipografia principal** | Cinzel 700 ou Bodoni Moda 700 (serifada dramática) |
| **Tipografia suporte** | Inter 300 light, tracking expandido (+3px) |
| **Tamanho headline** | 72-88px, espaçamento largo |
| **Efeitos de texto** | Sombra profunda `0 4px 20px rgba(0,0,0,0.8)`, reveal gradual (wipe) |
| **Camera motion** | `zoom_in` subtle e lento, `drift` mínimo, `static` dominante |
| **Text animations** | `fade` muito lento (1000ms+), `blur-in` dramático, `per-word` com pausas |
| **Transições** | `fade_black` 0.6-1.0s (dominante), `crossfade` lento |
| **Overlay** | Vignette pesada (0.70-0.85), gradiente radial escuro |
| **Partículas/efeitos** | Fumaça sutil, fog, sparks mínimos, reflexos metálicos |
| **Audio mood** | Drone/ambient escuro, percussão tribal, 60-80 BPM, silêncios dramáticos |
| **Marcas referência** | Hennessy, Tom Ford, Dior Sauvage, Game of Thrones, The Batman |

**Regra:** 70%+ do frame deve ser escuro. Luz pontual no sujeito. Menos é mais. Máximo 12 cortes/minuto.

---

### 1.11 Playful Colorful

**Quando usar:** Infantil, educação lúdica, games casual, apps de família, brinquedos, pet brands.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#FF6B6B` (coral), `#4ECDC4` (turquesa) |
| **Paleta secundária** | `#FFE66D` (amarelo sol), `#A78BFA` (lilás) |
| **Paleta de acento** | `#FF9F43` (laranja quente), `#FFFFFF` (texto) |
| **Background** | Gradientes pastel suaves, cor sólida clara por cena |
| **Tipografia principal** | Fredoka One 400 ou Baloo 2 800 (arredondada, divertida) |
| **Tipografia suporte** | Nunito 600-700 |
| **Tamanho headline** | 80-96px |
| **Efeitos de texto** | Stroke branco 3px, sombra colorida suave, rotação ±3 graus lúdica |
| **Camera motion** | `zoom_in` moderate, `bounce` (custom: spring com overshoot), `breathe` |
| **Text animations** | `bounce-in` (dominante), `scale-up` com overshoot, `per-word` rápido |
| **Transições** | `slide_horizontal` (dominante), `spin`, `crossfade` 0.3s |
| **Overlay** | Pattern suave (dots, waves, stars), opacidade 0.15-0.25 |
| **Partículas/efeitos** | Bolhas, estrelinhas, confetti colorido, sparkles, emojis flutuantes |
| **Audio mood** | Ukulele, glockenspiel, pop infantil, 100-120 BPM, melodia assobiável |
| **Marcas referência** | Duolingo, Headspace Kids, LEGO, Petlove, Sesame Street |

**Regra:** Mínimo 4 cores por vídeo. Formas arredondadas obrigatórias. Zero ângulos agressivos.

---

### 1.12 Editorial Documentary

**Quando usar:** Jornalismo, documentário, educação séria, conteúdo informativo, pesquisa, cases de estudo.

| Parâmetro | Valor |
|---|---|
| **Paleta primária** | `#1A1A1A` (quase preto), `#F5F5F5` (off-white) |
| **Paleta secundária** | `#2C3E50` (azul-cinza), `#95A5A6` (cinza médio) |
| **Paleta de acento** | `#E74C3C` (vermelho editorial — usado em destaques), `#FFFFFF` |
| **Background** | `#111111` (escuro), `#F0F0F0` (claro) — depende do tom |
| **Tipografia principal** | Source Serif Pro 700 ou Merriweather 700 (serifada editorial) |
| **Tipografia suporte** | Inter 400, IBM Plex Sans 400 (clean, legível) |
| **Tamanho headline** | 64-80px |
| **Efeitos de texto** | Nenhum. Linha vermelha de destaque abaixo do headline (underline editorial) |
| **Camera motion** | `ken-burns-in` moderate, `pan_right` moderate, `zoom_in` subtle |
| **Text animations** | `fade` 400ms, `slide-up` padrão, `typewriter` para dados |
| **Transições** | `crossfade` 0.4s (dominante), `fade_black` entre seções, `cut` para impacto |
| **Overlay** | Lower third sólido (barra inferior com nome/título), gradiente mínimo |
| **Partículas/efeitos** | Nenhum efeito decorativo. Gráficos de dados se relevante. Mapas, timelines |
| **Audio mood** | Ambient discreto, piano minimal, 70-90 BPM, silêncio como recurso |
| **Marcas referência** | The New York Times, Bloomberg, Netflix documentários, VICE, TED |

**Regra:** Informação > decoração. Lower thirds obrigatórios em entrevistas/depoimentos. Dados sempre com fonte citada.

---

## 2. Regras de Color Grading

### 2.1 Temperatura de Cor por Seção Narrativa

| Seção | Temperatura | Efeito emocional | Implementação |
|---|---|---|---|
| **Hook** | Fria (4500-5500K) | Tensão, desconforto, atenção | `filter: hue-rotate(-10deg) saturate(0.9)` |
| **Problema** | Fria/desaturada | Dor, frustração, identificação | `filter: saturate(0.7) brightness(0.85)` |
| **Solução** | Transição fria→quente | Alívio, esperança, mudança | Graduar de frio para quente ao longo da seção |
| **Benefit/Prova** | Quente (6500-7500K) | Confiança, resultado, satisfação | `filter: sepia(0.08) saturate(1.1) brightness(1.05)` |
| **CTA** | Cor da marca | Associação, identidade, ação | Aplicar cor primária da marca como dominante |

### 2.2 Combinações de Overlay por Mood

| Mood | Overlay principal | Overlay secundário | Opacidade |
|---|---|---|---|
| Energético | `linear-gradient(135deg, #FF450033, #FFD70022)` | Sem segundo overlay | 0.20-0.35 |
| Emocional | `radial-gradient(circle, transparent 40%, #00000066)` (vignette) | Warm tint `sepia(0.12)` | 0.35-0.50 |
| Premium | `linear-gradient(180deg, transparent, #00000044)` | Nenhum | 0.25-0.40 |
| Tech/Futurista | `linear-gradient(180deg, #00E5FF11, #39FF1411)` | Grain digital | 0.15-0.30 |
| Urgente/Promo | `linear-gradient(45deg, #FF005522, #FFD60022)` | Nenhum | 0.20-0.30 |

### 2.3 Quando Usar Filtros Especiais

| Filtro | Quando usar | Quando NÃO usar |
|---|---|---|
| **Sepia** | Nostalgia, flashback, heritage brands, before state | Tech, futurista, energético |
| **Desaturação parcial** (0.6-0.8) | Problema/dor, antes da solução, tom sério | CTA, benefit, celebração |
| **Desaturação total** (B&W) | Apenas em contraste before/after ou como estética editorial | Nunca no vídeo inteiro |
| **Alto contraste** | Hook, energético, streetwear, impacto | Emocional, premium, nature |
| **Alto saturação** (1.2-1.4) | Promoções, pop, playful, celebration | Corporate, editorial, premium |

### 2.4 Integração com Cor da Marca

**Regra obrigatória:** A cor primária da marca DEVE aparecer em pelo menos 3 momentos do vídeo:

1. **Texto do CTA** — cor da marca no texto ou no fundo do botão/caixa
2. **Acento visual** — elemento gráfico, borda, underline, ou partícula na cor da marca
3. **Último frame** — logo ou elemento de marca com cor primária dominante

**Regra de harmonia:** Se a cor da marca conflita com a paleta do estilo escolhido, usar a cor da marca apenas nos 3 pontos obrigatórios e manter a paleta do estilo no resto.

---

## 3. Tipografia e Kinetic Text

### 3.1 Pareamento de Fontes por Estilo

| Estilo | Headline (impacto) | Body (legibilidade) | Accent (destaque) |
|---|---|---|---|
| Neon Futurista | Space Grotesk 800 | Inter 400 | JetBrains Mono 400 |
| Premium Minimal | Playfair Display 700 | Inter 300 | — |
| Energético | Oswald 800 | Bebas Neue 400 | — |
| Emocional Cinematic | Lora 700 | Inter 400 | — |
| Corporate Clean | Inter 700 | Inter 400 | — |
| Streetwear Urban | Archivo Black 900 | Roboto Condensed 700 | — |
| Nature Organic | DM Serif Display 400 | Nunito 400 | — |
| Retro Vintage | Abril Fatface 400 | Courier Prime 400 | EB Garamond 400 |
| Bold Pop | Montserrat 900 | Poppins 700 | — |
| Dark Dramatic | Cinzel 700 | Inter 300 | — |
| Playful Colorful | Fredoka One 400 | Nunito 600 | — |
| Editorial Documentary | Source Serif Pro 700 | Inter 400 | IBM Plex Sans 400 |

**Regra:** Nunca usar mais de 2 fontes no mesmo vídeo. 3 fontes apenas se o estilo exigir accent monospace (tech/editorial).

### 3.2 Animação de Texto por Intenção Emocional

| Intenção emocional | Animação recomendada | Duração | Exemplo de uso |
|---|---|---|---|
| **Impacto/urgência** | `punch-in` | 150-250ms | Hook, revelação de problema |
| **Emoção/reflexão** | `per-word` (delay 200-300ms) | 600-1200ms total | Storytelling, benefit emocional |
| **Revelação/mistério** | `blur-in` | 400-600ms | Reveal de produto, nome de marca |
| **Informação/dados** | `typewriter` | 40-60ms/char | Estatísticas, números, provas |
| **Celebração/resultado** | `bounce-in` | 300-400ms | CTA, resultado positivo, prova social |
| **Profissionalismo/clareza** | `fade` | 300-500ms | Corporate, editorial, B2B |
| **Progressão/lista** | `split-lines` | 200ms/linha | Múltiplos benefícios, bullet points |
| **Autoridade/peso** | `scale-up` | 250-350ms | Headline principal, dado impactante |
| **Fluidez/continuidade** | `slide-up` | 300-400ms | Padrão para body text, legenda |

### 3.3 Lower Thirds (Barra Inferior de Identificação)

Padrão para identificação de pessoas, lugares ou dados:

```
┌──────────────────────────────────────┐
│                                      │
│                                      │
│                                      │
│   ┌────────────────────────┐         │
│   │ Nome / Título Principal│ ← 36px, Bold, cor da marca
│   │ Subtítulo / Cargo      │ ← 24px, Regular, branco 80%
│   └────────────────────────┘         │
└──────────────────────────────────────┘
```

| Campo | Especificação |
|---|---|
| **Posição** | Bottom-left, safe margin 80px inferior, 60px lateral |
| **Background** | Caixa semi-transparente `rgba(0,0,0,0.75)`, border-radius 8px |
| **Linha de acento** | Borda esquerda 4px na cor da marca |
| **Duração** | 3-5s com fade in 300ms / fade out 200ms |
| **Quando usar** | Depoimentos, citações, identificação de fonte/dado |

### 3.4 Subtítulos/Captions para Social Media

| Plataforma | Tamanho | Posição | Estilo |
|---|---|---|---|
| Reels/TikTok 9:16 | 42-52px | Center ou bottom (acima da UI: 180px do rodapé) | Bold, outline 2px preto, fundo opcional |
| Stories 9:16 | 38-48px | Center | Bold, caixa semi-transparente |
| YouTube 16:9 | 36-44px | Bottom center | Regular, caixa preta 70% opacity |
| Feed 1:1 | 40-50px | Bottom | Bold, outline 2px preto |

**Regra de caption:** Máximo 2 linhas visíveis simultaneamente. Máximo 15 palavras por tela de caption. Trocar a cada 2-3 segundos.

### 3.5 Comprimento Máximo de Texto por Formato

| Formato | Headline max | Subtext max | CTA max |
|---|---|---|---|
| Reels 9:16 | 4 palavras (20 chars) | 8 palavras (45 chars) | 4 palavras |
| Stories 9:16 | 3 palavras (15 chars) | 6 palavras (35 chars) | 3 palavras |
| Feed 1:1 | 5 palavras (25 chars) | 10 palavras (55 chars) | 5 palavras |
| YouTube 16:9 | 6 palavras (35 chars) | 12 palavras (65 chars) | 5 palavras |

### 3.6 Safe Areas para Texto (UI da Plataforma)

```
REELS / TIKTOK (9:16 = 1080x1920):
┌──────────────────────────┐
│ ░░░░░ ZONA MORTA ░░░░░░ │ ← 0-120px: UI do app (câmera, hora)
│                          │
│    ┌──────────────┐      │
│    │  SAFE ZONE   │      │ ← 120px - 1600px: zona segura
│    │  para texto   │      │
│    └──────────────┘      │
│                          │
│ ░░ ZONA DE RISCO ░░░░░░ │ ← 1600-1740px: botões de interação
│ ░░░░░ ZONA MORTA ░░░░░░ │ ← 1740-1920px: caption, nome de usuário
└──────────────────────────┘
Margens laterais: 60px cada lado
```

```
YOUTUBE (16:9 = 1920x1080):
┌──────────────────────────────────────┐
│                                      │
│    ┌──────────────────────────┐      │
│    │      SAFE ZONE           │      │ ← 60px de todas as bordas
│    │                          │      │
│    └──────────────────────────┘      │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ ← Últimos 80px: barra de progresso
└──────────────────────────────────────┘
```

```
FEED QUADRADO (1:1 = 1080x1080):
┌──────────────────────────┐
│ ░░ 80px topo ░░░░░░░░░░ │
│                          │
│    ┌──────────────┐      │ ← Margens 60px laterais
│    │  SAFE ZONE   │      │
│    └──────────────┘      │
│                          │
│ ░░ 100px base ░░░░░░░░░ │
└──────────────────────────┘
```

---

## 4. Gramática de Transições

### 4.1 Significado Narrativo de Cada Transição

| Transição | O que comunica | Duração padrão | Quando usar | Quando NÃO usar |
|---|---|---|---|---|
| **cut** (corte seco) | Energia, ritmo, continuidade temporal | 0s | Entre cortes do mesmo momento, hook, mudança rápida | Mudança emocional lenta, premium |
| **crossfade** (dissolve) | Passagem de tempo, conexão, suavidade | 0.3-0.8s | Mesmo bloco narrativo, emoção, reflexão | Momento de impacto, urgência |
| **fade_black** | Separação, pausa, fim de capítulo | 0.4-1.0s | Entre blocos narrativos, reset emocional | Dentro do mesmo bloco (quebra ritmo) |
| **fade_white** | Revelação positiva, aspiração, sonho | 0.3-0.5s | Before→After, revelação de produto, esperança | Problema, tensão, escuro |
| **wipe** (horizontal/vertical) | Progressão, comparação lado a lado | 0.3-0.5s | Before/After, comparação, carrossel de features | Storytelling emocional |
| **zoom_blur** (smash cut) | Impacto extremo, revelação dramática | 0.1-0.2s | Revelação de número, hook de segundo nível | Mais de 1x por vídeo |
| **glitch** | Disrupção, erro, digital, tech | 0.08-0.15s | Tech brands, transição de problema, streetwear | Premium, emocional, nature |
| **slide_horizontal** | Sequência, carrossel, próximo item | 0.25-0.4s | Lista de features, galeria de produtos | Storytelling linear |
| **spin** | Transformação, before→after | 0.4s | Reveals, comparações, promoções | Sério, editorial, corporate |
| **match_cut** | Conexão visual entre dois elementos | 0s | Objeto A → Objeto B com forma similar | Sem planejamento visual |

### 4.2 Duração de Transição por Mood

| Mood | Transição dominante | Duração média | % de cuts (corte seco) |
|---|---|---|---|
| Energético | cut | 0s | 80-90% |
| Premium | crossfade | 0.5-0.8s | 10-20% |
| Emocional | crossfade | 0.6-1.0s | 5-10% |
| Festivo | cut + slide | 0-0.3s | 60-70% |
| Inspiring | crossfade | 0.4-0.6s | 20-30% |
| Urbano | cut + glitch | 0-0.1s | 85-95% |
| Corporate | crossfade | 0.3-0.5s | 30-40% |

### 4.3 Regras de Uso

1. **Máximo 1 transição especial** (zoom_blur, glitch, spin) por vídeo — usar no ponto de maior impacto
2. **Nunca mesma transição 4x consecutivas** — mesmo que seja cut, intercalar com 1 crossfade
3. **fade_black entre blocos narrativos** — hook→problema pode ser cut, mas problema→solução deve ter fade_black
4. **Transição mais longa = respiração** — após sequência de cuts rápidos, 1 crossfade longo funciona como "respiro"
5. **CTA sempre termina com fade_black** — sensação de conclusão

---

## 5. Sincronização Áudio-Visual

### 5.1 Sincronização de Cortes com Beats

| Técnica | Quando usar | Como implementar |
|---|---|---|
| **Cut on downbeat** (tempos 1 e 3) | Impacto, poder, afirmação | Corte exatamente no beat forte da música |
| **Cut on offbeat** (tempos 2 e 4) | Tensão, surpresa, syncopation | Corte no contratempo |
| **Anticipation cut** (-2 frames antes do beat) | Sensação de momentum | Corte 66ms antes do beat (a 30fps) |
| **Text on beat** | Reforço de mensagem | Texto aparece sincronizado com beat forte |
| **Silence before impact** | Máximo impacto | 0.3-0.5s de silêncio antes de revelação |

### 5.2 Cue de Áudio para Aparição de Texto

| Momento | Efeito sonoro sugerido | Volume relativo |
|---|---|---|
| Headline aparece | Whoosh sutil ou click | -18dB abaixo da música |
| Número/dado aparece | Impact sound + bass drop | -12dB abaixo da música |
| CTA aparece | Rise sound (crescendo rápido) | -15dB abaixo da música |
| Transição de bloco | Reverse cymbal ou tape stop | -14dB abaixo da música |
| Logo reveal | Sonic logo da marca (se existir) | Volume igual à música |

### 5.3 Pacing de Narração por Duração de Cena

| Duração da cena | Palavras máximas | Ritmo de fala |
|---|---|---|
| 1.0-1.5s | 3-5 palavras | Rápido (180 WPM) |
| 1.5-2.5s | 5-8 palavras | Normal-rápido (160 WPM) |
| 2.5-4.0s | 8-14 palavras | Normal (140 WPM) |
| 4.0-6.0s | 14-22 palavras | Pausado (120 WPM) |
| 6.0s+ | 22+ palavras | Lento, com pausas (100 WPM) |

**Regra:** Narração nunca deve preencher 100% do tempo da cena. Deixar 0.3-0.5s de "ar" no final para a informação visual ser absorvida.

### 5.4 Gênero Musical por Estilo Visual

| Estilo visual | Gênero primário | Gênero alternativo | BPM range |
|---|---|---|---|
| Neon Futurista | Synthwave, Electro | Ambient electronica | 110-130 |
| Premium Minimal | Piano solo, Ambient | Cordas clássicas | 60-80 |
| Energético | EDM, Trap | Rock alternativo | 120-145 |
| Emocional Cinematic | Piano + cordas | Folk acústico | 70-90 |
| Corporate Clean | Ambient corporativo | Pop acústico suave | 80-100 |
| Streetwear Urban | Trap, Drill | Lo-fi hip hop | 130-150 |
| Nature Organic | Folk acústico | New age, Sons naturais | 70-90 |
| Retro Vintage | Jazz, Blues | Bossa nova, Oldies | 70-95 |
| Bold Pop | Pop comercial | Funk brasileiro | 100-120 |
| Dark Dramatic | Drone ambient | Percussão tribal | 60-80 |
| Playful Colorful | Ukulele pop | Glockenspiel, chiptune | 100-120 |
| Editorial Documentary | Piano minimal | Ambient discreto | 70-90 |

**Regra de mixagem:**
- Narração: 0dB (referência)
- Música: -10 a -14dB abaixo da narração
- SFX: -18 a -22dB abaixo da narração
- Normalização final: -14 LUFS para social media

---

## 6. Templates de Composição por Tipo de Cena

### 6.1 Hook Scene (Primeiros 2-3 Segundos)

**Objetivo:** Parar o scroll. O espectador decide em 1.5s se continua assistindo.

```
TEMPLATE HOOK A — Pergunta de Impacto:
┌──────────────────────────────────┐
│                                  │
│    "PERGUNTA QUE DÓI?"          │ ← Texto grande, center, punch-in
│                                  │
│    [imagem emocional de fundo]   │ ← Filtro escuro, zoom_in aggressive
│                                  │
└──────────────────────────────────┘
- Duração: 1.0-2.0s
- Motion: zoom_in aggressive ou push-in
- Text: center, 88-96px, punch-in
- Overlay: dark 0.50-0.60
- Transição out: cut

TEMPLATE HOOK B — Dado Impactante:
┌──────────────────────────────────┐
│                                  │
│           "87%"                  │ ← Número grande, scale-up
│    "dos profissionais..."        │ ← Subtext menor, fade 300ms depois
│                                  │
└──────────────────────────────────┘
- Duração: 1.5-2.5s
- Motion: static ou breathe
- Text: center, número em 108px + subtext em 48px
- Overlay: escuro sólido ou gradiente da marca
- Transição out: cut

TEMPLATE HOOK C — Visual Impactante (sem texto):
┌──────────────────────────────────┐
│                                  │
│    [imagem visualmente           │ ← Imagem de alto impacto
│     impactante, sem texto]       │ ← Movimento rápido chama atenção
│                                  │
└──────────────────────────────────┘
- Duração: 0.8-1.5s
- Motion: push-in aggressive
- Text: nenhum (visual puro)
- Overlay: mínimo 0.20
- Transição out: cut para hook_02 com texto
```

**Regras do Hook:**
1. Primeiro frame DEVE ter movimento (nunca estático)
2. Se houver texto, máximo 5 palavras
3. Contraste extremo (texto claro sobre escuro ou vice-versa)
4. Nunca começar com logo da marca (perda de 80% da atenção)

### 6.2 Product Showcase

**Objetivo:** Revelar o produto com clareza e desejo.

```
┌──────────────────────────────────┐
│                                  │
│    [produto em destaque]         │ ← Centro do frame, luz principal
│                                  │
│    ─── Nome do Produto ───       │ ← Bottom, gradient overlay
│    "Benefício em 1 frase"        │ ← Sub, slide-up
└──────────────────────────────────┘
```

| Campo | Valor |
|---|---|
| Duração | 3-5s |
| Motion | `zoom_out` moderate (revela o produto) ou `ken-burns-in` subtle |
| Composição | Produto centralizado, rule of thirds se houver texto lateral |
| Text position | bottom com gradiente |
| Text animation | `slide-up` ou `fade` |
| Overlay | Gradiente do rodapé, 0.45-0.60 |
| Transição out | `crossfade` 0.4s |

### 6.3 Testimonial / Social Proof

**Objetivo:** Criar credibilidade com prova real.

```
┌──────────────────────────────────┐
│                                  │
│    [foto de pessoa ou            │
│     comunidade]                  │
│                                  │
│  ┌────────────────────────┐      │
│  │ "Citação ou dado"      │      │ ← Lower third style
│  │  Nome — Contexto       │      │
│  └────────────────────────┘      │
└──────────────────────────────────┘
```

| Campo | Valor |
|---|---|
| Duração | 3-5s |
| Motion | `pan_right` subtle ou `drift` sutil |
| Composição | Pessoa/comunidade em 2/3 do frame, texto no 1/3 inferior |
| Text | Lower third com linha de acento na cor da marca |
| Text animation | `fade` 400ms |
| Overlay | Vignette sutil + gradiente bottom |
| Transição out | `crossfade` 0.5s |

### 6.4 CTA Scene

**Objetivo:** Direcionar uma ação clara. Clareza absoluta.

```
┌──────────────────────────────────┐
│                                  │
│    [imagem de marca ou           │
│     fundo com logo]              │
│                                  │
│    ┌──────────────────┐          │
│    │  AÇÃO CLARA AQUI │          │ ← Botão visual ou caixa
│    └──────────────────┘          │
│    site.com/link                 │ ← URL ou instrução
└──────────────────────────────────┘
```

| Campo | Valor |
|---|---|
| Duração | 4-6s (NUNCA menos que 3s) |
| Motion | `static` ou `breathe` (pulsação sutil) |
| Composição | Texto dominante, imagem como suporte |
| Text | center ou bottom, 80-96px, bold, cor da marca |
| Text animation | `fade` lento ou `scale-up` suave |
| Background text | `dark_box` opacidade 0.80 |
| Transição out | `fade_black` 0.6-1.0s |

**Regras do CTA:**
1. Máximo 6 palavras no texto principal
2. NUNCA movimento agressivo (confunde o espectador)
3. Texto do CTA visível por pelo menos 3 segundos
4. Cor da marca OBRIGATÓRIA no CTA
5. Se houver URL, exibir por pelo menos 4 segundos

### 6.5 Before/After

**Objetivo:** Demonstrar transformação visual clara.

```
OPÇÃO A — Split Screen:
┌──────────┬───────────┐
│  BEFORE  │  AFTER    │
│ (dessat) │ (vivido)  │
│          │           │
│ "Sem X"  │ "Com X"   │
└──────────┴───────────┘

OPÇÃO B — Sequencial:
Corte 1: [before, filtro frio/desaturado, 2s]
    → fade_black 0.4s →
Corte 2: [after, filtro quente/saturado, 3s]
```

| Campo | Before | After |
|---|---|---|
| Filtro | Desaturado 0.6, frio | Saturado 1.2, quente |
| Motion | `zoom_in` subtle (tensão) | `zoom_out` moderate (alívio) |
| Text | "Antes" ou label do problema | "Depois" ou label do resultado |
| Overlay | Dark, opacidade 0.55 | Light/warm, opacidade 0.30 |

---

## 7. Adaptações por Plataforma

### 7.1 Diferenças Fundamentais

| Parâmetro | Reels (9:16) | YouTube (16:9) | TikTok (9:16) | Stories (9:16) |
|---|---|---|---|---|
| **Resolução** | 1080x1920 | 1920x1080 | 1080x1920 | 1080x1920 |
| **FPS** | 30 | 24 ou 30 | 30 | 30 |
| **Duração ideal** | 15-30s (max 90s) | 60s-3min (Shorts: 60s) | 15-60s | 15s (max) |
| **Hook window** | 1.5s | 3s | 1.0s | 1.0s |
| **Texto max** | 4 palavras | 6 palavras | 3 palavras | 3 palavras |
| **Font size min** | 42px | 36px | 48px | 44px |
| **CTA style** | Texto on-screen | Texto + descrição | Texto + audio | Swipe up / link |
| **Ritmo** | Rápido (20-40 cortes/min) | Variado (10-25 cortes/min) | Muito rápido (30-50 cortes/min) | Rápido (1 mensagem/story) |

### 7.2 Safe Areas Específicas

**Instagram Reels:**
- Topo: 120px (hora, bateria)
- Base: 180px (caption, nome do usuário, botões)
- Direita: 80px (botões de interação: curtir, comentar, compartilhar)
- Esquerda: 60px

**TikTok:**
- Topo: 100px
- Base: 200px (caption maior que no Reels, botões)
- Direita: 100px (botões maiores: curtir, comentar, compartilhar, perfil)
- Esquerda: 60px

**YouTube Shorts:**
- Topo: 80px
- Base: 160px (título, canal, botões)
- Direita: 80px (botões)
- Esquerda: 60px

**Stories:**
- Topo: 140px (câmera, hora, nome da conta)
- Base: 120px (resposta, enviar mensagem)
- Laterais: 40px

### 7.3 O Que Funciona em Cada Plataforma

**Reels (Instagram):**
- Trending audio + visual impactante = máximo alcance
- Texto curto e bold (o usuário está scrollando rápido)
- CTA: "Salve para depois" / "Envie pra alguém"
- Formato ideal: 15-30s para alcance, 60s para retenção

**YouTube (Shorts + Standard):**
- Shorts: hook em 1s, valor em 30s, CTA verbal
- Standard: pode ser mais longo e informativo
- Sempre incluir captions/legendas (60% assiste sem som)
- Thumbnail customizada para standard (não para Shorts)

**TikTok:**
- Hook em 0.5-1.0s (mais implacável que qualquer outra plataforma)
- Texto nativo do TikTok funciona melhor que texto renderizado no vídeo
- Trends e sons virais multiplicam alcance 10x
- Edição hiper-rápida (35-50 cortes/minuto)

**Stories:**
- 1 mensagem por story (máximo 2 frases)
- Swipe up ou link na bio como CTA
- Visual limpo com foco em 1 elemento
- Efêmero: tom mais casual e direto

### 7.4 Formatos de Exportação

| Plataforma | Codec | Resolução | FPS | Bitrate | Formato |
|---|---|---|---|---|---|
| Instagram Reels | H.264 | 1080x1920 | 30 | 8-12 Mbps | MP4 |
| Instagram Feed | H.264 | 1080x1080 | 30 | 6-8 Mbps | MP4 |
| YouTube Standard | H.264 | 1920x1080 | 24/30 | 10-16 Mbps | MP4 |
| YouTube Shorts | H.264 | 1080x1920 | 30 | 8-12 Mbps | MP4 |
| TikTok | H.264 | 1080x1920 | 30 | 8-12 Mbps | MP4 |
| Stories | H.264 | 1080x1920 | 30 | 6-8 Mbps | MP4 |
| LinkedIn | H.264 | 1920x1080 | 30 | 8-12 Mbps | MP4 |

---

## 8. Processo de Seleção de Estilo

Quando o Video Pro agent receber um brief, seguir este processo para selecionar o estilo:

### Passo 1: Identificar o Tipo de Campanha

| Tipo de campanha | Estilos candidatos |
|---|---|
| Lançamento de produto tech | Neon Futurista, Corporate Clean |
| Marca de luxo / premium | Premium Minimal, Dark Dramatic |
| Promoção / venda | Bold Pop, Energético |
| Causa social / emocional | Emocional Cinematic, Nature Organic |
| Educação / curso | Neon Futurista, Editorial Documentary |
| Moda / cultura | Streetwear Urban, Bold Pop |
| Saúde / wellness | Nature Organic, Emocional Cinematic |
| B2B / SaaS | Corporate Clean, Editorial Documentary |
| Infantil / família | Playful Colorful, Nature Organic |
| Heritage / tradição | Retro Vintage, Emocional Cinematic |
| Investigação / dados | Editorial Documentary, Corporate Clean |
| Entretenimento jovem | Streetwear Urban, Playful Colorful |

### Passo 2: Cruzar com Personalidade da Marca

Ler `brand_identity.md` e cruzar tom da marca com o estilo:

| Tom da marca | Estilos compatíveis |
|---|---|
| Motivacional, empoderador | Neon Futurista, Energético |
| Sofisticado, elegante | Premium Minimal, Dark Dramatic |
| Divertido, casual | Playful Colorful, Bold Pop |
| Sério, confiável | Corporate Clean, Editorial Documentary |
| Rebelde, autêntico | Streetwear Urban, Retro Vintage |
| Acolhedor, humano | Emocional Cinematic, Nature Organic |

### Passo 3: Adaptar Paleta

Se a marca tem cores definidas em `brand_identity.md`:
1. Substituir a **paleta de acento** do estilo pela cor primária da marca
2. Manter a paleta primária e secundária do estilo (para consistência visual)
3. Garantir contraste mínimo 4.5:1 entre texto e fundo (WCAG AA)

### Passo 4: Documentar no Scene Plan

No JSON de saída, incluir o campo `art_direction`:

```json
{
  "art_direction": {
    "style": "neon_futurista",
    "style_secondary": null,
    "color_palette": {
      "primary": "#00E5FF",
      "secondary": "#39FF14",
      "accent": "#FFFFFF",
      "background": "#080C14"
    },
    "typography": {
      "headline": "Space Grotesk 800",
      "body": "Inter 400",
      "accent": "JetBrains Mono 400"
    },
    "mood": "energetic",
    "bpm_range": "110-130",
    "music_genre": "synthwave",
    "dominant_transition": "cut",
    "overlay_type": "radial dark gradient",
    "effects": ["cyan particles", "digital grid", "neon glow"]
  }
}
```

---

## 9. Checklist de Direção de Arte

Antes de finalizar qualquer scene plan, verificar TODOS os itens:

### Visual
- [ ] Estilo visual selecionado e documentado no campo `art_direction`
- [ ] Paleta de cores consistente em todas as cenas (máximo 5 cores no vídeo inteiro)
- [ ] Cor da marca presente em pelo menos 3 momentos (acento, CTA, último frame)
- [ ] Contraste texto/fundo suficiente em todas as cenas (WCAG AA: 4.5:1)
- [ ] Overlay aplicado em cenas com imagem clara sob texto
- [ ] Filtro de cor (color grading) segue regra de temperatura por seção

### Tipografia
- [ ] Máximo 2 fontes (3 se o estilo exigir accent monospace)
- [ ] Tamanhos de texto dentro dos limites do formato
- [ ] Texto dentro das safe areas da plataforma
- [ ] Nenhum texto em cortes < 0.8s
- [ ] Máximo 6 palavras por text_overlay
- [ ] Animação de texto coerente com intenção emocional

### Movimento
- [ ] Camera motion coerente com o estilo (premium = subtle, energético = aggressive)
- [ ] Nenhum motion repetido 2x consecutivas
- [ ] Intensidade segue a curva de energia (hook alto → dip → build → hold)
- [ ] CTA com motion static ou breathe (NUNCA aggressive)

### Transições
- [ ] Transição dominante coerente com mood (energético = cut, premium = crossfade)
- [ ] Máximo 1 transição especial (glitch, zoom_blur, spin) por vídeo
- [ ] fade_black entre blocos narrativos
- [ ] CTA termina com fade_black

### Áudio
- [ ] BPM da música dentro do range do estilo
- [ ] Gênero musical coerente com estilo visual
- [ ] Narração não preenche 100% do tempo (0.3-0.5s de ar por cena)
- [ ] Mixagem: narração 0dB, música -10 a -14dB, SFX -18dB

### Plataforma
- [ ] Safe areas respeitadas para a plataforma alvo
- [ ] Duração dentro do ideal para a plataforma
- [ ] Font size mínimo respeitado para o formato
- [ ] Resolução e FPS corretos para exportação

---

*Referência criada para timesmkt3 — Video Art Direction v1.0*
