const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ADS_DIR = path.resolve(__dirname);
const OUT_DIR = path.join(ADS_DIR, 'img');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const slides = [
  { html: 'slide1.html', out: 'slide1_hook.png' },
  { html: 'slide2.html', out: 'slide2_conexao.png' },
  { html: 'slide3.html', out: 'slide3_produto.png' },
  { html: 'slide4.html', out: 'slide4_momento.png' },
  { html: 'slide5.html', out: 'slide5_cta.png' },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1080 });

  for (const slide of slides) {
    const htmlPath = `file://${path.join(ADS_DIR, slide.html)}`;
    const outPath = path.join(OUT_DIR, slide.out);

    console.log(`Rendering ${slide.html} → ${slide.out}`);
    await page.goto(htmlPath, { waitUntil: 'networkidle' });

    // Aguarda fontes e imagens carregarem
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: outPath,
      clip: { x: 0, y: 0, width: 1080, height: 1080 },
    });

    console.log(`  ✓ Saved: ${outPath}`);
  }

  await browser.close();
  console.log('\nTodos os slides renderizados com sucesso!');
})();
