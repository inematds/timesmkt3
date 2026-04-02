/**
 * Render 10 INEMA showcase videos via Remotion DynamicAd.
 * Each video: 60s (1800 frames @30fps), 1080x1920 (9:16).
 *
 * Usage: node render-10-inema.mjs
 */

import { execSync } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_DIR = resolve('../prj/inema/testes/10videos');
const FPS = 30;
const TOTAL_FRAMES = FPS * 60; // 60s

// INEMA brand palette
const INEMA_PALETTE = {
  coffee_dark: '#0D0D0D',     // dark background
  coffee_mid: '#1A1A2E',      // surface
  cold_blue: '#0099FF',       // cyan primary
  amber: '#00FF88',           // green neon accent
  off_white: '#FAFAF9',       // white text
};

// 12 frames per second × 5 scenes = 60s
// Each scene gets 360 frames (12s)
const SCENE_DUR = 360;

const videos = [
  // ── VIDEO 01: Hero's Journey — push-in/pull-out, blur-in/per-word text ──
  {
    id: 'video01_hero_journey',
    scenes: [
      { tipo: 'hook', img: 'neimaldaner.jpg', text: 'Você sente que pode\nir mais longe?', cam: 'push-in', textAnim: 'blur-in', pos: 'bottom', overlay: 'dark' },
      { tipo: 'tension', img: 'inemaclub1.jpg', text: 'O mundo pede que\nvocê evolua.', cam: 'ken-burns-out', textAnim: 'per-word', pos: 'center', overlay: 'dark' },
      { tipo: 'solution', img: 'inemaclub.jpg', text: 'INEMA: sua ponte\npara a transformação.', cam: 'ken-burns-in', textAnim: 'slide-up', pos: 'bottom', overlay: 'warm' },
      { tipo: 'benefit', img: 'inemavip.jpg', text: 'Resultados reais.\nConexões reais.', cam: 'parallax-zoom', textAnim: 'per-word', pos: 'top', overlay: 'dark' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'COMECE AGORA.\nINEMA.CLUB', cam: 'breathe', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 02: AIDA Premium — ultra-slow drift, scale-up text ──
  {
    id: 'video02_aida_premium',
    scenes: [
      { tipo: 'hook', img: 'neimaldaner2.jpg', text: 'ATENÇÃO', cam: 'drift', textAnim: 'scale-up', pos: 'center', overlay: 'dark' },
      { tipo: 'interest', img: 'inemaclub2.jpg', text: 'Seu negócio merece\nestratégia de verdade.', cam: 'drift', textAnim: 'fade', pos: 'bottom', overlay: 'dark' },
      { tipo: 'desire', img: 'inemaclub3.jpg', text: 'Marketing que gera\nresultado mensurável.', cam: 'drift', textAnim: 'slide-up', pos: 'bottom', overlay: 'cool' },
      { tipo: 'desire', img: 'inemavip.jpg', text: 'Imagine crescer 3x\nem 90 dias.', cam: 'drift', textAnim: 'per-word', pos: 'center', overlay: 'dark' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'Entre para o INEMA.CLUB\nLink na bio.', cam: 'breathe', textAnim: 'bounce-in', pos: 'bottom', overlay: 'dark' },
    ],
  },
  // ── VIDEO 03: PAS Energetic — pan movements, punch-in text ──
  {
    id: 'video03_pas_energetic',
    scenes: [
      { tipo: 'hook', img: 'tripe-profissional.jpg', text: 'Cansado de postar\ne ninguém comprar?', cam: 'pan-right', textAnim: 'punch-in', pos: 'bottom', overlay: 'dark' },
      { tipo: 'agitate', img: 'inemaclub4.jpg', text: 'Seus concorrentes\njá entenderam o jogo.', cam: 'pan-left', textAnim: 'slide-left', pos: 'center', overlay: 'dark' },
      { tipo: 'agitate', img: 'neimaldaner.jpg', text: 'E se continuar\nassim... vai ficar pra trás.', cam: 'pan-right', textAnim: 'blur-in', pos: 'bottom', overlay: 'warm' },
      { tipo: 'solution', img: 'inemaclub.jpg', text: 'INEMA resolve.\nEstratégia + execução.', cam: 'push-in', textAnim: 'per-word', pos: 'bottom', overlay: 'cool' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'ENTRE AGORA.\n@inema.club', cam: 'breathe', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 04: Edu-Tainment — typewriter text, ken-burns ──
  {
    id: 'video04_edutainment',
    scenes: [
      { tipo: 'hook', img: '-neimaldaner-banner.jpg', text: 'Você sabia que 90%\ndos negócios falham\nno marketing digital?', cam: 'ken-burns-in', textAnim: 'typewriter', pos: 'center', overlay: 'dark' },
      { tipo: 'curiosity', img: 'inemaclub1.jpg', text: 'O problema não é\na ferramenta...', cam: 'ken-burns-in', textAnim: 'per-word', pos: 'bottom', overlay: 'dark' },
      { tipo: 'reveal', img: 'inemaclub2.jpg', text: 'É a ESTRATÉGIA\npor trás dela.', cam: 'pull-out', textAnim: 'scale-up', pos: 'center', overlay: 'cool' },
      { tipo: 'solution', img: 'neimaldaner2.jpg', text: 'No INEMA.CLUB você\naprende o método\nque funciona.', cam: 'ken-burns-out', textAnim: 'split-lines', pos: 'bottom', overlay: 'dark' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'SALVE ESTE VÍDEO.\nInema.club — link na bio.', cam: 'breathe', textAnim: 'bounce-in', pos: 'bottom', overlay: 'dark' },
    ],
  },
  // ── VIDEO 05: Before/After — dramatic push/pull, blur transitions ──
  {
    id: 'video05_before_after',
    scenes: [
      { tipo: 'before', img: 'tripe-profissional.jpg', text: 'ANTES:\nSem direção. Sem resultado.', cam: 'ken-burns-out', textAnim: 'slide-down', pos: 'top', overlay: 'sepia' },
      { tipo: 'before', img: 'inemaclub4.jpg', text: 'Investindo errado.\nPerdendo tempo.', cam: 'ken-burns-out', textAnim: 'blur-in', pos: 'bottom', overlay: 'sepia' },
      { tipo: 'bridge', img: 'neimaldaner.jpg', text: 'ATÉ QUE...', cam: 'push-in', textAnim: 'scale-up', pos: 'center', overlay: 'dark' },
      { tipo: 'after', img: 'inemavip.jpg', text: 'DEPOIS:\nClientes todos os dias.\nMarca forte.', cam: 'ken-burns-in', textAnim: 'per-word', pos: 'bottom', overlay: 'cool' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'Sua transformação\ncomeça aqui. INEMA.CLUB', cam: 'breathe', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 06: AIDA Minimal — near-static, large text, clean ──
  {
    id: 'video06_aida_minimal',
    scenes: [
      { tipo: 'hook', img: 'neimaldaner2.jpg', text: 'E se você pudesse\nmudar tudo?', cam: 'breathe', textAnim: 'fade', pos: 'bottom', overlay: 'dark' },
      { tipo: 'interest', img: 'inemaclub3.jpg', text: 'Estratégia.\nExecução.\nResultado.', cam: 'breathe', textAnim: 'split-lines', pos: 'center', overlay: 'none' },
      { tipo: 'desire', img: 'inemaclub.jpg', text: 'O INEMA entrega\nos três.', cam: 'breathe', textAnim: 'slide-up', pos: 'bottom', overlay: 'dark' },
      { tipo: 'proof', img: 'inemavip.jpg', text: 'Quem entrou,\nnão voltou atrás.', cam: 'breathe', textAnim: 'per-word', pos: 'center', overlay: 'dark' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'INEMA.CLUB', cam: 'breathe', textAnim: 'scale-up', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 07: Hero Cinematic — pan sweeps, dramatic overlays ──
  {
    id: 'video07_hero_cinematic',
    scenes: [
      { tipo: 'hook', img: 'inemaclub1.jpg', text: 'Todo empreendedor\ncomeça sozinho.', cam: 'pan-left', textAnim: 'blur-in', pos: 'top', overlay: 'dark' },
      { tipo: 'call', img: 'neimaldaner.jpg', text: 'Mas a grandeza\nexige comunidade.', cam: 'pan-right', textAnim: 'per-word', pos: 'bottom', overlay: 'warm' },
      { tipo: 'journey', img: 'inemaclub.jpg', text: 'No INEMA, você não\ncaminha sozinho.', cam: 'pan-left', textAnim: 'slide-left', pos: 'center', overlay: 'dark' },
      { tipo: 'result', img: 'inemaclub2.jpg', text: 'Mentoria. Networking.\nCrescimento real.', cam: 'pan-right', textAnim: 'split-lines', pos: 'bottom', overlay: 'cool' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'Aceite o chamado.\nINEMA.CLUB', cam: 'breathe', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 08: PAS Luxury — zoom with sepia, elegant text ──
  {
    id: 'video08_pas_luxury',
    scenes: [
      { tipo: 'problem', img: 'inemaclub3.jpg', text: 'Seu marketing parece\ngenérico?', cam: 'ken-burns-out', textAnim: 'fade', pos: 'bottom', overlay: 'sepia' },
      { tipo: 'agitate', img: 'tripe-profissional.jpg', text: 'Posts sem alma.\nCopy sem estratégia.', cam: 'ken-burns-out', textAnim: 'typewriter', pos: 'center', overlay: 'sepia' },
      { tipo: 'agitate', img: 'inemaclub4.jpg', text: 'Enquanto isso, o mercado\nnão espera por você.', cam: 'pan-left', textAnim: 'slide-left', pos: 'bottom', overlay: 'dark' },
      { tipo: 'solution', img: 'neimaldaner2.jpg', text: 'INEMA cria marcas\nque vendem.', cam: 'ken-burns-in', textAnim: 'per-word', pos: 'bottom', overlay: 'warm' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'Fale com a gente.\nINEMA.CLUB', cam: 'breathe', textAnim: 'bounce-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 09: Edu-Tainment Bold — mixed energetic animations ──
  {
    id: 'video09_edutainment_bold',
    scenes: [
      { tipo: 'hook', img: '-neimaldaner-banner.jpg', text: 'POR QUE 80% dos\nnegócios digitais\nMORREM no 1o ano?', cam: 'push-in', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
      { tipo: 'curiosity', img: 'inemaclub1.jpg', text: 'Falta de método.\nFalta de mentoria.', cam: 'pan-right', textAnim: 'split-lines', pos: 'bottom', overlay: 'dark' },
      { tipo: 'content', img: 'inemaclub.jpg', text: 'Os que sobrevivem\ntêm uma coisa:\nESTRATÉGIA.', cam: 'pan-left', textAnim: 'per-word', pos: 'center', overlay: 'cool' },
      { tipo: 'reveal', img: 'neimaldaner.jpg', text: 'No INEMA.CLUB\nvocê aprende\no método completo.', cam: 'ken-burns-in', textAnim: 'split-lines', pos: 'bottom', overlay: 'warm' },
      { tipo: 'cta', img: 'inemavip.jpg', text: 'SALVE e compartilhe.\nINEMA.CLUB', cam: 'breathe', textAnim: 'punch-in', pos: 'center', overlay: 'dark' },
    ],
  },
  // ── VIDEO 10: Before/After Neon — maximum energy, aggressive movement ──
  {
    id: 'video10_before_after_neon',
    scenes: [
      { tipo: 'before', img: 'inemaclub4.jpg', text: 'ANTES:\nZero seguidores.\nZero vendas.', cam: 'pan-left', textAnim: 'punch-in', pos: 'top', overlay: 'dark' },
      { tipo: 'before', img: 'tripe-profissional.jpg', text: 'Tentou de tudo.\nNada funcionou.', cam: 'pan-right', textAnim: 'blur-in', pos: 'bottom', overlay: 'sepia' },
      { tipo: 'bridge', img: 'neimaldaner2.jpg', text: 'DEPOIS DO INEMA:', cam: 'push-in', textAnim: 'scale-up', pos: 'center', overlay: 'none' },
      { tipo: 'after', img: 'inemaclub.jpg', text: 'Marca posicionada.\nClientes no automático.', cam: 'parallax-zoom', textAnim: 'per-word', pos: 'bottom', overlay: 'cool' },
      { tipo: 'cta', img: 'conviteinemap.png', text: 'Mude sua história.\nINEMA.CLUB', cam: 'breathe', textAnim: 'bounce-in', pos: 'center', overlay: 'dark' },
    ],
  },
];

function buildProps(video) {
  let frameStart = 0;
  const scenes = video.scenes.map((s, i) => {
    const dur = i === video.scenes.length - 1 ? SCENE_DUR : SCENE_DUR;
    const scene = {
      scene_id: i + 1,
      tipo: s.tipo,
      nome: `Scene ${i + 1}`,
      frame_inicio: frameStart,
      frame_fim: frameStart + dur,
      duracao_frames: dur,
      descricao_visual: s.text,
      text_overlay: {
        texto: s.text,
        animacao: s.textAnim,
      },
      camera_effect: s.cam,
      background_image: s.img,
      overlay: s.overlay,
      overlay_opacity: s.overlay === 'none' ? 0 : s.overlay === 'sepia' ? 0.35 : 0.45,
      text_animation: s.textAnim,
    };
    frameStart += dur;
    return scene;
  });

  return {
    titulo: video.id,
    total_frames: TOTAL_FRAMES,
    paleta_cores: INEMA_PALETTE,
    cta_final: 'INEMA.CLUB',
    cta_acao: 'Comece Agora',
    scenes,
  };
}

// Render each video
for (const video of videos) {
  const outDir = `${OUTPUT_DIR}/${video.id}`;
  mkdirSync(outDir, { recursive: true });
  const outPath = `${outDir}/remotion_output.mp4`;
  const props = JSON.stringify(buildProps(video));

  console.log(`\n=== Rendering ${video.id} ===`);
  try {
    execSync(
      `npx remotion render DynamicAd "${outPath}" --props='${props.replace(/'/g, "'\\''")}' --codec=h264 --image-format=jpeg`,
      { cwd: resolve('.'), stdio: 'inherit', timeout: 300000 }
    );
    console.log(`✅ ${video.id} rendered`);
  } catch (e) {
    console.error(`❌ ${video.id} failed: ${e.message}`);
  }
}

console.log('\n🎬 All done!');
