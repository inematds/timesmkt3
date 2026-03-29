# Manual — Componentes Remotion (v4.2.8)

## Visao geral

O diretorio `remotion-ad/` contem o renderer de video profissional usado pelo Video Pro. Baseado em React + Remotion, permite composicoes animadas com camera, texto, efeitos visuais e audio.

### Arquitetura

```
remotion-ad/
├── src/
│   ├── Root.tsx              ← Registra composicoes + carrega fontes
│   ├── DynamicAd.tsx         ← Composicao principal (cenas + audio + overlays)
│   ├── scenes/
│   │   └── DynamicScene.tsx  ← Cena dinamica (resolve tipo, camera, texto, efeitos)
│   └── components/
│       ├── CameraMotion.tsx      ← Efeitos de camera + color grading
│       ├── TextOverlay.tsx       ← Animacoes de texto
│       ├── TextBackgroundBand.tsx← Faixa localizada atras do texto
│       ├── CTAButton.tsx         ← Botao CTA animado
│       ├── LowerThird.tsx        ← Barra inferior com info
│       ├── Subtitles.tsx         ← Legendas sincronizadas
│       ├── ParticleEffects.tsx   ← Particulas decorativas
│       ├── SplitScreen.tsx       ← Tela dividida
│       ├── ProgressBar.tsx       ← Barra de progresso estilo stories
│       ├── KineticText.tsx       ← Tipografia cinetica
│       ├── ProductImage.tsx      ← Imagem de produto com animacao
│       ├── SceneBackgrounds.tsx  ← Fundos solidos, gradientes, efeitos
│       └── SVGIcons.tsx          ← Icones decorativos
└── public/                   ← Assets estaticos (imagens, audio)
```

---

## DynamicAd — Composicao principal

Recebe props JSON com o scene plan completo. Monta:
1. Audio (narracao + musica de fundo)
2. Sequencia de cenas com transicoes (overlap de frames)
3. Subtitles globais (acima de todas as cenas)
4. Progress bar global

### Props principais
| Campo | Tipo | Descricao |
|---|---|---|
| `scenes` | `SceneData[]` | Array de cenas |
| `paleta_cores` | `Record<string,string>` | Cores da marca |
| `narration_file` | `string` | Caminho para arquivo de narracao |
| `background_music` | `string` | Caminho para musica de fundo |
| `subtitles` | `SubtitleSegment[]` | Legendas globais |
| `progress_bar` | `'stories'│'line'│'dots'│false` | Estilo da barra de progresso |

---

## CameraMotion — 12 efeitos

| Efeito | Movimento | Uso tipico |
|---|---|---|
| `ken-burns-in` | Zoom lento para dentro | Intimidade, emocao |
| `ken-burns-out` | Zoom lento para fora | Revelar, establishing |
| `pan-left` | Panorama da direita para esquerda | Movimento, passagem |
| `pan-right` | Panorama da esquerda para direita | Movimento, passagem |
| `pan-up` | Panorama de baixo para cima | Esperanca, ascensao |
| `pan-down` | Panorama de cima para baixo | Calma, assentamento |
| `drift` | Flutuacao sutil aleotoria | Sonho, suavidade |
| `parallax-zoom` | Zoom com deriva vertical | Dinamismo |
| `push-in` | Zoom rapido para o sujeito | Drama, impacto |
| `pull-out` | Zoom rapido para tras | Revelacao |
| `tilt-shift` | Zoom com rotacao sutil | Artistico |
| `breathe` | Pulso sutil de escala | Foto viva, CTA |

### Color Grading

CSS filters aplicados a imagem de fundo:
```json
{
  "color_grading": {
    "brightness": 1.1,
    "contrast": 1.2,
    "saturate": 0.8,
    "sepia": 0.2,
    "hueRotate": 10
  }
}
```

### Overlays
| Tipo | Cor |
|---|---|
| `dark` | Preto com opacidade |
| `light` | Branco com opacidade |
| `warm` | Marrom quente |
| `cool` | Azul frio |
| `sepia` | Sepia + desaturacao |
| `none` | Transparente |

---

## TextOverlay — 11 animacoes

| Animacao | Comportamento |
|---|---|
| `fade` | Fade in simples |
| `slide-up` | Sobe com spring |
| `slide-down` | Desce com spring |
| `slide-left` | Vem da direita |
| `slide-right` | Vem da esquerda |
| `per-word` | Palavra por palavra com slide |
| `punch-in` | Palavra por palavra com escala |
| `typewriter` | Letra por letra com cursor |
| `blur-in` | Desfoque que abre |
| `scale-up` | Cresce de 50% a 100% |
| `bounce-in` | Palavra por palavra com bounce |

### Props
| Prop | Tipo | Default |
|---|---|---|
| `fontSize` | number | 60 |
| `color` | string | '#F9F5F0' |
| `fontFamily` | string | 'Inter, sans-serif' |
| `fontWeight` | number | 800 |
| `position` | 'top'│'center'│'bottom' | 'center' |
| `positionPercent` | number | — (ignora `position` se definido) |
| `animation` | TextAnimation | 'slide-up' |
| `startFrame` | number | 10 |

---

## TextBackgroundBand — Faixa de protecao

Gradiente localizado atras do texto (nao overlay full-frame).

| Estilo | Efeito |
|---|---|
| `gradient` | Gradiente transparente → opaco (default) |
| `solid` | Faixa solida com opacidade |
| `blur` | Fundo desfocado (backdrop-filter) |
| `glass` | Glassmorphism (blur + borda sutil) |

---

## CTAButton — 4 estilos

| Estilo | Visual |
|---|---|
| `solid` | Fundo solido com sombra (default) |
| `glass` | Glassmorphism (backdrop-blur + borda) |
| `outline` | Transparente com borda colorida |
| `pill` | Pilula com sombra colorida |

Animacao: spring scale-in + pulso sutil apos entrada.

---

## LowerThird — Barra inferior

| Estilo | Visual |
|---|---|
| `bar` | Barra com accent colorido na esquerda (default) |
| `pill` | Pilula arredondada |
| `glass` | Glassmorphism |
| `minimal` | Texto com sombra, sem fundo |

Animacao: slide-in lateral com spring.

---

## Subtitles — Legendas sincronizadas

Cada segmento tem `startFrame`, `endFrame` e `text`. Fade in/out automatico.

| Estilo | Visual |
|---|---|
| `default` | Caixa preta arredondada |
| `bold` | Caixa maior, fonte 900 |
| `karaoke` | Highlight amarelo palavra por palavra |
| `minimal` | Texto com sombra, sem caixa |

Podem ser definidas por cena (`scene.subtitles`) ou globais (`props.subtitles`).

---

## ParticleEffects

| Tipo | Efeito |
|---|---|
| `bokeh` | Circulos desfocados flutuantes (luzes) |
| `dust` | Particulas pequenas subindo |
| `sparkle` | Brilhos que piscam |
| `glitch` | Barras horizontais coloridas (digital) |

Pseudo-aleatorio determinístico — mesmo frame sempre gera o mesmo resultado.

---

## SplitScreen — Antes/Depois

| Direcao | Divisao |
|---|---|
| `horizontal` | Esquerda/direita |
| `vertical` | Cima/baixo |

| Animacao | Entrada |
|---|---|
| `slide` | Spring animado (default) |
| `reveal` | Interpolacao linear |
| `instant` | Aparece direto |

Labels opcionais nos lados.

---

## ProgressBar — Barra de progresso

| Estilo | Visual |
|---|---|
| `stories` | Segmentos separados (estilo Instagram Stories) |
| `line` | Barra continua unica |
| `dots` | Pontos, ativo = largo |

Segmentos proporcionais a duracao de cada cena.

---

## KineticText — Tipografia cinetica

| Estilo | Animacao |
|---|---|
| `grow` | Palavras crescem de pequeno a grande |
| `wave` | Palavras oscilam verticalmente |
| `stagger-scale` | Escala staggered com spring |
| `rotate-in` | Rotacao -90° a 0° |
| `elastic` | Bounce elastico com translate |
| `slam` | Scale 3x → 0.9 → 1 (impacto) |

### Beat sync
Prop `beats` aceita array de frame numbers onde a musica tem batida.
Nos frames proximos a um beat, o texto pulsa (scale 1.15x).

---

## Fontes Google carregadas

| Fonte | Uso tipico |
|---|---|
| Inter | Default, interfaces, geral |
| Montserrat | Profissional, corporativo |
| Playfair Display | Serif classico, editorial, luxo |
| Oswald | Condensado, impacto, esporte |
| Space Grotesk | Geometrico, tech, moderno |
| Poppins | Jovem, social, casual |
| Raleway | Elegante, leve |
| Bebas Neue | Ultra-condensado, titulos grandes |

### Uso no scene plan
```json
{
  "text_layout": {
    "font_family": "Playfair Display"
  }
}
```
O adapter normaliza via `FONT_MAP` (aceita nomes curtos: "playfair", "bebas", "space grotesk").

---

## Transicoes entre cenas

| Tipo | Efeito |
|---|---|
| `crossfade` | Fade cruzado (default para cenas 2+) |
| `fade_black` | Fade para preto antes de entrar |
| `slide_left` | Proxima cena entra pela direita |
| `slide_right` | Proxima cena entra pela esquerda |
| `wipe` | Clip-path horizontal |
| `none` | Corte seco |

Duracao default: 10 frames (1/3 segundo a 30fps).

---

## SceneData — Campos completos

```typescript
interface SceneData {
  scene_id: number;
  tipo: string;                    // hook, benefit, cta, etc.
  nome?: string;
  frame_inicio: number;
  frame_fim: number;
  duracao_frames: number;
  descricao_visual: string;
  text_overlay: {
    texto: string;
    animacao?: string;
    cor?: string;
    posicao?: 'top' | 'center' | 'bottom';
    tamanho?: number;
    peso?: number;
    line_height?: number;
    font_family?: string;
  };
  background_image?: string;
  camera_effect?: CameraEffect;
  overlay?: 'dark' | 'light' | 'warm' | 'cool' | 'sepia' | 'none';
  overlay_opacity?: number;
  blur?: number;
  color_grading?: ColorGrading;
  transition?: 'crossfade' | 'fade_black' | 'slide_left' | 'slide_right' | 'wipe' | 'none';
  transition_duration?: number;
  text_band?: { style?: string; color?: string; opacity?: number; height?: string; };
  lower_third?: { text: string; subtext?: string; style?: string; };
  subtitles?: SubtitleSegment[];
  subtitle_style?: string;
  cta_style?: 'solid' | 'glass' | 'outline' | 'pill';
  particles?: { type?: string; count?: number; color?: string; opacity?: number; };
  split_screen?: { leftSrc: string; rightSrc: string; direction?: string; animation?: string; };
  kinetic_text?: { style?: string; beats?: number[]; };
}
```
