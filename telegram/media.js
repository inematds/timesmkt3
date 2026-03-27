/**
 * Sends media files (images, videos, documents) back to Telegram.
 */

const fs = require('fs');
const path = require('path');
const { InputFile } = require('grammy');

/**
 * Send a photo to a chat.
 */
async function sendPhoto(ctx, filePath, caption) {
  if (!fs.existsSync(filePath)) {
    await ctx.reply(`Arquivo nao encontrado: ${path.basename(filePath)}`);
    return;
  }
  await ctx.replyWithPhoto(new InputFile(filePath), {
    caption: caption || path.basename(filePath),
  });
}

/**
 * Send a video to a chat.
 */
async function sendVideo(ctx, filePath, caption) {
  if (!fs.existsSync(filePath)) {
    await ctx.reply(`Arquivo nao encontrado: ${path.basename(filePath)}`);
    return;
  }
  await ctx.replyWithVideo(new InputFile(filePath), {
    caption: caption || path.basename(filePath),
  });
}

/**
 * Send a document to a chat.
 */
async function sendDocument(ctx, filePath, caption) {
  if (!fs.existsSync(filePath)) {
    await ctx.reply(`Arquivo nao encontrado: ${path.basename(filePath)}`);
    return;
  }
  await ctx.replyWithDocument(new InputFile(filePath), {
    caption: caption || path.basename(filePath),
  });
}

/**
 * Send all campaign outputs for a task folder.
 * Sends images as photos, videos as videos, and everything else as documents.
 */
async function sendCampaignOutputs(ctx, outputDir) {
  if (!fs.existsSync(outputDir)) {
    await ctx.reply(`Pasta nao encontrada: ${outputDir}`);
    return;
  }

  const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
  const videoExts = ['.mp4', '.mov', '.webm'];

  // Send ads
  const adsDir = path.join(outputDir, 'ads');
  if (fs.existsSync(adsDir)) {
    const adFiles = fs.readdirSync(adsDir).filter(f => imageExts.includes(path.extname(f).toLowerCase()));
    for (const f of adFiles) {
      await sendPhoto(ctx, path.join(adsDir, f), `Ad: ${f}`);
    }
  }

  // Send videos
  const videoDir = path.join(outputDir, 'video');
  if (fs.existsSync(videoDir)) {
    const videoFiles = fs.readdirSync(videoDir).filter(f => videoExts.includes(path.extname(f).toLowerCase()));
    for (const f of videoFiles) {
      await sendVideo(ctx, path.join(videoDir, f), `Video: ${f}`);
    }
  }

  // Send copy files
  const copyDir = path.join(outputDir, 'copy');
  if (fs.existsSync(copyDir)) {
    const copyFiles = fs.readdirSync(copyDir);
    for (const f of copyFiles) {
      await sendDocument(ctx, path.join(copyDir, f), `Copy: ${f}`);
    }
  }

  // Send Publish MD if exists
  const publishFiles = fs.readdirSync(outputDir).filter(f => f.startsWith('Publish') && f.endsWith('.md'));
  for (const f of publishFiles) {
    await sendDocument(ctx, path.join(outputDir, f), f);
  }
}

module.exports = { sendPhoto, sendVideo, sendDocument, sendCampaignOutputs };
