const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const camp = 'c0038-pascoa_2026';
const campDir = path.join(PROJECT_ROOT, 'prj/inema/outputs', camp);
const imgsDir = path.join(campDir, 'imgs');
const CHAT_ID = '7388953786';

function getEnvVar(key) {
  try {
    const d = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
    const m = d.match(new RegExp('^' + key + '=(.*)', 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const botToken = getEnvVar('TELEGRAM_BOT_TOKEN');
const PIRAMYD_KEYS = [...new Set([getEnvVar('PIRAMYD_API_KEY'), 'sk-150ad0f5c9ac42eb9928f44039cfc143', 'sk-574a5cb6547f4968b6fc435903ca97ac'].filter(Boolean))];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sendMsg(text) {
  if (!botToken) return;
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${botToken}/sendMessage" -H "Content-Type: application/json" -d '${JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }).replace(/'/g, "'\\''")}'`, { timeout: 10000 });
  } catch {}
}

function sendPhoto(file, caption) {
  if (!botToken) return;
  try {
    execSync(`curl -s -X POST "https://api.telegram.org/bot${botToken}/sendPhoto" -F "chat_id=${CHAT_ID}" -F "caption=${caption}" -F "photo=@${file}"`, { timeout: 30000 });
  } catch {}
}

function validateImage(filePath, provider) {
  if (!fs.existsSync(filePath)) throw new Error(provider + ': no file');
  const size = fs.statSync(filePath).size;
  if (size < 10000) {
    try { fs.unlinkSync(filePath); } catch {}
    throw new Error(provider + ': too small (' + size + 'b) — not an image');
  }
  const header = Buffer.alloc(4);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, header, 0, 4, 0);
  fs.closeSync(fd);
  const isJPEG = header[0] === 0xFF && header[1] === 0xD8;
  const isPNG = header[0] === 0x89 && header[1] === 0x50;
  const isWEBP = header[0] === 0x52 && header[1] === 0x49; // RIFF
  if (!isJPEG && !isPNG && !isWEBP) {
    try { fs.unlinkSync(filePath); } catch {}
    throw new Error(provider + ': not a valid image (got error page)');
  }
}

function genPollinations(prompt, outPath) {
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=576&height=1024&seed=${seed}&model=flux&nologo=true`;
  execSync(`curl -sL -o "${outPath}" "${url}"`, { timeout: 120000 });
  validateImage(outPath, 'Pollinations');
}

function genPiramyd(prompt, outPath, key) {
  const payload = JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1792' });
  const tmpResp = outPath + '.resp';
  execSync(`curl -s -X POST "https://api.piramyd.cloud/v1/images/generations" -H "Content-Type: application/json" -H "Authorization: Bearer ${key}" -d '${payload.replace(/'/g, "'\\''")}'  -o "${tmpResp}"`, { timeout: 120000 });
  const result = fs.readFileSync(tmpResp, 'utf-8');
  try { fs.unlinkSync(tmpResp); } catch {}
  let json;
  try { json = JSON.parse(result); } catch { throw new Error('Piramyd: invalid response (service down?)'); }
  if (json.error) throw new Error('Piramyd: ' + (json.error.message || JSON.stringify(json.error)));
  const imgUrl = json.data?.[0]?.url;
  if (!imgUrl) throw new Error('Piramyd: no image URL');
  execSync(`curl -sL -o "${outPath}" "${imgUrl}"`, { timeout: 60000 });
  validateImage(outPath, 'Piramyd');
}

const providers = [
  { name: 'Pollinations', fn: (p, o) => genPollinations(p, o) },
  ...PIRAMYD_KEYS.map((k, i) => ({ name: 'Piramyd-' + (i + 1), fn: (p, o) => genPiramyd(p, o, k) })),
];

const prompts = [
  'Executive conductor standing before holographic AI orchestra, low angle, dramatic blue backlight, dark futuristic command room. Cinematic, photorealistic. No text, no watermark.',
  'Close-up hands holding glowing baton transforming into digital cursor, particles of light, dark background, cinematic depth of field. No text.',
  'Easter egg cracking open revealing digital city of AI agents inside, neon blue and gold light spilling out, macro shot, dark background. No text.',
  'Silhouette of business leader facing massive wall of AI dashboards, blue glow reflecting on face, dark room, wide angle from behind. Cinematic. No text.',
  'Professional woman orchestrating multiple AI screens with hand gestures, holographic interfaces floating, dark premium office. No text, no watermark.',
  'Golden Easter egg surrounded by circuit board patterns, glowing blue connections, dark background, product photography, centered. No text.',
  'Diverse team in modern dark auditorium watching AI presentation, screens reflecting on faces, warm and cool tones, wide shot. No text.',
  'Close-up executive face illuminated by blue AI interface light, determined expression, shallow depth of field, cinematic portrait. No text.',
  'Futuristic classroom with professionals learning AI on holographic displays, dark premium environment, golden accents, wide angle. No text.',
  'Abstract: digital phoenix rising from cracked golden egg, neon blue and gold particles, dark space background. Artistic, cinematic. No text.',
];

async function main() {
  fs.mkdirSync(imgsDir, { recursive: true });
  console.log('Providers:', providers.map(p => p.name).join(', '));
  sendMsg('🖼️ <b>Teste: ' + camp + '</b>\n10 imagens reels 9:16\nProviders: ' + providers.map(p => p.name).join(', '));

  let ok = 0;
  for (let i = 0; i < prompts.length; i++) {
    const prov = providers[i % providers.length];
    const filename = camp + '_reels_' + String(i + 1).padStart(2, '0') + '.jpg';
    const out = path.join(imgsDir, filename);
    process.stdout.write('[' + (i + 1) + '/10] ' + prov.name + '... ');
    fs.writeFileSync(out.replace('.jpg', '_prompt.txt'), prompts[i]);

    let done = false;
    for (const p of [prov, ...providers.filter(x => x.name !== prov.name)]) {
      try {
        p.fn(prompts[i], out);
        const mb = (fs.statSync(out).size / 1048576).toFixed(1);
        console.log('✅ ' + p.name + ' ' + mb + 'MB');
        sendPhoto(out, '🖼️ [' + (i+1) + '/10] ' + p.name);
        ok++; done = true; break;
      } catch (e) { console.log('❌ ' + p.name + ': ' + e.message.slice(0, 60)); process.stdout.write('  fallback... '); }
    }
    if (!done) console.log('❌ TODOS FALHARAM');
    await sleep(3000);
  }
  sendMsg('✅ <b>Teste concluído!</b> ' + ok + '/10 imagens para ' + camp);
  console.log('\nDone! ' + ok + '/10');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
