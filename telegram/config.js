/**
 * Telegram bot configuration — reads from .env
 */

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env');
const envData = fs.readFileSync(envPath, 'utf-8');

function envVar(name) {
  const match = envData.match(new RegExp(`^${name}=(.*)`, 'm'));
  return match ? match[1].trim() : '';
}

const config = {
  botToken: envVar('TELEGRAM_BOT_TOKEN'),
  allowedChatIds: envVar('TELEGRAM_ALLOWED_CHAT_IDS')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
};

if (!config.botToken) {
  throw new Error('TELEGRAM_BOT_TOKEN not set in .env');
}

module.exports = config;
