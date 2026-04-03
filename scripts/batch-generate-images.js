#!/usr/bin/env node
/**
 * batch-generate-images.js — Verifica campanhas sem imagens e gera via Pollinations API.
 *
 * Para cada campanha ativa:
 * 1. Verifica se tem imagens em imgs/ (geradas via API)
 * 2. Se não tem, lê o creative_brief.json para gerar prompts
 * 3. Gera 5 imagens via Pollinations (3 carousel 1:1 + 2 story 9:16)
 * 4. Envia cada imagem para o Telegram conforme é gerada
 * 5. Passa para a próxima campanha
 *
 * Uso: node scripts/batch-generate-images.js [--dry-run] [--campaign c0039] [--force]
 */

const fs = require('fs');
const path = require('path');
const { getEnv } = require('../config/env');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIR = 'prj/inema';
const OUTPUTS_DIR = path.join(PROJECT_ROOT, PROJECT_DIR, 'outputs');
const CHAT_ID = '7388953786';

const botToken = getEnv('TELEGRAM_BOT_TOKEN', '');

async function sendTelegram(method, params) {
  if (!botToken) { console.log('[telegram] No bot token — skipping'); return; }
  const { default: fetch } = await import('node-fetch');
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  if (params.photo) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) {
      if (k === 'photo') form.append(k, fs.createReadStream(v));
      else form.append(k, String(v));
    }
    return fetch(url, { method: 'POST', body: form });
  }
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
}

async function sendMessage(text) {
  return sendTelegram('sendMessage', { chat_id: CHAT_ID, text, parse_mode: 'HTML' });
}

async function sendPhoto(filePath, caption) {
  return sendTelegram('sendPhoto', { chat_id: CHAT_ID, photo: filePath, caption });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Piramyd API keys — multiple keys for higher throughput
const PIRAMYD_KEYS = [
  getEnv('PIRAMYD_API_KEY', ''),
  'sk-150ad0f5c9ac42eb9928f44039cfc143',
  'sk-574a5cb6547f4968b6fc435903ca97ac',
].filter(Boolean);
// Remove duplicates
const uniquePiramydKeys = [...new Set(PIRAMYD_KEYS)];

// Providers pool — rotates to avoid rate limits (~10/min each)
const providers = [];
providers.push({ name: 'Pollinations', generate: generatePollinations });
// Add one provider entry per Piramyd key
uniquePiramydKeys.forEach((key, i) => {
  const label = uniquePiramydKeys.length > 1 ? `Piramyd-${i + 1}` : 'Piramyd';
  providers.push({ name: label, generate: (prompt, out, ratio) => generatePiramyd(prompt, out, ratio, key) });
});
let _providerIdx = 0;

function getNextProvider() {
  const p = providers[_providerIdx % providers.length];
  _providerIdx++;
  return p;
}

// Generate image via Pollinations (free, FLUX Schnell)
async function generatePollinations(prompt, outputPath, ratio = '1:1') {
  const { default: fetch } = await import('node-fetch');

  const dims = ratio === '9:16' ? { w: 576, h: 1024 } : { w: 768, h: 768 };
  const seed = Math.floor(Math.random() * 999999);
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.w}&height=${dims.h}&seed=${seed}&model=flux&nologo=true`;

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pollinations ${response.status}: ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// Generate image via Piramyd API (OpenAI-compatible, DALL-E)
async function generatePiramyd(prompt, outputPath, ratio = '1:1', apiKey = null) {
  const { default: fetch } = await import('node-fetch');
  const key = apiKey || uniquePiramydKeys[0];
  if (!key) throw new Error('No Piramyd API key');

  const sizeMap = { '1:1': '1024x1024', '9:16': '1024x1792', '16:9': '1792x1024' };
  const size = sizeMap[ratio] || '1024x1024';

  const response = await fetch('https://api.piramyd.cloud/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Piramyd ${response.status}: ${err.slice(0, 200)}`);
  }

  const result = await response.json();
  const imgUrl = result.data?.[0]?.url;
  if (!imgUrl) throw new Error('Piramyd: no image URL');

  // Download the image
  const imgResp = await fetch(imgUrl);
  const buffer = Buffer.from(await imgResp.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

// Unified generate with rotation + fallback
async function generateImage(prompt, outputPath, ratio = '1:1') {
  const primary = getNextProvider();
  try {
    await primary.generate(prompt, outputPath, ratio);
    return { provider: primary.name, path: outputPath };
  } catch (e) {
    console.log(`    ${primary.name} falhou: ${e.message.slice(0, 80)} — tentando fallback...`);
    // Try other providers as fallback
    for (const fallback of providers) {
      if (fallback.name === primary.name) continue;
      try {
        await fallback.generate(prompt, outputPath, ratio);
        return { provider: fallback.name, path: outputPath };
      } catch (e2) {
        console.log(`    ${fallback.name} também falhou: ${e2.message.slice(0, 80)}`);
      }
    }
    throw new Error(`Todos os providers falharam para: ${prompt.slice(0, 60)}`);
  }
}

function getActiveCampaigns(filterCampaign, force) {
  const campaigns = [];
  for (const camp of fs.readdirSync(OUTPUTS_DIR).sort()) {
    if (!camp.startsWith('c0')) continue;
    const campDir = path.join(OUTPUTS_DIR, camp);
    if (!fs.statSync(campDir).isDirectory()) continue;
    if (fs.existsSync(path.join(campDir, 'archived.json'))) continue;
    if (filterCampaign && !camp.includes(filterCampaign)) continue;

    // Must have creative brief
    const briefPath = path.join(campDir, 'creative', 'creative_brief.json');
    if (!fs.existsSync(briefPath)) continue;

    // Check if already has generated images
    const imgsDir = path.join(campDir, 'imgs');
    const existingImgs = fs.existsSync(imgsDir)
      ? fs.readdirSync(imgsDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f) && !f.includes('approved') && !f.includes('rejected')).length
      : 0;

    if (existingImgs > 0 && !force) {
      console.log(`  ${camp}: já tem ${existingImgs} imagens — pulando (use --force para regenerar)`);
      continue;
    }

    campaigns.push({ name: camp, dir: campDir, briefPath, existingImgs });
  }
  return campaigns;
}

function buildPrompts(briefPath, campName) {
  let brief;
  try { brief = JSON.parse(fs.readFileSync(briefPath, 'utf-8')); } catch { return []; }

  const style = brief.visual_direction?.photography_style || '';
  const metaphor = brief.visual_direction?.key_visual_metaphor || '';
  const mood = brief.visual_direction?.mood || '';
  const theme = brief.campaign_theme || '';
  const colors = (brief.visual_direction?.dominant_colors || []).slice(0, 2).join(', ');

  // If brief has carousel_structure with conceito_visual, use those
  if (brief.carousel_structure) {
    const slides = Object.keys(brief.carousel_structure)
      .filter(k => k.startsWith('slide_'))
      .sort()
      .map(k => brief.carousel_structure[k]);

    if (slides.length > 0 && slides[0].conceito_visual) {
      return slides.map((s, i) => ({
        prompt: `${s.conceito_visual}. ${mood}. Colors: ${colors}. Cinematic lighting, photorealistic. No text, no watermark.`,
        format: i < 3 ? 'carousel' : 'story',
        ratio: i < 3 ? '1:1' : '9:16',
        filename: `${campName}_generated_${String(i + 1).padStart(2, '0')}_${i < 3 ? 'carousel_1080x1080' : 'story_1080x1920'}.jpg`,
      }));
    }
  }

  // Fallback: generate 5 varied prompts in English
  const prompts = [
    {
      prompt: `${metaphor || 'leader commanding technology'}. low angle dramatic shot, strong silhouette, dark futuristic background, blue accent lighting. ${mood}. Colors: ${colors}. Cinematic, photorealistic. No text, no watermark.`,
      format: 'carousel', ratio: '1:1',
    },
    {
      prompt: `close-up hands on tablet with AI workflow on screen, warm side lighting, shallow depth of field, modern office. Professional atmosphere. Colors: ${colors}. Cinematic. No text, no watermark.`,
      format: 'story', ratio: '9:16',
    },
    {
      prompt: `diverse team collaborating around holographic display, aerial view, ${mood || 'premium dark'} environment, multiple screens, dynamic composition. Colors: ${colors}. Cinematic. No text, no watermark.`,
      format: 'carousel', ratio: '1:1',
    },
    {
      prompt: `community gathering in modern auditorium, faces lit by screens, warm golden hour light, sense of belonging, wide shot with depth. Colors: ${colors}. Cinematic. No text, no watermark.`,
      format: 'story', ratio: '9:16',
    },
    {
      prompt: `clean minimalist premium composition, brand feel, dark background with subtle gradient, inviting atmosphere, centered framing. Colors: ${colors}. Cinematic. No text, no watermark.`,
      format: 'carousel', ratio: '1:1',
    },
  ];

  return prompts.map((p, i) => ({
    ...p,
    filename: `${campName}_generated_${String(i + 1).padStart(2, '0')}_${p.format === 'carousel' ? 'carousel_1080x1080' : 'story_1080x1920'}.jpg`,
  }));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const filterIdx = args.indexOf('--campaign');
  const filterCampaign = filterIdx >= 0 ? args[filterIdx + 1] : null;

  const campaigns = getActiveCampaigns(filterCampaign, force);
  console.log(`\n=== Batch Generate Images — ${campaigns.length} campanhas sem imagens ===\n`);

  if (campaigns.length === 0) {
    console.log('Todas as campanhas já têm imagens (ou nenhuma ativa encontrada).');
    return;
  }

  for (const camp of campaigns) {
    console.log(`  ${camp.name} (${camp.existingImgs} imagens existentes)`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Nenhuma ação executada.');
    // Show prompts that would be generated
    for (const camp of campaigns) {
      const prompts = buildPrompts(camp.briefPath, camp.name);
      console.log(`\n${camp.name} — ${prompts.length} imagens:`);
      for (const p of prompts) {
        console.log(`  ${p.filename} (${p.ratio}): ${p.prompt.slice(0, 100)}...`);
      }
    }
    return;
  }

  await sendMessage(`🖼️ <b>Batch Generate Images</b>\n${campaigns.length} campanhas para gerar imagens via Pollinations`);

  let totalGenerated = 0;

  for (let i = 0; i < campaigns.length; i++) {
    const camp = campaigns[i];
    console.log(`\n[${i + 1}/${campaigns.length}] ${camp.name}`);

    const prompts = buildPrompts(camp.briefPath, camp.name);
    if (prompts.length === 0) {
      console.log('  Sem prompts gerados — pulando');
      continue;
    }

    const imgsDir = path.join(camp.dir, 'imgs');
    fs.mkdirSync(imgsDir, { recursive: true });

    await sendMessage(`🖼️ [${i + 1}/${campaigns.length}] <b>${camp.name}</b> — gerando ${prompts.length} imagens...`);

    for (let j = 0; j < prompts.length; j++) {
      const p = prompts[j];
      const outputPath = path.join(imgsDir, p.filename);

      // Skip if already exists
      if (fs.existsSync(outputPath) && !force) {
        console.log(`  ${p.filename}: já existe — pulando`);
        continue;
      }

      console.log(`  [${j + 1}/${prompts.length}] ${p.filename} (${p.ratio})`);
      console.log(`    Prompt: ${p.prompt.slice(0, 100)}...`);

      // Save prompt
      fs.writeFileSync(outputPath.replace(/\.[^.]+$/, '_prompt.txt'), p.prompt);

      try {
        const result = await generateImage(p.prompt, outputPath, p.ratio);
        const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
        console.log(`    ✅ ${result.provider} — salvo (${sizeMB}MB)`);
        totalGenerated++;

        // Send to Telegram
        await sendPhoto(outputPath, `🖼️ ${camp.name} [${j + 1}/${prompts.length}] ${p.format} ${p.ratio} via ${result.provider}`);
        await sleep(3000); // Rate limit between requests
      } catch (e) {
        console.error(`    ❌ Falhou: ${e.message}`);
        await sendMessage(`❌ ${camp.name} imagem ${j + 1}: ${e.message.slice(0, 100)}`);
        await sleep(5000);
      }
    }

    // Write approval file so pipeline can continue
    fs.writeFileSync(path.join(imgsDir, 'approved.json'),
      JSON.stringify({ approved: true, feedback: 'batch-generated', ts: new Date().toISOString() }));
  }

  await sendMessage(`✅ <b>Batch Images concluído!</b>\n${totalGenerated} imagens geradas em ${campaigns.length} campanhas.`);
  console.log(`\n=== Batch concluído — ${totalGenerated} imagens ===`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
