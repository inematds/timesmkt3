const fs = require('fs');
const path = require('path');

function findCampaign(projectRoot, projectDir, query) {
  const outputsDir = path.resolve(projectRoot, projectDir, 'outputs');
  if (!fs.existsSync(outputsDir)) return null;

  const folders = fs.readdirSync(outputsDir).sort();
  const q = query.toLowerCase().replace(/^c0*/, 'c');
  const exact = folders.find((folder) => folder === query);
  if (exact) return exact;

  return folders.find((folder) => (
    folder.toLowerCase().replace(/^c0*/, 'c').startsWith(q)
    || folder.toLowerCase().includes(query.toLowerCase())
  )) || null;
}

function detectProjectFromText(projectRoot, text, currentProjectDir) {
  const prjDir = path.join(projectRoot, 'prj');
  if (!fs.existsSync(prjDir)) return currentProjectDir;

  const projects = fs.readdirSync(prjDir);
  const lower = text.toLowerCase();
  for (const project of projects) {
    if (lower.includes(project.toLowerCase())) return `prj/${project}`;
  }

  return currentProjectDir;
}

function findCampaignAcrossProjects(projectRoot, query) {
  const prjRoot = path.join(projectRoot, 'prj');
  if (!fs.existsSync(prjRoot)) return null;

  for (const project of fs.readdirSync(prjRoot)) {
    const found = findCampaign(projectRoot, `prj/${project}`, query);
    if (found) return { projectDir: `prj/${project}`, campaignFolder: found };
  }

  return null;
}

function createCampaignOutputHandlers({
  splitMessage,
  toTelegramHTML,
  sendPhoto,
  sendVideo,
  sendDocument,
}) {
  async function sendCampaignReport(ctx, outputDir, folderName) {
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    const audioExts = ['.mp3', '.wav', '.ogg'];

    const countFiles = (subdir, exts) => {
      const dir = path.join(outputDir, subdir);
      if (!fs.existsSync(dir)) return 0;
      return fs.readdirSync(dir).filter((file) => exts.includes(path.extname(file).toLowerCase())).length;
    };

    const imgCount = countFiles('ads', imageExts);
    const vidCount = countFiles('video', videoExts);
    const audioCount = countFiles('audio', audioExts);

    const publishFiles = fs.readdirSync(outputDir).filter((file) => file.startsWith('Publish') && file.endsWith('.md'));
    if (publishFiles.length > 0) {
      const publishPath = path.join(outputDir, publishFiles[0]);
      const publishContent = fs.readFileSync(publishPath, 'utf-8');
      const preview = publishContent.slice(0, 3000) + (publishContent.length > 3000 ? '\n\n...' : '');
      const parts = splitMessage(toTelegramHTML(preview));
      for (const part of parts) {
        try {
          await ctx.reply(part, { parse_mode: 'HTML' });
        } catch {
          await ctx.reply(part);
        }
      }
    }

    await ctx.reply(
      `<b>Arquivos disponíveis — ${folderName}</b>\n\n`
        + `🖼 Imagens: <b>${imgCount}</b> arquivos em ads/\n`
        + `🎬 Videos: <b>${vidCount}</b> arquivos em video/\n`
        + `🔊 Audio: <b>${audioCount}</b> arquivos em audio/\n\n`
        + `Para baixar, use:\n`
        + `<code>/enviar ${folderName} imagens</code>\n`
        + `<code>/enviar ${folderName} videos</code>\n`
        + `<code>/enviar ${folderName} audio</code>\n`
        + `<code>/enviar ${folderName} copy</code>\n`
        + `<code>/enviar ${folderName} tudo</code>`,
      { parse_mode: 'HTML' },
    );
  }

  async function sendCampaignFiles(ctx, outputDir, tipo) {
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm'];
    const audioExts = ['.mp3', '.wav', '.ogg'];

    const sendDir = async (subdir, exts, sendFn) => {
      const dir = path.join(outputDir, subdir);
      if (!fs.existsSync(dir)) return 0;

      const files = fs.readdirSync(dir).filter((file) => (
        exts.includes(path.extname(file).toLowerCase()) && !file.endsWith('_prompt.txt')
      ));

      let count = 0;
      for (const file of files) {
        try {
          await sendFn(ctx, path.join(dir, file), file);
          count += 1;
        } catch (err) {
          console.error(`[enviar] Falha ao enviar ${file}: ${err.message}`);
          try {
            await ctx.reply(
              `Nao consegui enviar: <code>${file}</code>\nCaminho: <code>${path.join(dir, file)}</code>`,
              { parse_mode: 'HTML' },
            );
          } catch {}
        }
      }

      return count;
    };

    let sent = 0;

    if (tipo === 'imagens' || tipo === 'tudo') {
      sent += await sendDir('ads', imageExts, sendPhoto);
      sent += await sendDir('imgs', imageExts, sendPhoto);
    }
    if (tipo === 'videos' || tipo === 'tudo') {
      sent += await sendDir('video', videoExts, sendVideo);
    }
    if (tipo === 'audio' || tipo === 'tudo') {
      sent += await sendDir('audio', audioExts, sendDocument);
    }
    if (tipo === 'copy' || tipo === 'tudo') {
      sent += await sendDir('copy', ['.txt', '.json', '.md'], sendDocument);
      const publishFiles = fs.readdirSync(outputDir).filter((file) => file.startsWith('Publish') && file.endsWith('.md'));
      for (const file of publishFiles) {
        await sendDocument(ctx, path.join(outputDir, file), file);
        sent += 1;
      }
    }

    if (sent === 0) {
      await ctx.reply(`Nenhum arquivo encontrado para o tipo: ${tipo}`);
    } else {
      await ctx.reply(`${sent} arquivo(s) enviado(s).`);
    }
  }

  return {
    sendCampaignFiles,
    sendCampaignReport,
  };
}

module.exports = {
  createCampaignOutputHandlers,
  detectProjectFromText,
  findCampaign,
  findCampaignAcrossProjects,
};
