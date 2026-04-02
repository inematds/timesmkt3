/**
 * capture-screenshots.js
 * Captures website screenshots using Playwright for use as image assets in the pipeline.
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Get image dimensions via ffprobe (same logic as worker.js)
 */
function getImageDimensions(imagePath) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', imagePath,
    ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
    const info = JSON.parse(out.toString());
    const s = info.streams && info.streams[0];
    if (s && s.width && s.height) {
      const w = s.width, h = s.height;
      const ratio = w / h;
      const orientation = ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';
      return { width: w, height: h, orientation, ratio: ratio.toFixed(2) };
    }
  } catch {}
  return null;
}

/**
 * Sanitize a URL into a safe filename segment
 */
function sanitizeUrl(url) {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/**
 * Capture screenshots from an array of URLs.
 * @param {string[]} urls - URLs to capture
 * @param {string} outputDir - Campaign output dir (absolute path)
 * @param {object} options
 * @returns {Array<{path, imageType, width, height, orientation, ratio}>}
 */
async function captureScreenshots(urls, outputDir, options = {}) {
  const {
    viewports = [
      { width: 1080, height: 1920, label: 'mobile' },
      { width: 1920, height: 1080, label: 'desktop' },
    ],
    waitTimeout = 15000,
    fullPage = false,
  } = options;

  const screenshotDir = path.join(outputDir, 'imgs', 'screenshots');
  fs.mkdirSync(screenshotDir, { recursive: true });

  const assets = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    let idx = 0;
    for (const url of urls) {
      idx++;
      const slug = sanitizeUrl(url);

      for (const vp of viewports) {
        const filename = `screenshot_${String(idx).padStart(2, '0')}_${vp.label}_${slug}.png`;
        const filePath = path.join(screenshotDir, filename);

        // Skip if already captured (rerun optimization)
        if (fs.existsSync(filePath)) {
          const dims = getImageDimensions(filePath);
          if (dims) {
            assets.push({ path: filePath, imageType: 'screenshot', ...dims });
          }
          continue;
        }

        try {
          const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: 1,
          });
          const page = await context.newPage();

          await page.goto(url.startsWith('http') ? url : `https://${url}`, {
            waitUntil: 'networkidle',
            timeout: waitTimeout,
          });

          // Wait for animations/lazy-load to settle
          await page.waitForTimeout(1500);

          // Try to dismiss cookie banners
          try {
            const cookieSelectors = [
              'button[data-testid="cookie-accept"]',
              '.cookie-accept', '.accept-cookies',
              'button:has-text("Aceitar")', 'button:has-text("Accept")',
              'button:has-text("OK")', 'button:has-text("Concordo")',
            ];
            for (const sel of cookieSelectors) {
              const btn = await page.$(sel);
              if (btn) { await btn.click().catch(() => {}); break; }
            }
          } catch {}

          await page.screenshot({ path: filePath, fullPage });
          await context.close();

          const dims = getImageDimensions(filePath);
          if (dims) {
            assets.push({ path: filePath, imageType: 'screenshot', ...dims });
          }

          console.log(`  [screenshot] ${vp.label} ${url} → ${filename}`);
        } catch (err) {
          console.error(`  [screenshot] FAILED ${vp.label} ${url}: ${err.message.slice(0, 100)}`);
        }
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  return assets;
}

/**
 * Extract URLs from campaign files (brief, research, product_campaign).
 * Returns deduplicated URL array.
 */
function extractUrlsFromFiles(filePaths) {
  const urlSet = new Set();
  const urlRegex = /https?:\/\/[^\s"'<>\])+,]+/gi;
  const domainRegex = /\b([a-zA-Z0-9-]+\.(club|com|com\.br|io|dev|app|org|net|ai))\b/gi;

  for (const fp of filePaths) {
    if (!fs.existsSync(fp)) continue;
    const content = fs.readFileSync(fp, 'utf-8');

    // Full URLs
    const fullUrls = content.match(urlRegex) || [];
    for (const u of fullUrls) {
      urlSet.add(u.replace(/[.,;:)}\]]+$/, ''));  // strip trailing punctuation
    }

    // Bare domains (e.g. "inema.club")
    const domains = content.match(domainRegex) || [];
    for (const d of domains) {
      if (!d.includes('.') || d.length < 5) continue;
      // Skip common non-website domains
      if (/\.(json|md|js|css|html|png|jpg|mp4|mp3)$/i.test(d)) continue;
      urlSet.add(`https://${d}`);
    }
  }

  return [...urlSet];
}

module.exports = { captureScreenshots, extractUrlsFromFiles };
