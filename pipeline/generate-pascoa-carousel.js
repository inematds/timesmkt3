#!/usr/bin/env node
/**
 * INEMA Páscoa 2026 — Carousel Generator
 * Campaign: c0031-pascoa2026
 * Creates 7 × 1080×1080 carousel slides and renders via Playwright
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = '/home/nmaldaner/projetos/timesmkt2';
const IMG = `${BASE}/prj/inema/imgs/pascoa`;
const OUT = `${BASE}/prj/inema/outputs/c0031-pascoa2026/ads`;

fs.mkdirSync(OUT, { recursive: true });

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  bg: '#0D0D1A',
  white: '#FFFFFF',
  green: '#00FF88',
  cyan: '#0099FF',
  gold: '#FFD700',
};

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap');
`;

// ─── Slide data ────────────────────────────────────────────────────────────────
const slides = [
  {
    id: '01',
    type: 'capa',
    image: `${IMG}/slide01_capa.jpg`,
    imageFit: 'contain',
    imageBg: '#0D0D1A',
    headlineLine1: 'Os 7 Ovos de IA',
    headlineLine2: 'para Abrir Essa Páscoa',
    headlineEmoji: '🐣',
    subtext: 'O presente que nunca expira',
    accentColor: '#FFD700',
  },
  {
    id: '02',
    type: 'benefit',
    image: `${IMG}/pex02_easter_egg_tech.jpg`,
    imageFit: 'cover',
    num: '01',
    headlineLine1: 'Prompt',
    headlineLine2: 'Engineering',
    headlineEmoji: '🧠',
    subtext: 'Quem sabe se comunicar com IA comanda o futuro',
    badge: 'Ovo 1 de 7',
    accentColor: '#0099FF',
  },
  {
    id: '03',
    type: 'benefit',
    image: `${IMG}/pex01_easter_egg_glow.jpg`,
    imageFit: 'cover',
    num: '02',
    headlineLine1: 'Automação',
    headlineLine2: 'Inteligente',
    headlineEmoji: '⚡',
    subtext: 'Sistemas que trabalham enquanto você dorme',
    badge: 'Ovo 2 de 7',
    accentColor: '#00FF88',
  },
  {
    id: '04',
    type: 'benefit',
    image: `${IMG}/easter_tech_31080746.jpg`,
    imageFit: 'cover',
    num: '03',
    headlineLine1: 'Agentes',
    headlineLine2: 'de IA',
    headlineEmoji: '🤖',
    subtext: 'Seu exército digital de produtividade',
    badge: 'Ovo 3 de 7',
    accentColor: '#0099FF',
  },
  {
    id: '05',
    type: 'benefit',
    image: `${IMG}/pex03_easter_egg_bokeh.jpg`,
    imageFit: 'cover',
    num: '04',
    headlineLine1: 'Vibe',
    headlineLine2: 'Coding',
    headlineEmoji: '🚀',
    subtext: 'Crie software com linguagem natural — sem programar',
    badge: 'Ovo 4 de 7',
    accentColor: '#FFD700',
  },
  {
    id: '06',
    type: 'benefit',
    image: `${IMG}/easter_tech_4135641.jpg`,
    imageFit: 'cover',
    num: '05',
    headlineLine1: 'IA na Sua',
    headlineLine2: 'Profissão',
    headlineEmoji: '🎯',
    subtext: 'Médico, advogado, designer, professor — todos usam IA agora',
    badge: 'Ovo 5 de 7',
    accentColor: '#00FF88',
  },
  {
    id: '07',
    type: 'cta',
    image: `${IMG}/pex09_easter_rabbit.jpg`,
    imageFit: 'cover',
    headlineLine1: 'Todos esses ovos',
    headlineLine2: 'são de graça',
    headlineEmoji: '🥚✨',
    subtext: 'Trilhas completas. 100% gratuito. Sem truques.',
    ctaLine1: 'Comece grátis: inema.club',
    ctaLine2: 'Comunidade VIP: inema.vip — R$ 35/mês',
    accentColor: '#00FF88',
  },
];

// ─── Base CSS ──────────────────────────────────────────────────────────────────
function baseStyles() {
  return `
    ${FONTS}
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1080px; height: 1080px; overflow: hidden;
      background: #0D0D1A;
      font-family: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    }
    .slide {
      position: relative;
      width: 1080px; height: 1080px;
      overflow: hidden;
    }
    .bg-image {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
    }
    .overlay {
      position: absolute; inset: 0;
      background: linear-gradient(
        160deg,
        rgba(13,13,26,0.82) 0%,
        rgba(13,13,26,0.58) 50%,
        rgba(13,13,26,0.78) 100%
      );
    }
    .content {
      position: relative; z-index: 10;
      width: 100%; height: 100%;
      display: flex; flex-direction: column;
      padding: 68px;
    }
    .brand-tag {
      position: absolute; bottom: 50px; right: 64px;
      z-index: 20;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 22px; font-weight: 700; letter-spacing: 0.12em;
      color: rgba(255,255,255,0.50);
      text-transform: uppercase;
    }
    .brand-tag span { color: rgba(0,255,136,0.75); }
    .neon-line {
      height: 3px; border-radius: 9999px;
      margin: 28px 0;
    }
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(22px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.88); }
      to   { opacity: 1; transform: scale(1); }
    }
  `;
}

// ─── Slide 01 — CAPA ──────────────────────────────────────────────────────────
function buildSlideCapa(s) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles()}
.bg-image { object-fit: ${s.imageFit}; background: ${s.imageBg}; }
.overlay-capa {
  position: absolute; inset: 0;
  background: linear-gradient(to top,
    rgba(13,13,26,0.92) 0%,
    rgba(13,13,26,0.55) 45%,
    rgba(13,13,26,0.18) 100%);
}
.inema-logo {
  position: absolute; top: 48px; left: 64px; z-index: 20;
  font-size: 26px; font-weight: 800; letter-spacing: 0.14em; color: #fff;
  text-transform: uppercase;
}
.inema-logo span { color: #00FF88; }
.content-capa {
  position: relative; z-index: 10;
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  justify-content: center; align-items: center; text-align: center;
  padding: 68px;
}
.capa-badge {
  background: rgba(255,215,0,0.12);
  border: 1.5px solid rgba(255,215,0,0.40);
  backdrop-filter: blur(8px);
  padding: 10px 32px; border-radius: 9999px;
  font-size: 19px; font-weight: 700; letter-spacing: 0.14em;
  color: #FFD700; text-transform: uppercase;
  margin-bottom: 32px;
  animation: scaleIn 0.4s ease both;
}
.capa-headline {
  font-size: 96px; font-weight: 800; line-height: 1.06;
  letter-spacing: -0.015em; color: #fff;
  text-shadow: 0 4px 16px rgba(0,0,0,0.85), 0 0 80px rgba(255,215,0,0.20);
  animation: fadeUp 0.5s ease both 0.05s;
}
.capa-headline .accent { color: #FFD700; }
.capa-emoji { font-size: 70px; margin-top: 14px;
  animation: scaleIn 0.5s ease both 0.15s; }
.capa-sub {
  font-size: 42px; font-weight: 500; color: rgba(255,255,255,0.82);
  margin-top: 20px; letter-spacing: 0.03em;
  text-shadow: 0 2px 8px rgba(0,0,0,0.6);
  animation: fadeUp 0.55s ease both 0.20s;
}
</style></head><body>
<div class="slide">
  <img class="bg-image" src="file://${s.image}" />
  <div class="overlay-capa"></div>
  <div class="inema-logo">INE<span>MA</span></div>
  <div class="content-capa">
    <div class="capa-badge">Carrossel Páscoa 2026</div>
    <h1 class="capa-headline">
      Os 7 Ovos de IA<br>
      <span class="accent">para Abrir Essa Páscoa</span>
    </h1>
    <div class="capa-emoji">🐣</div>
    <p class="capa-sub">O presente que nunca expira</p>
  </div>
  <div class="brand-tag">inema<span>.club</span></div>
</div>
</body></html>`;
}

// ─── Slides 02-06 — BENEFIT ───────────────────────────────────────────────────
function buildSlideBenefit(s) {
  const ac = s.accentColor;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles()}
.bg-image { object-fit: cover; object-position: center; }
.num-ghost {
  position: absolute; top: 40px; right: 50px; z-index: 5;
  font-size: 120px; font-weight: 800; letter-spacing: -0.04em;
  color: rgba(255,255,255,0.06);
  font-variant-numeric: tabular-nums;
  animation: fadeUp 0.4s ease both;
}
.badge {
  display: inline-block;
  background: ${ac}; color: #0D0D1A;
  padding: 8px 22px; border-radius: 9999px;
  font-size: 18px; font-weight: 700; letter-spacing: 0.10em;
  text-transform: uppercase; margin-bottom: 28px;
  animation: scaleIn 0.4s ease both;
}
.headline {
  font-size: 96px; font-weight: 800; line-height: 1.05;
  color: #fff; letter-spacing: -0.012em;
  text-shadow: 0 3px 16px rgba(0,0,0,0.78);
  animation: fadeUp 0.5s ease both 0.04s;
}
.headline .accent { color: ${ac}; }
.emoji { font-size: 54px; margin-top: 10px;
  animation: scaleIn 0.45s ease both 0.08s; }
.sub {
  font-size: 38px; font-weight: 500; line-height: 1.42;
  color: rgba(255,255,255,0.86); max-width: 800px; margin-top: 22px;
  text-shadow: 0 2px 8px rgba(0,0,0,0.55);
  animation: fadeUp 0.55s ease both 0.12s;
}
</style></head><body>
<div class="slide">
  <img class="bg-image" src="file://${s.image}" />
  <div class="overlay"></div>
  <span class="num-ghost">${s.num}</span>
  <div class="content">
    <div class="badge">${s.badge}</div>
    <h2 class="headline">
      ${s.headlineLine1}<br>
      <span class="accent">${s.headlineLine2}</span>
    </h2>
    <div class="emoji">${s.headlineEmoji}</div>
    <div class="neon-line" style="background:${ac};box-shadow:0 0 14px ${ac}99;width:88px;"></div>
    <p class="sub">${s.subtext}</p>
  </div>
  <div class="brand-tag">inema<span>.club</span></div>
</div>
</body></html>`;
}

// ─── Slide 07 — CTA ───────────────────────────────────────────────────────────
function buildSlideCTA(s) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles()}
.bg-image { object-fit: cover; object-position: center top; }
.overlay-cta {
  position: absolute; inset: 0;
  background: linear-gradient(
    155deg,
    rgba(13,13,26,0.88) 0%,
    rgba(13,13,26,0.62) 50%,
    rgba(13,13,26,0.80) 100%
  );
}
.cta-headline {
  font-size: 84px; font-weight: 800; line-height: 1.06;
  color: #fff; letter-spacing: -0.015em;
  text-shadow: 0 3px 16px rgba(0,0,0,0.82);
  animation: fadeUp 0.5s ease both;
}
.cta-headline .accent { color: #00FF88; }
.cta-emoji { font-size: 54px; margin-top: 10px;
  animation: scaleIn 0.45s ease both 0.06s; }
.cta-sub {
  font-size: 36px; font-weight: 500; color: rgba(255,255,255,0.80);
  margin-top: 16px; max-width: 780px; line-height: 1.45;
  text-shadow: 0 2px 8px rgba(0,0,0,0.5);
  animation: fadeUp 0.5s ease both 0.10s;
}
.cta-block {
  margin-top: 40px; display: flex; flex-direction: column; gap: 16px;
  animation: scaleIn 0.5s ease both 0.25s;
}
.btn {
  display: inline-block; padding: 20px 52px;
  border-radius: 9999px; font-size: 30px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  width: fit-content;
}
.btn-primary {
  background: #00FF88; color: #0D0D1A;
  box-shadow: 0 4px 32px rgba(0,255,136,0.45);
}
.btn-secondary {
  background: rgba(255,255,255,0.12);
  backdrop-filter: blur(12px);
  border: 1.5px solid rgba(255,255,255,0.28);
  color: #fff;
  box-shadow: 0 4px 24px rgba(0,153,255,0.25);
}
</style></head><body>
<div class="slide">
  <img class="bg-image" src="file://${s.image}" />
  <div class="overlay-cta"></div>
  <div class="content">
    <h2 class="cta-headline">
      ${s.headlineLine1}<br>
      <span class="accent">${s.headlineLine2}</span>
    </h2>
    <div class="cta-emoji">${s.headlineEmoji}</div>
    <div class="neon-line" style="background:#00FF88;box-shadow:0 0 14px #00FF8899;width:100px;"></div>
    <p class="cta-sub">${s.subtext}</p>
    <div class="cta-block">
      <div class="btn btn-primary">${s.ctaLine1}</div>
      <div class="btn btn-secondary">${s.ctaLine2}</div>
    </div>
  </div>
  <div class="brand-tag">inema<span>.vip</span></div>
</div>
</body></html>`;
}

function buildHTML(s) {
  if (s.type === 'capa')   return buildSlideCapa(s);
  if (s.type === 'cta')    return buildSlideCTA(s);
  return buildSlideBenefit(s);
}

// ─── Render loop ───────────────────────────────────────────────────────────────
async function renderAll() {
  const browser = await chromium.launch();
  const layouts = [];

  for (const s of slides) {
    const prefix   = `c0031-pascoa2026_carousel_${s.id}`;
    const htmlPath = path.join(OUT, `${prefix}.html`);
    const pngPath  = path.join(OUT, `${prefix}.png`);

    const html = buildHTML(s);
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`[HTML] ${prefix}.html`);

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1080, height: 1080 });
    await page.goto(`file://${htmlPath}`);
    await page.waitForTimeout(950);
    await page.screenshot({ path: pngPath });
    await page.close();
    console.log(`[PNG]  ${prefix}.png`);

    layouts.push({
      filename: `${prefix}.png`,
      html_source: `${prefix}.html`,
      dimensions: '1080x1080',
      slide_number: parseInt(s.id),
      concept: s.type,
      copy_source: 'narrative.json → carousel_texts',
      headline: `${s.headlineLine1} ${s.headlineLine2 || ''}`.trim(),
      subtext: s.subtext || null,
      accent_color: s.accentColor,
      images_used: [s.image],
    });
  }

  await browser.close();

  const layoutJson = {
    campaign_id: 'c0031-pascoa2026',
    campaign_date: '2026-03-31',
    generated_at: new Date().toISOString(),
    format: 'carousel_1080x1080',
    total_slides: slides.length,
    image_source: 'folder:prj/inema/imgs/pascoa/',
    slides: layouts,
  };
  fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layoutJson, null, 2), 'utf8');
  console.log('\n✓ layout.json saved');
  console.log(`✓ ${slides.length} slides rendered → ${OUT}`);
  console.log('[STAGE2_IMAGE_READY]');
}

renderAll().catch(e => { console.error(e); process.exit(1); });
