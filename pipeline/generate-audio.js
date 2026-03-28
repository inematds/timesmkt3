/**
 * ElevenLabs TTS Audio Generator
 *
 * Generates narration audio from a script using the ElevenLabs API.
 *
 * Usage:
 *   node pipeline/generate-audio.js <output_mp3> <text> [voice_id]
 *
 * Available voices (pt-BR recommended):
 *   Rachel  — warm, emotional female  — 21m00Tcm4TlvDq8ikWAM
 *   Bella   — friendly, clear female — EXAVITQu4vr4xnSDxMaL
 *   Antoni  — professional male      — ErXwobaYiN019PkySvjV
 *
 * Defaults to Rachel if no voice_id is specified.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

const VOICES = {
  rachel: '21m00Tcm4TlvDq8ikWAM',
  bella: 'EXAVITQu4vr4xnSDxMaL',
  antoni: 'ErXwobaYiN019PkySvjV',
};

async function generateAudio(outputPath, text, voiceIdOrName = DEFAULT_VOICE) {
  if (!API_KEY) {
    throw new Error('ELEVENLABS_API_KEY not set in .env');
  }

  const voiceId = VOICES[voiceIdOrName?.toLowerCase()] || voiceIdOrName || DEFAULT_VOICE;

  const body = JSON.stringify({
    text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.8,
      style: 0.3,
      use_speaker_boost: true,
    },
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', d => { errData += d; });
        res.on('end', () => reject(new Error(`ElevenLabs API error ${res.statusCode}: ${errData}`)));
        return;
      }

      const out = fs.createWriteStream(outputPath);
      res.pipe(out);
      out.on('finish', () => resolve(outputPath));
      out.on('error', reject);
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// CLI mode
if (require.main === module) {
  const [,, outputPath, text, voiceId] = process.argv;
  if (!outputPath || !text) {
    console.error('Usage: node pipeline/generate-audio.js <output.mp3> <text> [voice_id_or_name]');
    process.exit(1);
  }
  generateAudio(outputPath, text, voiceId)
    .then(p => { console.log(`✅ Audio saved: ${p}`); })
    .catch(e => { console.error(`❌ ${e.message}`); process.exit(1); });
}

module.exports = { generateAudio, VOICES };
