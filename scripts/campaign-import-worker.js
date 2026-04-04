#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { enqueueStage } = require('../pipeline/orchestrator');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IMPORTS_DIR = path.join(PROJECT_ROOT, 'imports');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getNowParts(now = new Date()) {
  return {
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    time: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    iso: now.toISOString(),
  };
}

function unique(items) {
  return [...new Set(items)];
}

function normalizeTargets(raw) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || 'ads').split(/[,\s]+/).filter(Boolean);
  const out = [];
  for (const value of values) {
    const token = String(value).trim().toLowerCase();
    if (!token) continue;
    if (['ads', 'ad', 'image', 'images'].includes(token)) out.push('ads');
    else if (['quick', 'video', 'video_quick', 'quickj'].includes(token)) out.push('video_quick');
    else if (['pro', 'video_pro'].includes(token)) out.push('video_pro');
    else if (['both', 'videos', 'all_videos'].includes(token)) out.push('video_quick', 'video_pro');
  }
  return unique(out.length > 0 ? out : ['ads']);
}

function normalizeImageConfig(entry = {}, defaults = {}) {
  const sourceRaw = entry.image_source ?? defaults.image_source ?? 'brand';
  const folder = entry.image_folder ?? defaults.image_folder ?? null;
  let imageSource = String(sourceRaw || 'brand').trim();
  let imageBackgroundColor = entry.image_background_color ?? defaults.image_background_color ?? null;

  const solidMatch = imageSource.match(/^(solido|solid)(?:[:\s]+(.+))?$/i);
  if (solidMatch) {
    imageSource = 'solid';
    imageBackgroundColor = imageBackgroundColor || solidMatch[2] || '#0D0D0D';
  }

  return {
    image_source: imageSource || 'brand',
    image_folder: imageSource === 'folder' ? folder : null,
    image_background_color: imageSource === 'solid' ? (imageBackgroundColor || '#0D0D0D') : null,
  };
}

function shouldPrepareAdsForQuickVideo(item) {
  const targets = Array.isArray(item?.targets) ? item.targets : [];
  const wantsQuick = targets.includes('video_quick');
  return wantsQuick && item?.image_source === 'solid';
}

function safeName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function listCampaigns(projectDir) {
  const outputsDir = path.join(PROJECT_ROOT, projectDir, 'outputs');
  if (!fs.existsSync(outputsDir)) return [];
  return fs.readdirSync(outputsDir)
    .filter((name) => {
      const abs = path.join(outputsDir, name);
      return fs.statSync(abs).isDirectory()
        && fs.existsSync(path.join(abs, 'creative', 'creative_brief.json'))
        && !fs.existsSync(path.join(abs, 'archived.json'))
        && name !== 'imports';
    })
    .sort();
}

function parseCampaignEntry(raw, defaults, projectDir, outputRoot) {
  const entry = typeof raw === 'string' ? { campaign_id: raw } : { ...(raw || {}) };
  const campaignId = entry.campaign_id || entry.campaign || entry.id || entry.name;
  if (!campaignId) throw new Error('campaign entry missing campaign_id');

  const outputName = entry.output_name || `${campaignId}`;
  const outputDir = entry.output_dir
    ? String(entry.output_dir).trim()
    : path.join(outputRoot, outputName).replace(/\\/g, '/');

  return {
    campaign_id: campaignId,
    output_name: outputName,
    output_dir: outputDir,
    targets: normalizeTargets(entry.targets ?? defaults.targets),
    narrator: entry.narrator ?? defaults.narrator ?? 'rachel',
    video_duration: Number(entry.video_duration ?? defaults.video_duration ?? 20),
    quick_mode: entry.quick_mode ?? defaults.quick_mode ?? 'normal',
    platform_targets: Array.isArray(entry.platform_targets ?? defaults.platform_targets)
      ? (entry.platform_targets ?? defaults.platform_targets)
      : ['instagram'],
    style_preset: entry.style_preset ?? defaults.style_preset ?? 'inema_hightech',
    photo_quality: entry.photo_quality ?? defaults.photo_quality ?? 'simples',
    scene_quality: entry.scene_quality ?? defaults.scene_quality ?? 'simples',
    ...normalizeImageConfig(entry, defaults),
    description: entry.description || '',
    project_dir: projectDir,
  };
}

function parseManifest(batchDir) {
  const manifestPath = path.join(batchDir, 'manifest.json');
  const manifest = readJson(manifestPath);
  if (!manifest) throw new Error(`manifest.json inválido ou ausente em ${batchDir}`);

  const batchName = path.basename(batchDir);
  const projectDir = manifest.project_dir;
  if (!projectDir) throw new Error('manifest.json precisa de "project_dir"');

  const outputRoot = String(
    manifest.output_root
      || `${projectDir}/outputs/imports/${batchName}`
  ).replace(/\\/g, '/');

  const defaults = {
    targets: normalizeTargets(manifest.defaults?.targets ?? manifest.targets ?? ['ads']),
    narrator: manifest.defaults?.narrator ?? manifest.narrator ?? 'rachel',
    video_duration: Number(manifest.defaults?.video_duration ?? manifest.video_duration ?? 20),
    quick_mode: manifest.defaults?.quick_mode ?? manifest.quick_mode ?? 'normal',
    platform_targets: manifest.defaults?.platform_targets ?? manifest.platform_targets ?? ['instagram'],
    style_preset: manifest.defaults?.style_preset ?? manifest.style_preset ?? 'inema_hightech',
    photo_quality: manifest.defaults?.photo_quality ?? manifest.photo_quality ?? 'simples',
    scene_quality: manifest.defaults?.scene_quality ?? manifest.scene_quality ?? 'simples',
    image_source: manifest.defaults?.image_source ?? manifest.image_source ?? 'brand',
    image_folder: manifest.defaults?.image_folder ?? manifest.image_folder ?? null,
    image_background_color: manifest.defaults?.image_background_color ?? manifest.image_background_color ?? null,
  };

  const rawCampaigns = manifest.campaigns === 'all' || manifest.campaigns === '*' || manifest.campaigns == null
    ? listCampaigns(projectDir)
    : manifest.campaigns;

  const campaigns = (rawCampaigns || []).map((entry) => parseCampaignEntry(entry, defaults, projectDir, outputRoot));
  if (campaigns.length === 0) throw new Error('manifest sem campanhas para processar');

  return {
    titulo: manifest.titulo || manifest.title || batchName,
    batch_name: batchName,
    batch_dir: batchDir,
    manifest_path: manifestPath,
    project_dir: projectDir,
    output_root: outputRoot,
    auto_approve_video: manifest.auto_approve_video !== false,
    cleanup_import: manifest.cleanup_import !== false,
    force_new_plan: manifest.force_new_plan === true,
    campaigns,
  };
}

function loadState(batchDir) {
  return readJson(path.join(batchDir, '.state.json'), { items: {} });
}

function saveState(batchDir, state) {
  writeJson(path.join(batchDir, '.state.json'), state);
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function removeIfExists(target) {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function findExistingNarrationFile(sourceDir) {
  const audioDir = path.join(sourceDir, 'audio');
  if (!fs.existsSync(audioDir)) return null;

  const files = fs.readdirSync(audioDir).filter((name) => /\.mp3$/i.test(name));
  const priorities = [
    /_quick_01_narration\.mp3$/i,
    /_quick_narration\.mp3$/i,
    /_video_01_narration\.mp3$/i,
    /_video_\d+_narration\.mp3$/i,
  ];

  for (const pattern of priorities) {
    const found = files.find((name) => pattern.test(name));
    if (found) return path.join(audioDir, found);
  }

  return files.length > 0 ? path.join(audioDir, files[0]) : null;
}

function collectFinalVideoFiles(targetDir) {
  const videoDir = path.join(targetDir, 'video');
  if (!fs.existsSync(videoDir)) return [];
  return fs.readdirSync(videoDir)
    .filter((name) => name.endsWith('.mp4') && !name.includes('draft'))
    .map((name) => {
      const abs = path.join(videoDir, name);
      return { abs, mtime: fs.statSync(abs).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 1)
    .map((item) => item.abs);
}

function copyBatchVideos(batch, item, targetDir) {
  const videos = collectFinalVideoFiles(targetDir);
  if (videos.length === 0) return [];

  const aggregateDir = path.join(batch.batch_dir, 'videos');
  ensureDir(aggregateDir);

  return videos.map((srcPath) => {
    const ext = path.extname(srcPath);
    const base = path.basename(srcPath, ext);
    const filename = `${safeName(item.output_name)}__${safeName(base)}${ext}`;
    const destPath = path.join(aggregateDir, filename);
    fs.copyFileSync(srcPath, destPath);
    return filename;
  });
}

function readCampaignMeta(targetDir) {
  const brief = readJson(path.join(targetDir, 'creative', 'creative_brief.json'), {});
  const narrative = readJson(path.join(targetDir, 'copy', 'narrative.json'), {});
  const payload = readJson(path.join(targetDir, 'campaign_payload.json'), {});

  const title = brief.campaign_theme
    || (brief.campaign_name || '').replace(/_/g, ' ')
    || payload.task_name || '';

  const description = narrative.story
    || brief.campaign_angle
    || payload.campaign_brief
    || '';

  const rawName = brief.campaign_name || payload.task_name || '';
  const tags = rawName
    .replace(/[-_]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .map((t) => t.toLowerCase());

  return { title, description, tags };
}

function updateBatchManifest(batchDir, newClips) {
  const manifestPath = path.join(batchDir, 'manifest.json');
  const existing = readJson(manifestPath, {});
  const clips = existing.clips || [];
  for (const clip of newClips) {
    if (!clips.find((c) => c.filename === clip.filename)) {
      clips.push(clip);
    }
  }
  writeJson(manifestPath, { ...existing, clips });
}

function collectFinalAdFiles(targetDir) {
  const adsDir = path.join(targetDir, 'ads');
  if (!fs.existsSync(adsDir)) return [];
  return fs.readdirSync(adsDir)
    .filter((name) => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .map((name) => path.join(adsDir, name));
}

function copyBatchAds(batch, item, targetDir) {
  const ads = collectFinalAdFiles(targetDir);
  if (ads.length === 0) return [];

  const aggregateDir = path.join(batch.batch_dir, 'ad');
  ensureDir(aggregateDir);

  return ads.map((srcPath) => {
    const ext = path.extname(srcPath);
    const base = path.basename(srcPath, ext);
    const filename = `${safeName(item.output_name)}__${safeName(base)}${ext}`;
    const destPath = path.join(aggregateDir, filename);
    fs.copyFileSync(srcPath, destPath);
    return path.relative(PROJECT_ROOT, destPath).replace(/\\/g, '/');
  });
}

function prepareTargetCampaign(item) {
  const sourceDir = path.join(PROJECT_ROOT, item.project_dir, 'outputs', item.campaign_id);
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`campanha origem não encontrada: ${item.project_dir}/outputs/${item.campaign_id}`);
  }

  const targetDir = path.isAbsolute(item.output_dir)
    ? item.output_dir
    : path.join(PROJECT_ROOT, item.output_dir);
  ensureDir(targetDir);

  if (item.targets.includes('ads')) {
    removeIfExists(path.join(sourceDir, 'logs', 'ad_creative_designer.log'));
  }

  if (item.targets.includes('video_quick') || item.targets.includes('video_pro')) {
    removeIfExists(path.join(sourceDir, 'logs', 'video_quick.log'));
    removeIfExists(path.join(sourceDir, 'logs', 'video_pro.log'));
    removeIfExists(path.join(sourceDir, 'video', 'approval_needed.json'));
    removeIfExists(path.join(sourceDir, 'video', 'approved.json'));
    removeIfExists(path.join(sourceDir, 'video', 'rejected.json'));
    const videoDir = path.join(sourceDir, 'video');
    if (item.force_new_plan) {
      // Delete existing scene plans to force Claude to generate a new one
      if (fs.existsSync(videoDir)) {
        for (const f of fs.readdirSync(videoDir)) {
          if (f.includes('scene_plan') && f.endsWith('.json')) removeIfExists(path.join(videoDir, f));
        }
      }
    }
  }

  const sourceNarrationFile = findExistingNarrationFile(sourceDir);
  const existingNarrationFile = sourceNarrationFile
    ? sourceNarrationFile
    : null;

  return { sourceDir, targetDir: sourceDir, existingNarrationFile };
}

function waitForLog(targetDir, agentName, timeoutMs = 7200000) {
  const logPath = path.join(targetDir, 'logs', `${agentName}.log`);
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout aguardando ${agentName}`));
        return;
      }
      if (!fs.existsSync(logPath)) return;
      const content = fs.readFileSync(logPath, 'utf-8');
      if (content.includes('FAILED:')) {
        clearInterval(timer);
        reject(new Error(`${agentName} falhou`));
        return;
      }
      if (content.includes('Completed successfully.')) {
        clearInterval(timer);
        resolve();
      }
    }, 5000);
  });
}

function buildPayload(item, targetDir) {
  const origPayload = readJson(path.join(targetDir, 'campaign_payload.json'), {});
  const relOutputDir = path.relative(PROJECT_ROOT, targetDir).replace(/\\/g, '/');
  const taskName = path.basename(targetDir);
  const targets = item.targets;
  const wantQuick = targets.includes('video_quick');
  const wantPro = targets.includes('video_pro');

  return {
    ...origPayload,
    task_name: taskName,
    task_date: getNowParts().date,
    project_dir: item.project_dir,
    output_dir: relOutputDir,
    platform_targets: item.platform_targets,
    language: origPayload.language || 'pt-BR',
    narrator: item.narrator,
    video_duration: item.video_duration,
    quick_mode: item.quick_mode,
    video_quick: wantQuick,
    video_pro: wantPro,
    video_mode: wantQuick && wantPro ? 'both' : wantPro ? 'pro' : 'quick',
    video_audio: item.video_audio || 'narration',
    image_source: item.image_source,
    image_folder: item.image_folder,
    image_background_color: item.image_background_color,
    style_preset: item.style_preset,
    photo_quality: item.photo_quality,
    scene_quality: item.scene_quality,
    approval_modes: { stage1: 'auto', stage2: 'auto', stage3: 'auto', stage4: 'auto', stage5: 'auto' },
    notifications: false,
    skip_dependencies: true,
  };
}

async function executeItem(batch, item, state) {
  const nowParts = getNowParts();
  const stateKey = item.output_name;
  const entryState = state.items[stateKey] || {};
  state.items[stateKey] = { ...entryState, status: 'running', started_at: nowParts.iso, campaign_id: item.campaign_id };
  saveState(batch.batch_dir, state);

  const { targetDir, existingNarrationFile } = prepareTargetCampaign({ ...item, force_new_plan: batch.force_new_plan });
  const payload = buildPayload(item, targetDir);
  if (existingNarrationFile) {
    payload.existing_narration_file = path.relative(PROJECT_ROOT, existingNarrationFile).replace(/\\/g, '/');
  }

  const wantsAds = item.targets.includes('ads');
  const wantsVideo = item.targets.includes('video_quick') || item.targets.includes('video_pro');
  const prepareAdsForQuickVideo = shouldPrepareAdsForQuickVideo(item);

  if (wantsAds || prepareAdsForQuickVideo) {
    // For solid quick videos, regenerate ads as CSS-only slides so video_quick
    // can consume the rendered PNGs from ads/ as its visual source.
    if (prepareAdsForQuickVideo && !wantsAds) {
      removeIfExists(path.join(targetDir, 'logs', 'ad_creative_designer.log'));
      // Remove old carousel/story images so video_quick only uses the new solid ones
      const adsDir = path.join(targetDir, 'ads');
      if (fs.existsSync(adsDir)) {
        for (const f of fs.readdirSync(adsDir)) {
          if (/\.(png|jpg|jpeg)$/i.test(f)) {
            removeIfExists(path.join(adsDir, f));
          }
        }
      }
      // Ensure enough slides for a video (min 5 if not specified)
      if (!payload.image_count || payload.image_count < 5) {
        payload.image_count = 5;
      }
    }
    await enqueueStage(payload, ['ad_creative_designer']);
    await waitForLog(targetDir, 'ad_creative_designer');
  }

  if (wantsVideo) {
    if (batch.auto_approve_video) {
      writeJson(path.join(targetDir, 'video', 'approved.json'), {
        approved: true,
        feedback: 'batch-auto',
        ts: new Date().toISOString(),
      });
    }
    await enqueueStage(payload, ['video_quick']);
    if (item.targets.includes('video_quick')) await waitForLog(targetDir, 'video_quick');
    if (item.targets.includes('video_pro')) await waitForLog(targetDir, 'video_pro');
  }

  const batchVideos = item.targets.includes('video_quick') || item.targets.includes('video_pro')
    ? copyBatchVideos(batch, item, targetDir)
    : [];
  const batchAds = item.targets.includes('ads')
    ? copyBatchAds(batch, item, targetDir)
    : [];

  // Update manifest with yt-pub-lives2 compatible clip entries
  const meta = readCampaignMeta(targetDir);
  const manifestClips = [
    ...batchVideos.map((filename) => ({
      filename: `videos/${filename}`,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
    })),
    ...batchAds.map((filename) => ({
      filename: `ad/${filename}`,
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
    })),
  ];
  if (manifestClips.length > 0) {
    updateBatchManifest(batch.batch_dir, manifestClips);
  }

  state.items[stateKey] = {
    ...state.items[stateKey],
    status: 'completed',
    completed_at: new Date().toISOString(),
    output_dir: payload.output_dir,
    targets: item.targets,
    batch_videos: batchVideos,
    batch_ads: batchAds,
  };
  saveState(batch.batch_dir, state);

  return { batchVideos, batchAds };
}

async function scanBatch(batchDir, opts = {}) {
  const batch = parseManifest(batchDir);
  const state = loadState(batchDir);
  const nowParts = getNowParts();
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  const pending = batch.campaigns.filter((item) => {
    const itemState = state.items[item.output_name];
    return !itemState || itemState.status !== 'completed';
  });

  const due = pending;
  const details = [];

  for (let i = 0; i < due.length; i++) {
    const item = due[i];
    if (onProgress) onProgress({ status: 'starting', campaign_id: item.campaign_id, index: i + 1, total: due.length });
    try {
      await executeItem(batch, item, state);
      details.push({ campaign_id: item.campaign_id, ok: true, output_dir: item.output_dir, targets: item.targets });
      if (onProgress) onProgress({ status: 'done', campaign_id: item.campaign_id, index: i + 1, total: due.length });
    } catch (err) {
      state.items[item.output_name] = {
        ...(state.items[item.output_name] || {}),
        status: 'failed',
        failed_at: new Date().toISOString(),
        error: err.message,
      };
      saveState(batch.batch_dir, state);
      details.push({ campaign_id: item.campaign_id, ok: false, error: err.message });
      if (onProgress) onProgress({ status: 'failed', campaign_id: item.campaign_id, index: i + 1, total: due.length, error: err.message });
      if (!opts.keepGoing) break;
    }
  }

  const remaining = batch.campaigns.filter((item) => {
    const itemState = state.items[item.output_name];
    return !itemState || itemState.status !== 'completed';
  });


  return {
    ok: details.every((d) => d.ok),
    titulo: batch.titulo,
    processados: details.filter((d) => d.ok).length,
    total: batch.campaigns.length,
    restantes: remaining.length,
    detalhes: details,
  };
}

async function scanImports(opts = {}) {
  ensureDir(IMPORTS_DIR);
  const folders = fs.readdirSync(IMPORTS_DIR)
    .map((name) => path.join(IMPORTS_DIR, name))
    .filter((abs) => fs.statSync(abs).isDirectory());

  const results = [];
  for (const batchDir of folders) {
    if (fs.existsSync(path.join(batchDir, 'cancelled.json'))) {
      results.push({ ok: true, skipped: true, pasta: path.basename(batchDir), motivo: 'cancelado' });
      continue;
    }
    try {
      results.push(await scanBatch(batchDir, opts));
    } catch (err) {
      results.push({ ok: false, pasta: path.basename(batchDir), error: err.message });
      if (!opts.keepGoing) break;
    }
  }

  return {
    ok: results.every((r) => r.ok !== false),
    processados: results.reduce((sum, r) => sum + (r.processados || 0), 0),
    total: results.length,
    detalhes: results,
  };
}

function cancelBatch(batchName) {
  const batchDir = path.join(IMPORTS_DIR, batchName);
  if (!fs.existsSync(batchDir)) throw new Error(`batch não encontrado: ${batchName}`);
  writeJson(path.join(batchDir, 'cancelled.json'), { cancelled_at: new Date().toISOString() });
  return { ok: true, batch: batchName };
}

function cleanImports() {
  ensureDir(IMPORTS_DIR);
  for (const name of fs.readdirSync(IMPORTS_DIR)) {
    fs.rmSync(path.join(IMPORTS_DIR, name), { recursive: true, force: true });
  }
  return { ok: true };
}

async function main() {
  const action = process.argv[2] || 'scan';
  if (action === 'scan') {
    const result = await scanImports({ keepGoing: true });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (action === 'cancel') {
    const batchName = process.argv[3];
    if (!batchName) { console.error('Uso: ... cancel <nome-do-batch>'); process.exit(1); }
    console.log(JSON.stringify(cancelBatch(batchName), null, 2));
    return;
  }
  if (action === 'clean-imports') {
    console.log(JSON.stringify(cleanImports(), null, 2));
    return;
  }

  console.error('Uso: node scripts/campaign-import-worker.js scan | cancel <batch> | clean-imports');
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  IMPORTS_DIR,
  normalizeTargets,
  normalizeImageConfig,
  shouldPrepareAdsForQuickVideo,
  parseManifest,
  scanBatch,
  scanImports,
  cancelBatch,
  cleanImports,
};
