#!/usr/bin/env node

/**
 * search-music-freesound.js
 *
 * Searches Freesound.org for background music and downloads the preview MP3.
 * Uses the free Freesound API (requires FREESOUND_API_KEY in .env).
 *
 * Usage:
 *   node pipeline/search-music-freesound.js <output_dir> "<query>" [mood] [min_duration] [max_duration]
 *
 * Examples:
 *   node pipeline/search-music-freesound.js prj/inema/outputs/c0029/audio "tech ambient" upbeat 30 120
 *   node pipeline/search-music-freesound.js prj/inema/outputs/c0029/audio "corporate background"
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.FREESOUND_API_KEY;
const BASE_URL = 'https://freesound.org/apiv2';

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        } else {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // Follow redirect
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function searchMusic(query, mood = '', minDuration = 15, maxDuration = 180) {
  if (!API_KEY) {
    console.error('FREESOUND_API_KEY not set in .env');
    return null;
  }

  // Build search query with mood tags
  let searchQuery = query;
  const tags = ['music'];
  if (mood) tags.push(mood);

  const filter = `tag:${tags.join(' tag:')} duration:[${minDuration} TO ${maxDuration}]`;
  const params = new URLSearchParams({
    query: searchQuery,
    filter,
    sort: 'rating_desc',
    fields: 'id,name,duration,tags,previews,license,username,avg_rating',
    page_size: '5',
    token: API_KEY,
  });

  const url = `${BASE_URL}/search/text/?${params}`;
  console.log(`Searching Freesound: "${searchQuery}" (${mood || 'any mood'}, ${minDuration}-${maxDuration}s)`);

  try {
    const data = JSON.parse(await httpsGet(url));

    if (!data.results || data.results.length === 0) {
      console.log('No results found.');
      return null;
    }

    console.log(`Found ${data.count} results, showing top ${data.results.length}:`);
    for (const r of data.results) {
      console.log(`  #${r.id} "${r.name}" (${r.duration.toFixed(1)}s, rating ${r.avg_rating.toFixed(1)}) by ${r.username}`);
    }

    // Return best match
    return data.results[0];
  } catch (err) {
    console.error(`Freesound search failed: ${err.message}`);
    return null;
  }
}

async function downloadPreview(sound, outputDir) {
  const previewUrl = sound.previews?.['preview-hq-mp3'] || sound.previews?.['preview-lq-mp3'];
  if (!previewUrl) {
    console.error('No preview URL available');
    return null;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const safeName = sound.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
  const filename = `freesound_${sound.id}_${safeName}.mp3`;
  const outputPath = path.join(outputDir, filename);

  if (fs.existsSync(outputPath)) {
    console.log(`Already downloaded: ${filename}`);
    return outputPath;
  }

  console.log(`Downloading preview: ${previewUrl}`);
  await downloadFile(previewUrl, outputPath);
  console.log(`Saved: ${outputPath}`);
  return outputPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main() {
  const [,, outputDir, query, mood, minDur, maxDur] = process.argv;

  if (!outputDir || !query) {
    console.error('Usage: node pipeline/search-music-freesound.js <output_dir> "<query>" [mood] [min_duration] [max_duration]');
    process.exit(1);
  }

  const sound = await searchMusic(query, mood || '', Number(minDur) || 15, Number(maxDur) || 180);
  if (!sound) {
    console.log('No music found. Video will be rendered without background music.');
    process.exit(0);
  }

  const filePath = await downloadPreview(sound, outputDir);
  if (filePath) {
    // Output the path for the caller to use
    console.log(`[MUSIC_READY] ${filePath}`);
  }
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});

module.exports = { searchMusic, downloadPreview };
