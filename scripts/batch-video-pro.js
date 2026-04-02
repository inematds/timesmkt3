#!/usr/bin/env node
/**
 * batch-video-pro.js — Gera video pro de 30s para TODAS as campanhas ativas do projeto INEMA.
 *
 * Para cada campanha:
 * 1. Limpa planos antigos (photography_plan, scene_plan, scene_plan_motion)
 * 2. Enfileira video_pro com duração 30s, image_source brand
 * 3. Aguarda conclusão (poll log a cada 10s)
 * 4. Envia vídeo renderizado para o Telegram
 * 5. Passa para a próxima campanha
 *
 * Uso: node scripts/batch-video-pro.js [--dry-run] [--campaign c0038]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { enqueueStage } = require('../pipeline/orchestrator');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PROJECT_DIR = 'prj/inema';
const OUTPUTS_DIR = path.join(PROJECT_ROOT, PROJECT_DIR, 'outputs');
const CHAT_ID = '7388953786'; // Telegram chat ID

// Bot API for sending messages/files
let botToken;
try {
  const envFile = fs.readFileSync(path.join(PROJECT_ROOT, '.env'), 'utf-8');
  const match = envFile.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
  if (match) botToken = match[1].trim();
} catch {}

async function sendTelegram(method, params) {
  if (!botToken) { console.log('[telegram] No bot token — skipping send'); return; }
  const { default: fetch } = await import('node-fetch');
  const url = `https://api.telegram.org/bot${botToken}/${method}`;

  if (params.video || params.document) {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    for (const [k, v] of Object.entries(params)) {
      if (k === 'video' || k === 'document') {
        form.append(k, fs.createReadStream(v));
      } else {
        form.append(k, String(v));
      }
    }
    return fetch(url, { method: 'POST', body: form });
  }
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
}

async function sendMessage(text) {
  return sendTelegram('sendMessage', { chat_id: CHAT_ID, text, parse_mode: 'HTML' });
}

async function sendVideo(filePath, caption) {
  const sizeMB = fs.statSync(filePath).size / (1024 * 1024);
  if (sizeMB > 50) {
    return sendMessage(`🎬 <b>${path.basename(filePath)}</b> (${sizeMB.toFixed(1)}MB — muito grande para Telegram)`);
  }
  return sendTelegram('sendVideo', { chat_id: CHAT_ID, video: filePath, caption, supports_streaming: true });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanVideoPlans(campDir) {
  let cleaned = 0;

  // Clean video plans
  const videoDir = path.join(campDir, 'video');
  if (fs.existsSync(videoDir)) {
    for (const f of fs.readdirSync(videoDir)) {
      if (f.endsWith('_scene_plan.json') || f.endsWith('_scene_plan_motion.json') ||
          f === 'photography_plan.json' || f === 'approved.json' || f === 'rejected.json' ||
          f === 'approval_needed.json') {
        fs.unlinkSync(path.join(videoDir, f));
        cleaned++;
      }
    }
  }

  // Rename existing narration to _60s backup (don't delete — keep the original)
  // Worker will generate new 30s narration since the expected file won't exist
  const audioDir = path.join(campDir, 'audio');
  if (fs.existsSync(audioDir)) {
    for (const f of fs.readdirSync(audioDir)) {
      if (f.includes('narration') && f.endsWith('.mp3') && !f.includes('_backup_')) {
        const src = path.join(audioDir, f);
        const dst = path.join(audioDir, f.replace('.mp3', '_backup_60s.mp3'));
        if (!fs.existsSync(dst)) {
          fs.renameSync(src, dst);
          console.log(`    Backup: ${f} → ${path.basename(dst)}`);
          cleaned++;
        }
      }
      // Also rename timing files
      if (f.includes('timing') && f.endsWith('.json') && !f.includes('_backup_')) {
        const src = path.join(audioDir, f);
        const dst = path.join(audioDir, f.replace('.json', '_backup_60s.json'));
        if (!fs.existsSync(dst)) {
          fs.renameSync(src, dst);
          cleaned++;
        }
      }
    }
  }

  // Clean video pro log (so phases re-trigger)
  const logFile = path.join(campDir, 'logs', 'video_pro.log');
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
    cleaned++;
  }

  return cleaned;
}

function getActiveCampaigns(filterCampaign) {
  const campaigns = [];
  for (const camp of fs.readdirSync(OUTPUTS_DIR).sort()) {
    if (!camp.startsWith('c0')) continue;
    const campDir = path.join(OUTPUTS_DIR, camp);
    if (!fs.statSync(campDir).isDirectory()) continue;
    if (fs.existsSync(path.join(campDir, 'archived.json'))) continue;
    if (filterCampaign && !camp.includes(filterCampaign)) continue;

    // Must have creative brief (stage 1 done)
    if (!fs.existsSync(path.join(campDir, 'creative', 'creative_brief.json'))) continue;

    campaigns.push({ name: camp, dir: campDir, outputDir: `${PROJECT_DIR}/outputs/${camp}` });
  }
  return campaigns;
}

async function waitForCompletion(campDir, timeoutMs = 1800000) {
  const logFile = path.join(campDir, 'logs', 'video_pro.log');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf-8');
      const tail = content.split('\n').filter(l => l.trim()).slice(-3).join('\n');
      if (tail.includes('Completed successfully')) return true;
      if (tail.includes('failed') || tail.includes('Error')) return false;
    }
    await sleep(10000);
  }
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filterIdx = args.indexOf('--campaign');
  const filterCampaign = filterIdx >= 0 ? args[filterIdx + 1] : null;

  const campaigns = getActiveCampaigns(filterCampaign);
  console.log(`\n=== Batch Video Pro — ${campaigns.length} campanhas ===\n`);

  if (campaigns.length === 0) {
    console.log('Nenhuma campanha ativa encontrada.');
    return;
  }

  for (const camp of campaigns) {
    console.log(`${camp.name}:`);
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Nenhuma ação executada.');
    return;
  }

  await sendMessage(`🎬 <b>Batch Video Pro</b>\n${campaigns.length} campanhas para processar (30s cada)`);

  for (let i = 0; i < campaigns.length; i++) {
    const camp = campaigns[i];
    console.log(`\n[${i + 1}/${campaigns.length}] ${camp.name}`);

    // 1. Clean old plans
    const cleaned = cleanVideoPlans(camp.dir);
    console.log(`  Limpou ${cleaned} arquivos de plano`);

    // 2. Auto-approve video (write approved.json so worker doesn't wait)
    const videoDir = path.join(camp.dir, 'video');
    fs.mkdirSync(videoDir, { recursive: true });
    fs.writeFileSync(path.join(videoDir, 'approved.json'),
      JSON.stringify({ approved: true, feedback: 'batch-auto', ts: new Date().toISOString() }));

    // 3. Read original payload and build video pro job
    let origPayload = {};
    try {
      origPayload = JSON.parse(fs.readFileSync(path.join(camp.dir, 'campaign_payload.json'), 'utf-8'));
    } catch {}

    const payload = {
      ...origPayload,
      task_name: camp.name,
      task_date: new Date().toISOString().slice(0, 10),
      project_dir: PROJECT_DIR,
      output_dir: camp.outputDir,
      platform_targets: origPayload.platform_targets || ['instagram'],
      language: 'pt-BR',
      video_count: 1,
      video_duration: 30,
      video_pro: true,
      video_quick: false,
      image_source: 'brand',
      narrator: origPayload.narrator || 'rachel',
      style_preset: origPayload.style_preset || 'inema_hightech',
      photo_quality: 'simples',
      scene_quality: 'simples',
      approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
      notifications: false,
    };

    await sendMessage(`▶️ [${i + 1}/${campaigns.length}] <b>${camp.name}</b> — gerando video pro 30s...`);

    // 4. Enqueue video_pro
    try {
      const jobIds = await enqueueStage(payload, ['video_pro']);
      console.log(`  Enfileirado: job ${jobIds}`);
    } catch (e) {
      console.error(`  ERRO ao enfileirar: ${e.message}`);
      await sendMessage(`❌ <b>${camp.name}</b> — erro ao enfileirar: ${e.message}`);
      continue;
    }

    // 5. Wait for completion
    console.log('  Aguardando conclusão...');
    const success = await waitForCompletion(camp.dir);

    if (success) {
      console.log('  ✅ Concluído!');

      // 6. Find and send rendered video
      const videoFiles = fs.readdirSync(path.join(camp.dir, 'video'))
        .filter(f => f.includes('pro') && f.endsWith('.mp4') && !f.includes('draft'))
        .sort()
        .reverse(); // newest first

      if (videoFiles[0]) {
        const videoPath = path.join(camp.dir, 'video', videoFiles[0]);
        const sizeMB = (fs.statSync(videoPath).size / (1024 * 1024)).toFixed(1);
        console.log(`  Enviando: ${videoFiles[0]} (${sizeMB}MB)`);
        await sendVideo(videoPath, `🎬 ${camp.name} — Pro 30s (${sizeMB}MB)`);
      }
    } else {
      console.error('  ❌ Falhou ou timeout');
      await sendMessage(`❌ <b>${camp.name}</b> — falhou ou timeout`);
    }

    // Small delay between campaigns
    if (i < campaigns.length - 1) await sleep(5000);
  }

  await sendMessage(`✅ <b>Batch Video Pro concluído!</b>\n${campaigns.length} campanhas processadas.`);
  console.log('\n=== Batch concluído ===');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
