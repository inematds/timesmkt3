/**
 * generate-image-piramyd.js — Image generation via Piramyd API (OpenAI-compatible).
 *
 * Piramyd API: https://api.piramyd.cloud/v1/images/generations
 * Format: OpenAI DALL-E compatible (model, prompt, n, size)
 * Rate limit: ~10 requests/minute
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PIRAMYD_URL = 'https://api.piramyd.cloud/v1/images/generations';
const PIRAMYD_API_KEY = process.env.PIRAMYD_API_KEY || '';
const DEFAULT_MODEL = 'dall-e-3';

function buildImagePrompt(brief, brand, format, index, total, sceneType, sceneDescription, modelId) {
  const isStory = format.includes('1920') || format.includes('9:16');
  const orientation = isStory ? 'vertical portrait' : 'square';

  const moodMap = {
    hook: 'dramatic tension, high contrast, strong impact',
    tension: 'emotional challenge, aspiration',
    solution: 'transformation, empowerment, positive energy',
    social_proof: 'community, people, belonging',
    cta: 'optimistic, inviting, forward momentum',
  };
  const mood = moodMap[sceneType] || moodMap.solution;
  const visualScene = sceneDescription || 'professional cinematic scene';
  const colorHint = brand?.colors?.length ? `Colors: ${brand.colors.slice(0, 2).join(', ')}.` : '';

  const parts = [
    visualScene + '.',
    mood + '.',
    orientation + '.',
    colorHint,
    'Cinematic lighting, photorealistic.',
    'No text, no watermark, no logos.',
    'Brazilian professionals, diverse, modern environment.',
  ];

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 900);
}

function fetchImage(prompt, size = '1024x1024', model = DEFAULT_MODEL) {
  return new Promise((resolve, reject) => {
    if (!PIRAMYD_API_KEY) return reject(new Error('PIRAMYD_API_KEY not set'));

    const payload = JSON.stringify({
      model,
      prompt,
      n: 1,
      size,
    });

    const url = new URL(PIRAMYD_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PIRAMYD_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) return reject(new Error(result.error.message || JSON.stringify(result.error)));
          const imgUrl = result.data?.[0]?.url || result.data?.[0]?.b64_json;
          if (!imgUrl) return reject(new Error('Piramyd: no image URL in response'));
          resolve(imgUrl);
        } catch (e) {
          reject(new Error(`Piramyd parse error: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('Piramyd timeout 120s')); });
    req.write(payload);
    req.end();
  });
}

function downloadImage(url, outputPath) {
  return new Promise((resolve, reject) => {
    if (url.startsWith('data:')) {
      // Base64
      const b64 = url.split(',')[1];
      fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
      return resolve(outputPath);
    }

    const proto = url.startsWith('https') ? https : require('http');
    proto.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location, outputPath).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(outputPath);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function generateImage(outputPath, prompt, model = DEFAULT_MODEL, ratio = '1:1') {
  const sizeMap = {
    '1:1': '1024x1024',
    '9:16': '1024x1792',
    '16:9': '1792x1024',
  };
  const size = sizeMap[ratio] || '1024x1024';

  const imgUrl = await fetchImage(prompt, size, model);
  await downloadImage(imgUrl, outputPath);
  return outputPath;
}

module.exports = { generateImage, buildImagePrompt };
