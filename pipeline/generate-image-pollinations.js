/**
 * Pollinations.ai Image Generation
 *
 * Generates images via Pollinations.ai — free, no polling, GET request returns binary.
 *
 * Usage (CLI):
 *   node pipeline/generate-image-pollinations.js <output.jpg> "<prompt>" [model] [aspect_ratio]
 *
 * Models:
 *   flux             — FLUX.1 Schnell, padrão, rápido (3–8s)
 *   zimage           — Z-Image Turbo com upscaling 2x, mais detalhado (5–12s)
 *   kontext          — FLUX.1 Kontext, melhor para edição em contexto
 *   gptimage         — GPT Image 1 Mini (OpenAI)
 *   nanobanana-pro   — Gemini 3 Pro Image (4K)
 *
 * Aspect ratios:
 *   1:1   — square (Instagram carousel, 1080x1080)
 *   9:16  — portrait (Stories, Reels, 1080x1920)
 *   16:9  — landscape (YouTube thumbnail, 1920x1080)
 *
 * Auth:
 *   Set POLLINATIONS_TOKEN in .env for Seed tier (1 req/5s, no watermark).
 *   Without token: anonymous (1 req/15s).
 *
 * Docs: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = 'https://image.pollinations.ai';
const DEFAULT_MODEL = 'flux';
const POLLINATIONS_TOKEN = process.env.POLLINATIONS_TOKEN || null;

const ASPECT_RATIO_SIZES = {
  '1:1':  { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '4:3':  { width: 1080, height: 810  },
  '3:4':  { width: 810,  height: 1080 },
};

const AVAILABLE_MODELS = [
  { id: 'flux',           label: 'FLUX Schnell (padrão, rápido)' },
  { id: 'zimage',         label: 'Z-Image Turbo (upscaling 2x, mais detalhado)' },
  { id: 'kontext',        label: 'FLUX.1 Kontext (edição em contexto)' },
  { id: 'gptimage',       label: 'GPT Image 1 Mini (OpenAI)' },
  { id: 'nanobanana-pro', label: 'Gemini 3 Pro Image (4K)' },
];

// Rate limit: Seed = 5s, anonymous = 15s
const RATE_LIMIT_MS = POLLINATIONS_TOKEN ? 5000 : 15000;
let lastRequestTime = 0;

async function throttle() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function downloadBinary(url, outputPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const file = fs.createWriteStream(outputPath);
    const protocol = url.startsWith('https') ? https : http;

    const doGet = (targetUrl) => {
      const headers = POLLINATIONS_TOKEN
        ? { Authorization: `Bearer ${POLLINATIONS_TOKEN}` }
        : {};

      protocol.get(targetUrl, { headers }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return downloadBinary(res.headers.location, outputPath).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(outputPath, () => {});
          return reject(new Error(`HTTP ${res.statusCode} from Pollinations`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(outputPath); });
      }).on('error', (err) => {
        fs.unlink(outputPath, () => {});
        reject(err);
      });
    };

    doGet(url);
  });
}

async function generateImage(outputPath, prompt, model = DEFAULT_MODEL, aspectRatio = '1:1') {
  const size = ASPECT_RATIO_SIZES[aspectRatio] || ASPECT_RATIO_SIZES['1:1'];

  const params = new URLSearchParams({
    model,
    width:   size.width,
    height:  size.height,
    seed:    Math.floor(Math.random() * 9999999),
    nologo:  'true',
    enhance: 'false',
    private: 'false',
  });

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${BASE_URL}/prompt/${encodedPrompt}?${params.toString()}`;

  console.log(`[Pollinations] model=${model} ratio=${aspectRatio} (${size.width}x${size.height})`);
  console.log(`[Pollinations] prompt: ${prompt.slice(0, 120)}...`);

  await throttle();

  await downloadBinary(url, outputPath);
  console.log(`[Pollinations] ✅ saved: ${outputPath}`);
  return outputPath;
}

// CLI mode
if (require.main === module) {
  const [,, outputArg, promptArg, modelArg, ratioArg = '1:1'] = process.argv;
  if (!outputArg || !promptArg) {
    console.error('Usage: node pipeline/generate-image-pollinations.js <output.jpg> "<prompt>" [model] [aspect_ratio]');
    console.error('\nAvailable models:');
    AVAILABLE_MODELS.forEach(m => console.error(`  ${m.id} — ${m.label}`));
    console.error('\nRate limit:', POLLINATIONS_TOKEN ? '1 req/5s (Seed)' : '1 req/15s (anônimo — defina POLLINATIONS_TOKEN no .env)');
    process.exit(1);
  }
  generateImage(outputArg, promptArg, modelArg || DEFAULT_MODEL, ratioArg)
    .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { generateImage, AVAILABLE_MODELS, DEFAULT_MODEL, RATE_LIMIT_MS };
