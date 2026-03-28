# Layout & Typography Rules — Motion Director

Referência para posicionamento de texto, safe areas e legibilidade em vídeos verticais (1080×1920) e quadrados (1080×1080).

---

## Safe Areas — Obrigatório

Nunca posicionar texto fora dessas zonas seguras:

| Formato | Margem superior | Margem inferior | Margem lateral |
|---|---|---|---|
| 1080×1920 (vertical) | 120px | 120px | 80px |
| 1080×1080 (quadrado) | 80px | 100px | 60px |

**Por quê:** Telas de smartphones cortam bordas. Instagram/TikTok adicionam UI (botões, nome de usuário) nas bordas.

---

## Posição do Texto por Tipo de Cena

### `top` — Topo
- Usado em: `hook`, `tension`
- Por quê: No hook, o texto deve aparecer antes do olho processar a imagem — topo captura atenção imediata
- Nunca usar se: houver rosto no terço superior da imagem

### `center` — Centro
- Usado em: `product_showcase`, mensagens de impacto único
- Por quê: Centraliza a atenção, cria simetria visual
- Nunca usar se: o produto ou elemento principal estiver no centro

### `bottom` — Rodapé
- Usado em: `benefit`, `social_proof`, `cta`
- Por quê: Convenção de legenda — espectador já treinado para ler ali
- Sempre com safe area mínima de 120px do rodapé em vídeo vertical

---

## Tamanho de Fonte por Contexto

| Situação | Font Size | Justificativa |
|---|---|---|
| Hook — texto curto (≤20 chars) | 96–108px | Impacto máximo, domina o frame |
| Hook — texto médio (21–40 chars) | 80–88px | Ainda impactante, sem quebrar linha |
| Benefit / social_proof | 64–72px | Legível em movimento, sem dominar |
| CTA | 72–88px | Deve ser claro e destacado |
| Texto longo (>40 chars) | 52–60px + quebra de linha | Nunca sacrificar legibilidade |

**Regra de quebra de linha:** Texto com >35 caracteres deve ser quebrado em 2 linhas pelo agente antes de entregar ao renderer. Usar `\n` como separador.

---

## Fundo do Texto

### `dark_box`
Caixa semi-transparente atrás do texto.
- Usar quando: imagem tem área clara ou colorida onde o texto fica ilegível
- Padding: 24px em torno do texto
- Border-radius: 12px
- Opacidade: 0.65–0.80

### `gradient`
Gradiente escuro cobrindo a região do texto (do limite até a borda).
- Usar quando: texto está no rodapé ou topo e a imagem tem gradiente natural
- Extensão: 35–45% da altura do frame
- Opacidade: 0.55–0.70

### `none`
Sem fundo — texto direto sobre a imagem.
- Usar apenas quando: imagem é escura o suficiente (tom médio < 80/255) NA ÁREA DO TEXTO
- Sempre adicionar `shadowcolor=black@0.9` no drawtext como fallback

---

## Cor do Texto

| Fundo da imagem na área do texto | Cor recomendada |
|---|---|
| Escuro (< 80/255) | `#FFFFFF` branco puro |
| Médio | `#FFFFFF` com shadow black |
| Claro (> 180/255) | `#FFFFFF` com dark_box obrigatório |
| Colorido | `#FFFFFF` com dark_box |

**Nunca usar:** texto colorido sobre imagem colorida — sempre branco ou preto com contraste garantido.

---

## Alinhamento

- **Sempre centralizado horizontalmente** para vídeos de feed/stories
- Exceção: layouts de split-screen ou texto com produto ao lado

---

## Regra Anti-Sobreposição

Antes de definir a posição do texto, identificar na imagem:
1. Onde está o rosto (se houver) → texto nunca sobre o rosto
2. Onde está o produto central → texto nunca sobre ele
3. Onde há espaço neutro (céu, fundo, parede) → posicionar texto ali

Se não houver espaço neutro → usar `dark_box` com opacidade 0.80.
