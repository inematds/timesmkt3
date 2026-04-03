/**
 * KIE Image Generation
 *
 * Generates images via KIE API.
 * Default model: z-image (use others only if explicitly requested).
 *
 * Usage (CLI):
 *   node pipeline/generate-image-kie.js <output.jpg> "<prompt>" [model] [aspect_ratio]
 *
 * Models:
 *   z-image            — default, best quality/speed balance
 *   z-image-turbo      — faster variant
 *   flux-kontext-pro   — Flux Pro
 *   flux-kontext-max   — Flux Max quality
 *   gpt-image-1        — OpenAI GPT-Image-1
 *   seedream           — high resolution
 *   flux-2             — next-gen FLUX
 *   grok-imagine       — xAI Grok
 *   nano-banana-2      — 1K resolution
 *
 * Aspect ratios:
 *   1:1   — square (Instagram carousel, 1080x1080)
 *   9:16  — portrait (Stories, Reels, 1080x1920)
 *   16:9  — landscape (YouTube thumbnail)
 *   4:3 / 3:4
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { getEnv } = require('../config/env');

const KIE_API_KEY = getEnv('KIE_API_KEY', '');
const BASE_URL = 'https://api.kie.ai';
const DEFAULT_MODEL = 'z-image';

const MODELS = {
  'z-image':          { endpoint: '/api/v1/jobs/createTask',          pollEndpoint: '/api/v1/jobs/recordInfo', type: 'market' },
  'z-image-turbo':    { endpoint: '/api/v1/jobs/createTask',          pollEndpoint: '/api/v1/jobs/recordInfo', type: 'market' },
  'flux-kontext-pro': { endpoint: '/api/v1/flux/kontext/generate',    pollEndpoint: '/api/v1/flux/kontext/record-info', type: 'flux' },
  'flux-kontext-max': { endpoint: '/api/v1/flux/kontext/generate',    pollEndpoint: '/api/v1/flux/kontext/record-info', type: 'flux' },
  'gpt-image-1':      { endpoint: '/api/v1/gpt4o-image/generate',     pollEndpoint: '/api/v1/jobs/recordInfo', type: 'gpt' },
  // New models (2026)
  'seedream':         { endpoint: '/api/v1/jobs/createTask',          pollEndpoint: '/api/v1/jobs/recordInfo', type: 'market' },
  'flux-2':           { endpoint: '/api/v1/flux/kontext/generate',    pollEndpoint: '/api/v1/flux/kontext/record-info', type: 'flux' },
  'grok-imagine':     { endpoint: '/api/v1/jobs/createTask',          pollEndpoint: '/api/v1/jobs/recordInfo', type: 'market' },
  'nano-banana-2':    { endpoint: '/api/v1/jobs/createTask',          pollEndpoint: '/api/v1/jobs/recordInfo', type: 'market' },
};

const AVAILABLE_MODELS = [
  { id: 'z-image',          label: 'Z-Image (padrão)' },
  { id: 'z-image-turbo',    label: 'Z-Image Turbo (mais rápido)' },
  { id: 'flux-kontext-pro', label: 'Flux Kontext Pro' },
  { id: 'flux-kontext-max', label: 'Flux Kontext Max (qualidade máxima)' },
  { id: 'gpt-image-1',      label: 'GPT-Image-1 (estilo OpenAI)' },
  { id: 'seedream',         label: 'SeedReam (alta resolução)' },
  { id: 'flux-2',           label: 'FLUX 2 (nova geração)' },
  { id: 'grok-imagine',     label: 'Grok Imagine (xAI)' },
  { id: 'nano-banana-2',    label: 'Nano Banana 2 (1K resolução)' },
];

// ── Brand context reader ──────────────────────────────────────────────────────

/**
 * Reads brand_identity.md and extracts key visual attributes for image prompts.
 * Returns an object with colors, style keywords, subject direction.
 */
function readBrandContext(projectDir) {
  const projectRoot = path.resolve(__dirname, '..');
  const brandFile = path.join(projectRoot, projectDir, 'knowledge', 'brand_identity.md');

  if (!fs.existsSync(brandFile)) return null;

  const content = fs.readFileSync(brandFile, 'utf-8');

  // Extract color palette
  const colorMatches = content.match(/#[0-9A-Fa-f]{6}/g) || [];
  const uniqueColors = [...new Set(colorMatches)].slice(0, 5);

  // Extract visual style keywords
  const styleSection = content.match(/### Estilo visual\n([\s\S]*?)(?=\n###|\n##|\n---)/)?.[1] || '';
  const styleKeywords = styleSection
    .split('\n')
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').split('—')[0].trim())
    .filter(Boolean)
    .slice(0, 5);

  // Extract visual context for image generation (brand's visual world/subjects)
  const visualContextSection = content.match(/### Contexto Visual para Imagens\n([\s\S]*?)(?=\n###|\n##|\n---)/)?.[1] || '';
  const visualContext = visualContextSection
    .split('\n')
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  // Extract brand name and tagline
  const brandName = content.match(/^# Brand Identity[^\n]*?[—-]\s*(.+)/m)?.[1]?.trim() || '';
  const tagline = content.match(/> "(.+?)"/)?.[1] || '';

  // Extract audience/personality descriptors
  const personalityLines = content.match(/\*\*(.+?)\*\* —/g) || [];
  const personality = personalityLines
    .map(l => l.replace(/\*\*/g, '').replace(/ —$/, '').trim())
    .slice(0, 3);

  return { brandName, tagline, colors: uniqueColors, styleKeywords, personality, visualContext };
}

// ── Model profiles ───────────────────────────────────────────────────────────

let _modelProfiles = null;
function getModelProfile(modelId) {
  if (!_modelProfiles) {
    try {
      const profilePath = path.resolve(__dirname, '..', 'skills', 'image-generation', 'model-profiles.json');
      const data = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
      _modelProfiles = { defaults: data.defaults, models: data.models };
    } catch {
      _modelProfiles = { defaults: {}, models: {} };
    }
  }
  return { ..._modelProfiles.defaults, ...(_modelProfiles.models[modelId] || {}) };
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/**
 * Builds a rich, brand-aware image generation prompt.
 * Reads model-specific profile from skills/image-generation/model-profiles.json
 * to adjust prompt style, length, and structure per model.
 */
function buildImagePrompt(brief, brand, format, index, total, sceneType = '', sceneDescription = '', modelId = DEFAULT_MODEL) {
  const profile = getModelProfile(modelId);
  const maxLen = profile.max_length || 490;

  const isStory = format.includes('1920') || format.includes('9:16');
  const orientation = isStory ? 'vertical 9:16' : 'square 1:1';

  const moodMap = {
    hook:         'dramatic tension, high contrast, strong impact',
    tension:      'emotional challenge, aspiration, desire to change',
    solution:     'transformation, empowerment, positive energy',
    social_proof: 'community, people achieving, belonging',
    cta:          'optimistic, inviting, forward momentum',
  };
  const sceneFirst = index === 1;
  const sceneLast  = index === total;
  const mood = moodMap[sceneType] ||
    (sceneFirst ? moodMap.hook : sceneLast ? moodMap.cta : moodMap.solution);

  const visualScene = sceneDescription || brand?.visualContext?.[0] || 'professional cinematic scene';

  const colorHint = (profile.color_hint !== false && brand?.colors?.length)
    ? `Colors: ${brand.colors.slice(0, 2).join(', ')}.`
    : '';

  const parts = [
    profile.style_prefix || '',
    visualScene + '.',
    (profile.mood_keywords !== false) ? mood + '.' : '',
    (profile.orientation_in_prompt !== false) ? orientation + '.' : '',
    colorHint,
    profile.style_suffix || 'No text, no watermark.',
    profile.safety_suffix || 'No weapons, no violence, no nudity.',
    profile.context_suffix || 'Brazilian professionals, diverse, modern environment.',
  ];

  const prompt = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return prompt.length > maxLen ? prompt.slice(0, maxLen - 3) + '...' : prompt;
}

/**
 * Extracts the most meaningful thematic keywords from a campaign brief.
 * Focuses on nouns, proper nouns, and action words — removes filler.
 */
function extractThemeKeywords(brief) {
  if (!brief) return [];

  // Portuguese stop words to filter out
  const stopWords = new Set([
    'de','do','da','dos','das','em','no','na','nos','nas','para','por','com','uma',
    'um','que','se','não','mas','ou','e','o','a','os','as','ao','aos','às',
    'este','esta','estes','estas','esse','essa','isso','aqui','já','mais',
    'muito','ser','ter','foi','são','está','como','sua','seu','seus','suas',
    'todo','toda','todos','todas','quando','onde','qual','quais','porque',
    'sobre','entre','sem','pelo','pela','pelos','pelas','até','após',
  ]);

  return brief
    .toLowerCase()
    .replace(/[^a-záéíóúâêîôûãõç\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w))
    .slice(0, 8);
}

// ── API request helpers ───────────────────────────────────────────────────────

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
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
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

    const get = (url) => {
      protocol.get(url, (res) => {
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
    };
    get(fileUrl);
  });
}

async function pollForResult(taskId, modelConfig, maxWaitMs = 300000) {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    await new Promise(r => setTimeout(r, 4000));

    const result = await apiRequest('GET', `${modelConfig.pollEndpoint}?taskId=${taskId}`);
    const d = result.data;
    if (!d) throw new Error(`Poll error: ${JSON.stringify(result)}`);

    if (modelConfig.type === 'flux') {
      if (d.successFlag === 1) return d.response?.resultImageUrl || d.response?.originImageUrl;
      if (d.successFlag === 2 || d.successFlag === 3) throw new Error(`Generation failed (flag ${d.successFlag})`);
    } else {
      // market (z-image, gpt-image-1)
      if (d.state === 'success') {
        const parsed = JSON.parse(d.resultJson || '{}');
        return parsed.resultUrls?.[0] || parsed.url;
      }
      if (d.state === 'fail') throw new Error(`Generation failed: ${d.failMsg || 'unknown'}`);
    }
  }

  throw new Error(`Timeout after ${maxWaitMs / 1000}s`);
}

// ── Main generate function ────────────────────────────────────────────────────

async function generateImage(outputPath, prompt, model = DEFAULT_MODEL, aspectRatio = '1:1') {
  if (!KIE_API_KEY) throw new Error('KIE_API_KEY not set in .env');

  const modelConfig = MODELS[model];
  if (!modelConfig) throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODELS).join(', ')}`);

  console.log(`[KIE] model=${model} ratio=${aspectRatio}`);
  console.log(`[KIE] prompt: ${prompt.slice(0, 120)}...`);

  let taskId;

  if (modelConfig.type === 'market') {
    // z-image, z-image-turbo
    const res = await apiRequest('POST', modelConfig.endpoint, {
      model,
      input: {
        prompt,
        aspect_ratio: aspectRatio,
        nsfw_checker: true,
      },
    });
    if (res.code !== 200) throw new Error(`KIE error: ${res.msg} (${res.code})`);
    taskId = res.data?.taskId;

  } else if (modelConfig.type === 'flux') {
    const res = await apiRequest('POST', modelConfig.endpoint, {
      prompt,
      model,
      aspectRatio,
      outputFormat: outputPath.endsWith('.png') ? 'png' : 'jpeg',
      enableTranslation: true,
      promptUpsampling: false,
      safetyTolerance: 2,
    });
    if (res.code !== 200) throw new Error(`KIE error: ${res.msg} (${res.code})`);
    taskId = res.data?.taskId;

  } else {
    // gpt-image-1
    const sizeMap = { '1:1': '1:1', '9:16': '2:3', '16:9': '3:2', '3:4': '2:3', '4:3': '3:2' };
    const res = await apiRequest('POST', modelConfig.endpoint, {
      prompt,
      size: sizeMap[aspectRatio] || '1:1',
      isEnhance: false,
    });
    if (res.code !== 200) throw new Error(`KIE error: ${res.msg} (${res.code})`);
    taskId = res.data?.taskId;
  }

  if (!taskId) throw new Error('No taskId returned');
  console.log(`[KIE] taskId=${taskId} — polling...`);

  const imageUrl = await pollForResult(taskId, modelConfig);
  if (!imageUrl) throw new Error('No image URL in result');

  await downloadFile(imageUrl, outputPath);
  console.log(`[KIE] ✅ saved: ${outputPath}`);
  return outputPath;
}

// CLI mode
if (require.main === module) {
  const [,, outputArg, promptArg, modelArg, ratioArg = '1:1'] = process.argv;
  if (!outputArg || !promptArg) {
    console.error('Usage: node pipeline/generate-image-kie.js <output.jpg> "<prompt>" [model] [aspect_ratio]');
    console.error('\nAvailable models:');
    AVAILABLE_MODELS.forEach(m => console.error(`  ${m.id} — ${m.label}`));
    process.exit(1);
  }
  generateImage(outputArg, promptArg, modelArg || DEFAULT_MODEL, ratioArg)
    .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { generateImage, buildImagePrompt, readBrandContext, AVAILABLE_MODELS, DEFAULT_MODEL };
