const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read credentials from .env manually
const envData = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = envData.match(/SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envData.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

const TASK_NAME = 'dia_das_maes';
const TASK_DATE = '2026-05-10';
const BUCKET = 'campaign-uploads';

const files = [
  // Carousel slides
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/carousel_01.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/carousel_02.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/carousel_03.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/carousel_04.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/carousel_05.png', contentType: 'image/png' },
  // Stories
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/story_01.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/story_02.png', contentType: 'image/png' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/ads/story_03.png', contentType: 'image/png' },
  // Videos
  { localPath: 'outputs/dia_das_maes_2026-05-10/video/ad_01.mp4', contentType: 'video/mp4' },
  { localPath: 'outputs/dia_das_maes_2026-05-10/video/ad_02.mp4', contentType: 'video/mp4' },
].map(f => ({
  ...f,
  uploadName: `${TASK_NAME}_${TASK_DATE}_${path.basename(f.localPath)}`,
}));

async function uploadFiles() {
  const urlMap = {};

  for (const file of files) {
    const absolutePath = path.resolve(__dirname, file.localPath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`File not found: ${absolutePath}`);
      continue;
    }

    const fileBuffer = fs.readFileSync(absolutePath);
    console.log(`Uploading ${file.uploadName} (${(fileBuffer.length / 1024).toFixed(1)} KB)...`);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .upload(file.uploadName, fileBuffer, {
        contentType: file.contentType,
        upsert: true,
      });

    if (error) {
      console.error(`Upload failed for ${file.uploadName}:`, error.message);
      continue;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(file.uploadName);

    urlMap[file.uploadName] = publicUrl;
    console.log(`  ✓ ${publicUrl}`);
  }

  const outputPath = path.resolve(__dirname, 'outputs/dia_das_maes_2026-05-10/media_urls.json');
  fs.writeFileSync(outputPath, JSON.stringify(urlMap, null, 2));
  console.log(`\nMedia URL map saved to: ${outputPath}`);

  return urlMap;
}

uploadFiles().then(urlMap => {
  console.log('\nFinal URL map:');
  console.log(JSON.stringify(urlMap, null, 2));
}).catch(console.error);
