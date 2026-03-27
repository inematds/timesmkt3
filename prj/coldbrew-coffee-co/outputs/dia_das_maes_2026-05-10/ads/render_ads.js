const { chromium } = require('playwright');
const path = require('path');

const ADS_DIR = path.resolve(__dirname);

const carouselSlides = [
  { html: 'carousel_01.html', png: 'carousel_01.png', width: 1080, height: 1080 },
  { html: 'carousel_02.html', png: 'carousel_02.png', width: 1080, height: 1080 },
  { html: 'carousel_03.html', png: 'carousel_03.png', width: 1080, height: 1080 },
  { html: 'carousel_04.html', png: 'carousel_04.png', width: 1080, height: 1080 },
  { html: 'carousel_05.html', png: 'carousel_05.png', width: 1080, height: 1080 },
];

const stories = [
  { html: 'story_01.html', png: 'story_01.png', width: 1080, height: 1920 },
  { html: 'story_02.html', png: 'story_02.png', width: 1080, height: 1920 },
  { html: 'story_03.html', png: 'story_03.png', width: 1080, height: 1920 },
];

const allAds = [...carouselSlides, ...stories];

(async () => {
  console.log('Launching Chromium...');
  const browser = await chromium.launch();

  for (const ad of allAds) {
    const htmlPath = path.join(ADS_DIR, ad.html);
    const pngPath = path.join(ADS_DIR, ad.png);

    console.log(`Rendering ${ad.html} -> ${ad.png} (${ad.width}x${ad.height})`);

    const page = await browser.newPage();
    await page.setViewportSize({ width: ad.width, height: ad.height });
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' });

    // Wait a bit for any CSS transitions to settle
    await page.waitForTimeout(300);

    await page.screenshot({
      path: pngPath,
      clip: { x: 0, y: 0, width: ad.width, height: ad.height },
    });

    await page.close();
    console.log(`  ✓ Saved: ${ad.png}`);
  }

  await browser.close();
  console.log('\nAll ads rendered successfully!');
})();
