const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function createWorkerAssetHelpers({ projectRoot, freeImageProviderEnv = 'pexels', env = process.env }) {
  const FREE_IMAGE_PROVIDER = (freeImageProviderEnv || 'pexels').toLowerCase();

  function resolveImageSource(imageSource, imageFolder) {
    const aliases = { marca: 'brand', pasta: 'folder', gratis: 'free', captura: 'screenshot', capturas: 'screenshot' };
    const source = aliases[imageSource] || imageSource || 'brand';
    return { source, folder: source === 'folder' ? imageFolder : null };
  }

  function getFreeImageProvider() {
    const preferred = FREE_IMAGE_PROVIDER;
    const providers = {
      pexels:   { key: env.PEXELS_API_KEY, name: 'Pexels', searchUrl: 'https://api.pexels.com/v1/search', authHeader: 'Authorization' },
      unsplash: { key: env.UNSPLASH_ACCESS_KEY, name: 'Unsplash', searchUrl: 'https://api.unsplash.com/search/photos', authHeader: 'Authorization' },
      pixabay:  { key: env.PIXABAY_API_KEY, name: 'Pixabay', searchUrl: 'https://pixabay.com/api/', authHeader: null },
    };

    if (providers[preferred] && providers[preferred].key) return { ...providers[preferred], id: preferred };

    for (const [id, provider] of Object.entries(providers)) {
      if (provider.key) return { ...provider, id };
    }

    return null;
  }

  function detectImageType(imagePath, dims) {
    const filename = path.basename(imagePath).toLowerCase();
    const dirParts = imagePath.replace(/\\/g, '/').split('/');
    if (dirParts.some(part => part.toLowerCase() === 'banners')) return 'banner';

    const bannerKeywords = ['banner', 'logo', 'promo', 'header', 'cover', 'overlay',
      'poster', 'flyer', 'ad_', '_ad.', 'anuncio', 'capa', 'topo'];
    if (bannerKeywords.some(keyword => filename.includes(keyword))) return 'banner';
    if (dims && Number(dims.ratio) > 2.5) return 'banner';
    return 'raw';
  }

  function getImageDimensions(imagePath) {
    try {
      const out = execFileSync('ffprobe', [
        '-v', 'quiet', '-print_format', 'json', '-show_streams', imagePath,
      ], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 });
      const info = JSON.parse(out.toString());
      const stream = info.streams && info.streams[0];
      if (stream && stream.width && stream.height) {
        const width = stream.width;
        const height = stream.height;
        const ratio = width / height;
        const orientation = ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square';
        return { width, height, orientation, ratio: ratio.toFixed(2) };
      }
    } catch {}
    return null;
  }

  function getFolderAssets(folderPath) {
    const absPath = path.isAbsolute(folderPath) ? folderPath : path.resolve(projectRoot, folderPath);
    if (!fs.existsSync(absPath)) return [];

    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm', '.avi'];
    const files = [];
    const entries = fs.readdirSync(absPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subEntries = fs.readdirSync(path.join(absPath, entry.name), { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isFile()) continue;
          const ext = path.extname(sub.name).toLowerCase();
          const fullPath = path.join(absPath, entry.name, sub.name);
          if (imageExts.includes(ext)) {
            const dims = getImageDimensions(fullPath);
            files.push({ path: fullPath, imageType: detectImageType(fullPath, dims), ...dims });
          } else if (videoExts.includes(ext)) {
            const dims = getImageDimensions(fullPath);
            files.push({ path: fullPath, imageType: 'clip', ...dims });
          }
        }
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const fullPath = path.join(absPath, entry.name);
      if (imageExts.includes(ext)) {
        const dims = getImageDimensions(fullPath);
        files.push({ path: fullPath, imageType: detectImageType(fullPath, dims), ...dims });
      } else if (videoExts.includes(ext)) {
        const dims = getImageDimensions(fullPath);
        files.push({ path: fullPath, imageType: 'clip', ...dims });
      }
    }

    return files;
  }

  function getProjectAssets(projectDir) {
    const imageExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const videoExts = ['.mp4', '.mov', '.webm', '.avi'];
    const files = [];

    const scanDir = (fullDir) => {
      if (!fs.existsSync(fullDir)) return;
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(path.join(fullDir, entry.name));
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        const absPath = path.join(fullDir, entry.name);
        if (imageExts.includes(ext)) {
          const dims = getImageDimensions(absPath);
          files.push({ path: absPath, imageType: detectImageType(absPath, dims), ...dims });
        } else if (videoExts.includes(ext)) {
          const dims = getImageDimensions(absPath);
          files.push({ path: absPath, imageType: 'clip', ...dims });
        }
      }
    };

    for (const dir of ['imgs', 'assets']) {
      scanDir(path.resolve(projectRoot, projectDir, dir));
    }

    return files;
  }

  function formatAssetList(assets) {
    if (!assets || assets.length === 0) return 'No brand assets found.';
    return assets.map(asset => {
      const dimInfo = asset.width
        ? `  [${asset.width}×${asset.height}, ${asset.orientation}, ratio ${asset.ratio}, ${asset.imageType || 'raw'}]`
        : `  [${asset.imageType || 'raw'}]`;
      let typeNote = '';
      if (asset.imageType === 'banner') typeNote = '  ⚠️ BANNER — do not crop, only resize/letterbox';
      else if (asset.imageType === 'clip') typeNote = '  🎬 VIDEO CLIP — use directly as video source, no Ken Burns';
      return `  - ${asset.path}${dimInfo}${typeNote}`;
    }).join('\n');
  }

  return {
    resolveImageSource,
    getFreeImageProvider,
    getFolderAssets,
    detectImageType,
    getImageDimensions,
    getProjectAssets,
    formatAssetList,
  };
}

module.exports = { createWorkerAssetHelpers };
