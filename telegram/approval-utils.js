const fs = require('fs');
const path = require('path');
const { InputFile } = require('grammy');

function readChatContext(campDir) {
  try {
    const f = path.join(campDir, 'chat_context.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf-8')) : null;
  } catch {
    return null;
  }
}

function writeImageApproval(projectRoot, outputDir, approved, feedback = null) {
  const imgsDir = path.join(projectRoot, outputDir, 'imgs');
  fs.mkdirSync(imgsDir, { recursive: true });
  const file = approved ? 'approved.json' : 'rejected.json';
  fs.writeFileSync(path.join(imgsDir, file), JSON.stringify({ approved, feedback, ts: new Date().toISOString() }));
  for (const stale of ['approval_needed.json', 'timed_out.json']) {
    const fullPath = path.join(imgsDir, stale);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
}

function writeVideoApproval(projectRoot, outputDir, approved, feedback = null) {
  const videoDir = path.join(projectRoot, outputDir, 'video');
  fs.mkdirSync(videoDir, { recursive: true });
  const file = approved ? 'approved.json' : 'rejected.json';
  fs.writeFileSync(path.join(videoDir, file), JSON.stringify({ approved, feedback, ts: new Date().toISOString() }));
  for (const stale of ['approval_needed.json', 'timed_out.json']) {
    const fullPath = path.join(videoDir, stale);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  }
}

function writeImageApprovalTimeout(projectRoot, outputDir, reason = 'approval timeout') {
  const imgsDir = path.join(projectRoot, outputDir, 'imgs');
  fs.mkdirSync(imgsDir, { recursive: true });
  fs.writeFileSync(path.join(imgsDir, 'timed_out.json'), JSON.stringify({ timed_out: true, reason, ts: new Date().toISOString() }));
  const signal = path.join(imgsDir, 'approval_needed.json');
  if (fs.existsSync(signal)) fs.unlinkSync(signal);
}

function writeVideoApprovalTimeout(projectRoot, outputDir, reason = 'approval timeout') {
  const videoDir = path.join(projectRoot, outputDir, 'video');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.writeFileSync(path.join(videoDir, 'timed_out.json'), JSON.stringify({ timed_out: true, reason, ts: new Date().toISOString() }));
  const signal = path.join(videoDir, 'approval_needed.json');
  if (fs.existsSync(signal)) fs.unlinkSync(signal);
}

function formatStoryboardMessage(projectRoot, outputDir, escapeHtml) {
  const videoDir = path.join(projectRoot, outputDir, 'video');
  if (!fs.existsSync(videoDir)) return null;

  let planFiles = fs.readdirSync(videoDir).filter(f => f.endsWith('_scene_plan_motion.json')).sort();
  if (planFiles.length === 0) {
    planFiles = fs.readdirSync(videoDir).filter(f => f.endsWith('_scene_plan.json')).sort();
  }
  if (planFiles.length === 0) return null;

  const lines = ['🎬 <b>Roteiro gerado — confirme antes de renderizar</b>\n'];

  for (const file of planFiles) {
    try {
      const plan = JSON.parse(fs.readFileSync(path.join(videoDir, file), 'utf-8'));
      const voiceLabel = { rachel: 'Rachel (emocional)', bella: 'Bella (amigável)', domi: 'Domi (confiante)', antoni: 'Antoni (profissional)', josh: 'Josh (profundo)', arnold: 'Arnold (energético)' };
      const sceneCount = (plan.scenes || []).length;
      const totalDur = (plan.scenes || []).reduce((sum, cut) => sum + (cut.duration || 0), 0).toFixed(0);
      const pacing = plan.pacing || '';

      lines.push(`<b>${plan.titulo || file}</b>`);
      lines.push(`Voz: ${voiceLabel[plan.voice] || plan.voice || 'padrão'} | ${totalDur}s | ${sceneCount} cortes${pacing ? ` | ${pacing}` : ''}\n`);

      if (plan.narration_script) {
        const preview = plan.narration_script.slice(0, 150);
        lines.push(`<i>"${escapeHtml(preview)}${plan.narration_script.length > 150 ? '...' : ''}"</i>\n`);
      }

      if (sceneCount > 10 && plan.sections) {
        lines.push('<b>Seções:</b>');
        for (const sec of plan.sections) {
          const dur = sec.end_s - sec.start_s;
          lines.push(`  ${sec.name} (${sec.start_s}-${sec.end_s}s): ${sec.cuts} cortes em ${dur}s`);
        }
        lines.push('\n<b>Amostra de cortes:</b>');
        const scenes = plan.scenes || [];
        const sample = [...scenes.slice(0, 3), null, ...scenes.slice(-2)];
        sample.forEach((scene) => {
          if (!scene) {
            lines.push('  ...');
            return;
          }
          const txt = scene.text_overlay ? `"${escapeHtml(scene.text_overlay)}"` : '(visual)';
          const motion = scene.motion?.type || '';
          lines.push(`  #${scene.cut_number || '?'}. [${scene.type || scene.id}] ${txt} — ${scene.duration}s ${motion}`);
        });
      } else {
        lines.push('<b>Cenas:</b>');
        (plan.scenes || []).forEach((scene, index) => {
          const imgName = scene.image ? path.basename(scene.image) : '(sem imagem)';
          const crop = scene.image_crop_focus ? ` crop:${scene.image_crop_focus}` : '';
          lines.push(`  ${index + 1}. [${scene.type || scene.id}] "<b>${escapeHtml(scene.text_overlay || '')}</b>" — ${escapeHtml(imgName)}${crop} | ${scene.duration}s`);
        });
      }

      lines.push('');
    } catch {}
  }

  lines.push('Responda <b>sim</b> para renderizar ou <b>não</b> para cancelar.');
  lines.push('Ou descreva ajustes e eu reescrevo o roteiro.');
  return lines.join('\n');
}

async function sendImageApprovalRequest({ projectRoot, botApi, session, chatId, outputDir }) {
  const absImgsDir = path.join(projectRoot, outputDir, 'imgs');
  if (!fs.existsSync(absImgsDir)) {
    writeImageApproval(projectRoot, outputDir, true);
    return;
  }

  const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
  const images = fs.readdirSync(absImgsDir)
    .filter(f => imageExts.includes(path.extname(f).toLowerCase()) && f.startsWith('generated_'))
    .sort()
    .map(f => path.join(absImgsDir, f));

  if (images.length === 0) {
    writeImageApproval(projectRoot, outputDir, true);
    return;
  }

  session.setPendingVideoApproval(chatId, { outputDir, type: 'images' });

  await botApi.sendMessage(chatId,
    `🖼 <b>${images.length} imagens geradas — aprove antes de montar os criativos</b>\n\nEnviando uma por uma...`,
    { parse_mode: 'HTML' }
  );

  for (const imgPath of images) {
    try {
      await botApi.sendPhoto(chatId, new InputFile(imgPath), { caption: path.basename(imgPath) });
    } catch {
      await botApi.sendMessage(chatId, `(não foi possível enviar ${path.basename(imgPath)})`).catch(() => {});
    }
  }

  await botApi.sendMessage(chatId,
    `Responda <b>sim</b> para usar estas imagens e continuar.\n` +
    `<b>não</b> para cancelar.\n` +
    `Ou descreva o que ajustar e vou regenerar.`,
    { parse_mode: 'HTML' }
  );
}

async function sendVideoApprovalRequest({ projectRoot, botApi, session, chatId, outputDir, escapeHtml }) {
  const msg = formatStoryboardMessage(projectRoot, outputDir, escapeHtml);
  if (!msg) {
    writeVideoApproval(projectRoot, outputDir, true);
    return;
  }

  session.setPendingVideoApproval(chatId, { outputDir, absOutputDir: path.join(projectRoot, outputDir) });
  await botApi.sendMessage(chatId, msg, { parse_mode: 'HTML' });
}

async function scanPendingApprovals({ projectRoot, targetChatId, ctx, botApi, session, sendImageApprovalRequest, sendVideoApprovalRequest }) {
  const prjRoot = path.resolve(projectRoot, 'prj');
  if (!fs.existsSync(prjRoot)) return;

  const pending = [];

  for (const prj of fs.readdirSync(prjRoot)) {
    const outRoot = path.join(prjRoot, prj, 'outputs');
    if (!fs.existsSync(outRoot)) continue;
    for (const campaign of fs.readdirSync(outRoot)) {
      const campDir = path.join(outRoot, campaign);
      const relDir = `prj/${prj}/outputs/${campaign}`;

      const videoSignal = path.join(campDir, 'video', 'approval_needed.json');
      const videoApproved = path.join(campDir, 'video', 'approved.json');
      const videoRejected = path.join(campDir, 'video', 'rejected.json');
      const videoTimedOut = path.join(campDir, 'video', 'timed_out.json');
      if (fs.existsSync(videoSignal) && !fs.existsSync(videoApproved) && !fs.existsSync(videoRejected) && !fs.existsSync(videoTimedOut)) {
        const ctx2 = readChatContext(campDir);
        if (!targetChatId || ctx2?.chatId === targetChatId || !ctx2) {
          pending.push({ type: 'video', outputDir: relDir, chatId: ctx2?.chatId || targetChatId });
        }
      }

      const imgSignal = path.join(campDir, 'imgs', 'approval_needed.json');
      const imgApproved = path.join(campDir, 'imgs', 'approved.json');
      const imgRejected = path.join(campDir, 'imgs', 'rejected.json');
      const imgTimedOut = path.join(campDir, 'imgs', 'timed_out.json');
      if (fs.existsSync(imgSignal) && !fs.existsSync(imgApproved) && !fs.existsSync(imgRejected) && !fs.existsSync(imgTimedOut)) {
        const ctx2 = readChatContext(campDir);
        if (!targetChatId || ctx2?.chatId === targetChatId || !ctx2) {
          pending.push({ type: 'images', outputDir: relDir, chatId: ctx2?.chatId || targetChatId });
        }
      }
    }
  }

  if (pending.length === 0) {
    if (ctx) await ctx.reply('Nenhuma aprovação pendente encontrada.');
    return;
  }

  for (const item of pending) {
    if (!item.chatId) continue;
    console.log(`[startup] Pending ${item.type} approval found: ${item.outputDir} → chat ${item.chatId}`);
    if (item.type === 'video') {
      session.setPendingVideoApproval(item.chatId, { outputDir: item.outputDir, type: 'video' });
      await sendVideoApprovalRequest(item.chatId, item.outputDir);
    } else {
      session.setPendingVideoApproval(item.chatId, { outputDir: item.outputDir, type: 'images' });
      await sendImageApprovalRequest(item.chatId, item.outputDir);
    }
  }
}

module.exports = {
  readChatContext,
  writeImageApproval,
  writeVideoApproval,
  writeImageApprovalTimeout,
  writeVideoApprovalTimeout,
  formatStoryboardMessage,
  sendImageApprovalRequest,
  sendVideoApprovalRequest,
  scanPendingApprovals,
};
