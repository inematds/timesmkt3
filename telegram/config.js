/**
 * Telegram bot configuration — reads from .env
 */

const { getList, requireEnv } = require('../config/env');

const config = {
  botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  allowedChatIds: getList('TELEGRAM_ALLOWED_CHAT_IDS'),
};

module.exports = config;
