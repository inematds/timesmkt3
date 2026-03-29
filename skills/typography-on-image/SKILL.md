# Typography on Image — Skill Reference

Guia de decisao para posicionamento e estilo de texto sobre imagens em video e ads.
Usado pelo Video Editor Agent, Ad Creative Designer e Scene Plan Generator.

---

## 1. Quando usar texto grande vs pequeno

### Texto GRANDE (60-140px em 1080p)
- Hook / abertura — impacto imediato, primeiros 2 segundos
- CTA final — chamada para acao com urgencia
- Headline principal — frase unica, max 5 palavras
- Numero/estatistica — "54%", "$9.99", "2x mais rapido"
- Nome da marca — quando e o foco da cena

### Texto MEDIO (36-58px em 1080p)
- Subtitulo explicativo — complementa o headline
- Beneficio — frase curta, 1 linha
- Depoimento curto — citacao de cliente
- Lower third — nome + cargo

### Texto PEQUENO (20-34px em 1080p)
- Disclaimer / legal — "termos se aplicam"
- URL / handle — "@marca" ou "marca.com"
- Credito de foto — canto inferior
- Hashtags — agrupadas, discretas

---

## 2. Onde posicionar baseado na composicao

### Regra dos tercos
Dividir o frame em 9 zonas (3x3). Texto deve ocupar zonas que NAO competem com o sujeito da imagem.

```
┌───────┬───────┬───────┐
│ ZONA1 │ ZONA2 │ ZONA3 │  ← top (12-25%)
├───────┼───────┼───────┤
│ ZONA4 │ ZONA5 │ ZONA6 │  ← center (40-60%)
├───────┼───────┼───────┤
│ ZONA7 │ ZONA8 │ ZONA9 │  ← bottom (70-88%)
└───────┴───────┴───────┘
```

### Posicao por conteudo da imagem

| Sujeito na imagem | Texto deve ir para |
|---|---|
| Pessoa centralizada | Top (zona 2) ou bottom (zona 8) |
| Paisagem com ceu | Bottom 2/3 (zonas 7-9) |
| Produto centralizado | Top (zona 1-3) ou sides (zona 4/6) |
| Cena com espaco negativo (ceu, parede, fundo solido) | Sobre o espaco negativo |
| Close-up de rosto | Evitar rosto; usar bottom ou top |
| Imagem lotada/complexa | Usar text_band ou overlay forte |

### REGRA CRITICA: NUNCA TEXTO EM BAIXO

A parte inferior do video (abaixo de 70%) e PROIBIDA para texto. Motivos:
- Instagram/TikTok/Reels: botoes de like, comentar, compartilhar, nome do perfil
- YouTube Shorts: botoes de inscricao, like, comentar
- Stories: barra de resposta, swipe up
- Facebook Reels: mesma UI do Instagram

**Posicoes permitidas: TOP e CENTER apenas.**

Texto em "bottom" sera automaticamente movido para "top" pelo renderer.

### Posicao por tipo de cena

| Tipo de cena | Posicao | Motivo |
|---|---|---|
| Hook | Top | Primeiro impacto, capa de revista |
| Beneficio | Top | Destaque sobre a imagem |
| Produto | Top | Produto embaixo, texto em cima |
| CTA | Center | Botao CTA abaixo do texto |
| Depoimento | Top | Aspas + texto editorial |
| Close/final | Top | Impacto final |
| Problema/tensao | Top | Contraste dramatico |
| Solucao | Top | Revelacao no topo |

---

## 3. Quando sobrepor texto vs quando nao

### SOBREPOR texto (com protecao)
- Imagens de fundo (paisagens, texturas, ambientes)
- Imagens com espaco negativo claro
- Imagens escuras/low-key — texto branco funciona direto
- Imagens claras/high-key — texto escuro funciona direto

**Protecao necessaria:**
- `overlay: 'dark'` + `overlay_opacity: 0.4-0.6` — para imagens medias
- `text_band: { style: 'gradient' }` — para manter parte da imagem visivel
- `text_band: { style: 'blur' }` — efeito moderno, legivel sem escurecer
- `shadow: true` no TextOverlay — minimo para qualquer texto sobre imagem

### NAO sobrepor texto
- Imagens com informacao visual importante em todo o frame
- Graficos, charts, infograficos — texto compete
- Produto com detalhes que precisam ser visiveis
- Fotos editoriais onde a composicao e o conteudo

**Alternativa:** usar split-screen ou fundo solido com imagem ao lado.

---

## 4. Combinacoes de fonte por estilo

### Editorial / Moda
- **Headline:** Playfair Display 700 — serif classico
- **Body:** Inter 400 — limpo, legivel
- **Uso:** campanhas premium, luxo, moda

### Tech / Moderno
- **Headline:** Space Grotesk 700 — geometrico
- **Body:** Inter 400
- **Uso:** SaaS, apps, tecnologia

### Bold / Esportivo
- **Headline:** Oswald 700 ou Bebas Neue 400 — condensado, impacto
- **Body:** Montserrat 500
- **Uso:** fitness, esporte, energia

### Elegante / Premium
- **Headline:** Playfair Display 600
- **Body:** Raleway 400
- **Uso:** joias, vinhos, gastronomia

### Jovem / Social
- **Headline:** Poppins 800
- **Body:** Poppins 400
- **Uso:** redes sociais, Gen Z, casual

### Profissional / Corporativo
- **Headline:** Montserrat 700
- **Body:** Inter 400
- **Uso:** B2B, LinkedIn, consultoria

---

## 5. Contraste e legibilidade

### Regra minima de contraste
- Texto claro sobre fundo escuro: cor do texto `#F0F0F0` ou mais claro
- Texto escuro sobre fundo claro: cor do texto `#1A1A1A` ou mais escuro
- NUNCA usar cinza medio (#888) sobre qualquer fundo

### Hierarquia visual
1. **Headline** — maior, mais pesado, cor primaria
2. **Subtitulo** — menor, peso medio, mesma cor ou levemente mais suave
3. **Body/CTA** — tamanho medio, cor de destaque (amber, azul, verde)
4. **Legal/disclaimer** — menor, peso leve, opacidade reduzida (0.6-0.8)

### Text shadow — quando usar
- Sempre sobre imagens fotograficas (mesmo com overlay)
- Nunca sobre fundos solidos
- Valor recomendado: `0 4px 24px rgba(0,0,0,0.6)` para claro sobre escuro
- Valor para escuro sobre claro: `0 2px 12px rgba(255,255,255,0.4)`

---

## 6. Regras de adaptacao por formato

### 9:16 (Stories/Reels/TikTok)
- Safe zone: 8-65% vertical — UNICA zona segura para texto
- NUNCA texto abaixo de 65% — UI das redes sociais cobre tudo abaixo:
  - Instagram: like, comentar, compartilhar, nome do perfil, audio
  - TikTok: mesmos botoes + descricao do video
  - YouTube Shorts: inscricao, like, comentar
  - Stories: barra de resposta, stickers, swipe up
- Headline no terco SUPERIOR (8-30%)
- Texto secundario no centro (30-50%)
- NADA abaixo de 65%

### 1:1 (Feed)
- Mais espaco horizontal, menos vertical
- Texto pode ser mais largo (maxWidth: 95%)
- Centralizar é seguro

### 16:9 (YouTube/horizontal)
- Lower thirds funcionam bem
- Texto nos cantos e valido
- Evitar centro exato (muito broadcast)

---

## 7. Scene plan — campos de tipografia

O agente de video deve preencher estes campos no scene plan para cada cena:

```json
{
  "text_overlay": "Texto da cena",
  "text_position": "top|center|bottom",
  "text_color": "#FFFFFF",
  "text_layout": {
    "font_size": 60,
    "font_weight": 800,
    "font_family": "Playfair Display",
    "line_height": 1.15,
    "position": "bottom",
    "color": "#FFFFFF"
  },
  "text_band": {
    "style": "gradient",
    "color": "#000000",
    "opacity": 0.5,
    "height": "35%"
  },
  "overlay": "dark",
  "overlay_opacity": 0.45
}
```

**Decisao automatica pelo agente:**
1. Analisar o `image_prompt` ou `descricao_visual` da cena
2. Se a imagem tem sujeito centralizado → texto em top ou bottom
3. Se a imagem tem espaco negativo → texto sobre o espaco
4. Se o texto tem mais de 8 palavras → usar font_size menor
5. Se e hook ou CTA → usar fonte bold/condensada (Oswald, Bebas)
6. Se e depoimento → usar fonte serif (Playfair) em italico
7. Sempre incluir text_band em cenas com muita informacao visual
