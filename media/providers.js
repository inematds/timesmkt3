/**
 * Media Providers Configuration
 *
 * Central registry of all available media providers for
 * images, sound effects, music, and narration/TTS.
 *
 * Each provider has: name, type, cost, quality, envKeys (required .env vars)
 */

const { getEnv } = require('../config/env');

// ── Provider Definitions ────────────────────────────────────────────────────

const PROVIDERS = {
  // ── IMAGE GENERATION (AI) ──────────────────────
  'kie-zimage': {
    name: 'Kie.ai Z-Image',
    type: 'image',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '~$0.004/image (muito barato)',
    quality: 'high',
    formats: ['1:1', '4:3', '3:4', '16:9', '9:16'],
    envKeys: ['KIE_API_KEY'],
    description: 'Modelo Z-Image (Alibaba). Fotorrealista, rápido, bilíngue. API assíncrona via Kie.ai. Provider padrão do projeto.',
  },
  'dalle': {
    name: 'DALL-E 3 (OpenAI)',
    type: 'image',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '~$0.04/image (1024x1024), ~$0.08 (1792x1024)',
    quality: 'high',
    formats: ['1024x1024', '1024x1792', '1792x1024'],
    envKeys: ['OPENAI_API_KEY'],
    description: 'Geração de imagens por prompt textual. Ideal para ilustrações, personagens, cenas conceituais.',
  },
  'stability': {
    name: 'Stability AI (SDXL)',
    type: 'image',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '~$0.002-0.006/image',
    quality: 'high',
    formats: ['1024x1024', '1536x1024', '1024x1536'],
    envKeys: ['STABILITY_API_KEY'],
    description: 'Stable Diffusion via API. Mais barato que DALL-E, bom para estilos artísticos.',
  },

  // ── IMAGE STOCK (FREE) ─────────────────────────
  'unsplash': {
    name: 'Unsplash',
    type: 'image',
    subtype: 'stock-free',
    cost: 'free',
    priceNote: 'Gratuito, atribuição obrigatória',
    quality: 'high',
    formats: ['qualquer resolução'],
    envKeys: ['UNSPLASH_ACCESS_KEY'],
    description: 'Fotos profissionais gratuitas. Busca por keyword. Ótimo para backgrounds e lifestyle.',
  },
  'pexels': {
    name: 'Pexels',
    type: 'image',
    subtype: 'stock-free',
    cost: 'free',
    priceNote: 'Gratuito, sem atribuição',
    quality: 'high',
    formats: ['qualquer resolução'],
    envKeys: ['PEXELS_API_KEY'],
    description: 'Fotos e vídeos gratuitos. Sem necessidade de crédito. Busca por keyword.',
  },

  // ── SOUND EFFECTS ──────────────────────────────
  'pixabay-sfx': {
    name: 'Pixabay Audio',
    type: 'sfx',
    subtype: 'stock-free',
    cost: 'free',
    priceNote: 'Gratuito, uso comercial liberado',
    quality: 'good',
    formats: ['mp3'],
    envKeys: [],
    description: 'Biblioteca de SFX e música royalty-free. Sem API key necessária (web scraping).',
  },
  'freesound': {
    name: 'Freesound.org',
    type: 'sfx',
    subtype: 'stock-free',
    cost: 'free',
    priceNote: 'Gratuito, licenças variam (CC0, CC-BY)',
    quality: 'good',
    formats: ['wav', 'mp3', 'ogg'],
    envKeys: ['FREESOUND_API_KEY'],
    description: 'Banco colaborativo de sons. Enorme variedade. Busca por keyword.',
  },

  // ── MUSIC ──────────────────────────────────────
  'suno': {
    name: 'Suno AI',
    type: 'music',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '~$0.05/música (plano pro), 5 grátis/dia',
    quality: 'high',
    formats: ['mp3'],
    envKeys: ['SUNO_API_KEY'],
    description: 'Geração de música por prompt. Cria tracks completas com vocal ou instrumental.',
  },
  'pixabay-music': {
    name: 'Pixabay Music',
    type: 'music',
    subtype: 'stock-free',
    cost: 'free',
    priceNote: 'Gratuito, uso comercial liberado',
    quality: 'good',
    formats: ['mp3'],
    envKeys: [],
    description: 'Música royalty-free. Filtros por mood, gênero, duração.',
  },

  // ── NARRATION / TTS ────────────────────────────
  'elevenlabs': {
    name: 'ElevenLabs',
    type: 'tts',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '$5/mês (30k chars), $0.30/1k chars pay-as-you-go',
    quality: 'excellent',
    formats: ['mp3', 'wav'],
    languages: ['pt-BR', 'en', 'es', '+29 idiomas'],
    envKeys: ['ELEVENLABS_API_KEY'],
    description: 'Vozes ultra-realistas. Clonagem de voz. Melhor qualidade do mercado.',
  },
  'minimax': {
    name: 'MiniMax TTS',
    type: 'tts',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '~$0.01/1k chars',
    quality: 'high',
    formats: ['mp3', 'wav'],
    languages: ['pt-BR', 'en', 'zh', 'es'],
    envKeys: ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID'],
    description: 'TTS de alta qualidade. Suporte a múltiplas vozes e emoções.',
  },
  'openai-tts': {
    name: 'OpenAI TTS',
    type: 'tts',
    subtype: 'ai-generation',
    cost: 'paid',
    priceNote: '$15/1M chars (~$0.015/1k chars)',
    quality: 'high',
    formats: ['mp3', 'opus', 'aac', 'flac'],
    languages: ['pt-BR', 'en', 'es', '+57 idiomas'],
    envKeys: ['OPENAI_API_KEY'],
    description: 'Vozes naturais (alloy, echo, fable, onyx, nova, shimmer). Mesma key da DALL-E.',
  },
  'local-piper': {
    name: 'Piper (Local)',
    type: 'tts',
    subtype: 'local',
    cost: 'free',
    priceNote: 'Gratuito, roda offline',
    quality: 'good',
    formats: ['wav'],
    languages: ['pt-BR', 'en', 'es', '+20 idiomas'],
    envKeys: [],
    description: 'TTS local via Piper. Sem custo, sem internet. Qualidade boa para narração simples.',
  },
};

// ── Helper Functions ────────────────────────────────────────────────────────

function isProviderAvailable(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return false;
  if (provider.envKeys.length === 0) return true;
  return provider.envKeys.every(key => {
    const val = getEnv(key);
    return val && val.length > 0 && !val.startsWith('YOUR_');
  });
}

function getAvailableProviders(type) {
  return Object.entries(PROVIDERS)
    .filter(([, p]) => (!type || p.type === type))
    .map(([id, p]) => ({
      id,
      ...p,
      available: isProviderAvailable(id),
    }));
}

function getBestProvider(type, preferFree = false) {
  const available = getAvailableProviders(type).filter(p => p.available);
  if (available.length === 0) return null;
  if (preferFree) {
    const free = available.find(p => p.cost === 'free');
    if (free) return free;
  }
  // Prefer AI generation over stock
  const aiGen = available.find(p => p.subtype === 'ai-generation');
  if (aiGen) return aiGen;
  return available[0];
}

function printStatus() {
  const types = ['image', 'sfx', 'music', 'tts'];
  for (const type of types) {
    const providers = getAvailableProviders(type);
    console.log(`\n── ${type.toUpperCase()} ──`);
    for (const p of providers) {
      const status = p.available ? '✅' : '❌';
      const missing = p.available ? '' : ` (falta: ${p.envKeys.join(', ')})`;
      console.log(`  ${status} ${p.name} [${p.cost}] — ${p.description}${missing}`);
    }
  }
}

module.exports = {
  PROVIDERS,
  getEnvVar: getEnv,
  isProviderAvailable,
  getAvailableProviders,
  getBestProvider,
  printStatus,
};
