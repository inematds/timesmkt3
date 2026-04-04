const test = require('node:test');
const assert = require('node:assert/strict');

const { createWorkerAssetHelpers } = require('../pipeline/worker-assets');

test('worker asset helpers normalize aliases and provider preference', () => {
  const helpers = createWorkerAssetHelpers({
    projectRoot: process.cwd(),
    freeImageProviderEnv: 'pexels',
    env: {
      PEXELS_API_KEY: 'pexels-key',
      UNSPLASH_ACCESS_KEY: '',
      PIXABAY_API_KEY: 'pixabay-key',
    },
  });

  assert.deepEqual(helpers.resolveImageSource('marca'), { source: 'brand', folder: null, color: null });
  assert.deepEqual(helpers.resolveImageSource('pasta', 'tmp/assets'), { source: 'folder', folder: 'tmp/assets', color: null });
  assert.deepEqual(helpers.resolveImageSource('solido'), { source: 'solid', folder: null, color: '#0D0D0D' });
  assert.deepEqual(helpers.resolveImageSource('solido ff6600'), { source: 'solid', folder: null, color: '#ff6600' });
  assert.equal(helpers.getFreeImageProvider().id, 'pexels');
});

test('worker asset helpers detect banner heuristics', () => {
  const helpers = createWorkerAssetHelpers({ projectRoot: process.cwd() });

  assert.equal(helpers.detectImageType('/tmp/banners/header.png', { ratio: '1.00' }), 'banner');
  assert.equal(helpers.detectImageType('/tmp/hero-banner.png', { ratio: '1.20' }), 'banner');
  assert.equal(helpers.detectImageType('/tmp/photo.jpg', { ratio: '1.40' }), 'raw');
  assert.equal(helpers.detectImageType('/tmp/wide.jpg', { ratio: '3.10' }), 'banner');
});
