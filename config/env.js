const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ENV_PATH = path.resolve(__dirname, '..', '.env');

let loaded = false;
let fileCache = {};

function loadEnv(options = {}) {
  if (!loaded || options.override) {
    if (fs.existsSync(ENV_PATH)) {
      dotenv.config({ path: ENV_PATH, override: options.override === true });
      const raw = fs.readFileSync(ENV_PATH, 'utf-8');
      fileCache = dotenv.parse(raw);
    } else {
      fileCache = {};
    }
    loaded = true;
  }
  return process.env;
}

function normalizeValue(value) {
  if (value == null) return '';
  return String(value).trim();
}

function getEnv(key, fallback = '') {
  loadEnv();

  const processValue = normalizeValue(process.env[key]);
  if (processValue) return processValue;

  const fileValue = normalizeValue(fileCache[key]);
  if (fileValue) return fileValue;

  return fallback;
}

function hasEnv(key) {
  const value = getEnv(key, '');
  return Boolean(value) && !value.startsWith('YOUR_');
}

function getList(key, fallback = []) {
  const value = getEnv(key, '');
  if (!value) return [...fallback];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function requireEnv(key) {
  const value = getEnv(key, '');
  if (!value) {
    throw new Error(`${key} not set in .env`);
  }
  return value;
}

module.exports = {
  ENV_PATH,
  loadEnv,
  getEnv,
  getList,
  hasEnv,
  requireEnv,
};
