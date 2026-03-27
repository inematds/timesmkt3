const { chromium } = require('playwright');
const path = require('path');

(async () => {
  console.log('🚀 Launching Playwright headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport to exact Instagram square dimensions
  await page.setViewportSize({ width: 1080, height: 1080 });
  console.log('📐 Viewport set to 1080x1080');

  // Build absolute file path to ad.html
  const adPath = path.resolve(__dirname, 'outputs/test_job_payload_1_20260315/ads/ad.html');
  const fileUrl = 'file:///' + adPath.replace(/\\/g, '/');
  console.log(`📄 Loading: ${fileUrl}`);

  // Navigate to ad.html and wait for images to load
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  console.log('✅ Page loaded, images rendered');

  // Small extra wait to ensure fonts are fully loaded
  await page.waitForTimeout(1000);

  // Capture the screenshot clipped to 1080x1080
  const outputPath = path.resolve(__dirname, 'outputs/test_job_payload_1_20260315/ads/instagram_ad.png');
  await page.screenshot({
    path: outputPath,
    clip: { x: 0, y: 0, width: 1080, height: 1080 }
  });
  console.log(`📸 Screenshot saved: ${outputPath}`);

  await browser.close();
  console.log('🎉 Done! Ad rendered successfully.');
})();
