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

// Default image model per provider — used as fallback when the payload doesn't
// specify image_model. Each provider module also exports its own DEFAULT_MODEL
// for worker use; this mirror exists so the bot layer can compute the right
// default before a job is queued, without requiring the provider module.
const PROVIDER_DEFAULT_MODEL_ENV = {
  inemaimg: 'INEMAIMG_MODEL',
  kie: 'KIE_DEFAULT_MODEL',
};
const PROVIDER_DEFAULT_MODEL_FALLBACK = {
  inemaimg: 'flux2-klein',
  kie: 'z-image',
  pollinations: 'flux',
  piramyd: 'flux',
};

function getDefaultImageModel(providerName, env) {
  const provider = String(providerName || (env && env.IMAGE_PROVIDER) || getEnv('IMAGE_PROVIDER', 'inemaimg')).toLowerCase();
  const envKey = PROVIDER_DEFAULT_MODEL_ENV[provider];
  if (envKey) {
    const injectedValue = env ? normalizeValue(env[envKey]) : '';
    if (injectedValue) return injectedValue;
    const envValue = getEnv(envKey, '');
    if (envValue) return envValue;
  }
  return PROVIDER_DEFAULT_MODEL_FALLBACK[provider] || 'flux2-klein';
}

module.exports = {
  ENV_PATH,
  loadEnv,
  getEnv,
  getList,
  hasEnv,
  requireEnv,
  getDefaultImageModel,
};
