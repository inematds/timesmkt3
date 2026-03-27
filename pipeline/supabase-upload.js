#!/usr/bin/env node

/**
 * supabase-upload.js
 * Uploads campaign media files to the Supabase "campaign-uploads" bucket.
 * Usage: node pipeline/supabase-upload.js <project_dir> <task_name> <date> <file1> [file2] ...
 *
 * Reads credentials from .env (no dotenv dependency).
 * Outputs a media_urls.json in <project_dir>/outputs/<task_name>_<date>/
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- Read .env manually ---
const envPath = path.resolve(__dirname, '../.env');
const envData = fs.readFileSync(envPath, 'utf-8');
const supabaseUrl = envData.match(/SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envData.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

// --- MIME type map ---
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
  };
  return map[ext] || 'application/octet-stream';
}

async function uploadFiles(projectDir, taskName, date, filePaths) {
  const bucket = 'campaign-uploads';
  const outputDir = path.resolve(__dirname, '..', projectDir, `outputs/${taskName}_${date}`);
  const urlMap = {};

  for (const filePath of filePaths) {
    const originalFilename = path.basename(filePath);
    const uniqueFilename = `${taskName}_${date}_${originalFilename}`;
    const fileBuffer = fs.readFileSync(filePath);
    const contentType = getMimeType(originalFilename);

    console.log(`Uploading ${originalFilename} → ${uniqueFilename} ...`);

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(uniqueFilename, fileBuffer, { contentType, upsert: true });

    if (error) {
      console.error(`  ✗ Upload failed for ${originalFilename}:`, error.message);
      continue;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(uniqueFilename);

    urlMap[uniqueFilename] = publicUrl;
    console.log(`  ✓ ${uniqueFilename} → ${publicUrl}`);
  }

  const outPath = path.join(outputDir, 'media_urls.json');
  fs.writeFileSync(outPath, JSON.stringify(urlMap, null, 2));
  console.log(`\nSaved media_urls.json → ${outPath}`);
  return urlMap;
}

// --- CLI entry point ---
const [,, projectDir, taskName, date, ...files] = process.argv;

if (!projectDir || !taskName || !date || files.length === 0) {
  console.error('Usage: node pipeline/supabase-upload.js <project_dir> <task_name> <date> <file1> [file2] ...');
  process.exit(1);
}

uploadFiles(projectDir, taskName, date, files).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
