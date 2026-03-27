/**
 * KIE Image Generation
 *
 * Generates images via KIE API (Flux Kontext, GPT-Image-1, etc.)
 * Polls for completion and downloads the result.
 *
 * Usage (CLI):
 *   node pipeline/generate-image-kie.js <output.jpg> "<prompt>" [model] [aspect_ratio]
 *
 * Models:
 *   flux-kontext-pro   — fast, high quality (default)
 *   flux-kontext-max   — slower, maximum quality
 *   gpt-image-1        — OpenAI GPT-Image-1 style
 *
 * Aspect ratios:
 *   1:1   — square (Instagram carousel, 1080x1080)
 *   9:16  — portrait (Stories, Reels, 1080x1920)
 *   16:9  — landscape (YouTube thumbnail)
 *   4:3   — standard
 *   3:4   — portrait standard
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const KIE_API_KEY = process.env.KIE_API_KEY;
const BASE_URL = 'https://api.kie.ai';

const MODELS = {
  'flux-kontext-pro': { endpoint: '/api/v1/flux/kontext/generate', pollEndpoint: '/api/v1/flux/kontext/record-info', type: 'flux' },
  'flux-kontext-max': { endpoint: '/api/v1/flux/kontext/generate', pollEndpoint: '/api/v1/flux/kontext/record-info', type: 'flux' },
  'gpt-image-1':      { endpoint: '/api/v1/gpt4o-image/generate',  pollEndpoint: '/api/v1/jobs/recordInfo',            type: 'gpt' },
};

// Exported list for use in prompts and confirmations
const AVAILABLE_MODELS = [
  { id: 'flux-kontext-pro', label: 'Flux Kontext Pro (rápido, alta qualidade)' },
  { id: 'flux-kontext-max', label: 'Flux Kontext Max (mais lento, qualidade máxima)' },
  { id: 'gpt-image-1',      label: 'GPT-Image-1 (estilo OpenAI)' },
];

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + urlPath);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function downloadFile(fileUrl, outputPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const file = fs.createWriteStream(outputPath);
    const protocol = fileUrl.startsWith('https') ? https : http;

    protocol.get(fileUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(outputPath); });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function pollForResult(taskId, modelConfig, maxWaitMs = 300000) {
  const start = Date.now();
  const interval = 4000;

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, interval));

    const pollUrl = `${modelConfig.pollEndpoint}?taskId=${taskId}`;
    const result = await apiRequest('GET', pollUrl);

    if (modelConfig.type === 'flux') {
      const d = result.data;
      if (!d) throw new Error(`Poll error: ${JSON.stringify(result)}`);
      if (d.successFlag === 1) return d.response?.resultImageUrl || d.response?.originImageUrl;
      if (d.successFlag === 2 || d.successFlag === 3) throw new Error(`Generation failed (flag ${d.successFlag})`);
      // successFlag === 0 means still generating
    } else {
      // gpt / market
      const d = result.data;
      if (!d) throw new Error(`Poll error: ${JSON.stringify(result)}`);
      if (d.state === 'success') {
        const parsed = JSON.parse(d.resultJson || '{}');
        return parsed.resultUrls?.[0] || parsed.url;
      }
      if (d.state === 'fail') throw new Error(`Generation failed`);
    }
  }

  throw new Error(`Timeout waiting for image generation (${maxWaitMs / 1000}s)`);
}

async function generateImage(outputPath, prompt, model = 'flux-kontext-pro', aspectRatio = '1:1') {
  if (!KIE_API_KEY) throw new Error('KIE_API_KEY not set in .env');

  const modelConfig = MODELS[model];
  if (!modelConfig) throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODELS).join(', ')}`);

  console.log(`Generating image: model=${model} ratio=${aspectRatio}`);
  console.log(`Prompt: ${prompt.slice(0, 100)}...`);

  let taskId;

  if (modelConfig.type === 'flux') {
    const body = {
      prompt,
      model,
      aspectRatio,
      outputFormat: outputPath.endsWith('.png') ? 'png' : 'jpeg',
      enableTranslation: true,
      promptUpsampling: false,
      safetyTolerance: 2,
    };
    const res = await apiRequest('POST', modelConfig.endpoint, body);
    if (res.code !== 200) throw new Error(`KIE API error: ${res.msg} (${res.code})`);
    taskId = res.data?.taskId;
  } else {
    // gpt-image-1
    const sizeMap = { '1:1': '1:1', '9:16': '2:3', '16:9': '3:2', '3:4': '2:3', '4:3': '3:2' };
    const body = {
      prompt,
      size: sizeMap[aspectRatio] || '1:1',
      isEnhance: false,
    };
    const res = await apiRequest('POST', modelConfig.endpoint, body);
    if (res.code !== 200) throw new Error(`KIE API error: ${res.msg} (${res.code})`);
    taskId = res.data?.taskId;
  }

  if (!taskId) throw new Error('No taskId returned from KIE API');
  console.log(`Task ID: ${taskId} — polling for result...`);

  const imageUrl = await pollForResult(taskId, modelConfig);
  if (!imageUrl) throw new Error('No image URL in result');

  console.log(`Downloading: ${imageUrl.slice(0, 80)}...`);
  await downloadFile(imageUrl, outputPath);
  console.log(`✅ Image saved: ${outputPath}`);

  return outputPath;
}

// CLI mode
if (require.main === module) {
  const [,, outputArg, promptArg, modelArg = 'flux-kontext-pro', ratioArg = '1:1'] = process.argv;
  if (!outputArg || !promptArg) {
    console.error('Usage: node pipeline/generate-image-kie.js <output.jpg> "<prompt>" [model] [aspect_ratio]');
    console.error('\nAvailable models:');
    AVAILABLE_MODELS.forEach(m => console.error(`  ${m.id} — ${m.label}`));
    process.exit(1);
  }
  generateImage(outputArg, promptArg, modelArg, ratioArg)
    .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { generateImage, AVAILABLE_MODELS };
