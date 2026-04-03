const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createWorkerVideoHandlers } = require('../pipeline/worker-video');
const { createWorkerVideoProHandler } = require('../pipeline/worker-video-pro');
const { createAdCreativeHandler } = require('../pipeline/worker-ad-creative');
const { createPlatformHandlers } = require('../pipeline/worker-platforms');

function makeProjectRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-pipeline-'));
}

function baseDeps(projectRoot) {
  return {
    projectRoot,
    imageProviderName: 'mock-provider',
    defaultModel: 'mock-model',
    log: () => {},
    runClaude: async () => {},
    waitForFile: async () => false,
    resolveImageSource: (source, folder) => ({ source, folder }),
    getFreeImageProvider: () => null,
    getFolderAssets: () => [],
    getImageDimensions: () => null,
    getProjectAssets: () => [],
    formatAssetList: () => '(sem assets)',
    getImageProvider: () => ({ generateImage: async () => {} }),
    readBrandContext: () => null,
    videoTimestamp: () => '20260402T120000',
    backupIfExists: () => {},
  };
}

test('worker video handlers expose expected entry points and motion director skips without plans', async () => {
  const handlers = createWorkerVideoHandlers(baseDeps(makeProjectRoot()));

  assert.equal(typeof handlers.handleVideoQuick, 'function');
  assert.equal(typeof handlers.handleVideoAdSpecialist, 'function');
  assert.equal(typeof handlers.handleMotionDirector, 'function');

  const result = await handlers.handleMotionDirector('prj/demo/outputs/campanha', 'prj/demo', 1);
  assert.equal(result, undefined);
});

test('worker video pro skips when final render already exists and skip_completed is enabled', async () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha';
  const absVideoDir = path.join(projectRoot, outputDir, 'video');
  fs.mkdirSync(absVideoDir, { recursive: true });
  fs.writeFileSync(path.join(absVideoDir, 'campanha_pro_01_existing.mp4'), 'stub');

  const handleVideoPro = createWorkerVideoProHandler({
    ...baseDeps(projectRoot),
    renderFfmpeg: 'pipeline/render-video-ffmpeg.js',
    renderRemotion: 'pipeline/render-video-remotion.js',
    getVideoRenderer: () => 'pipeline/render-video-remotion.js',
  });

  const result = await handleVideoPro({
    data: {
      task_name: 'campanha',
      output_dir: outputDir,
      project_dir: 'prj/demo',
      skip_completed: true,
    },
  });

  assert.deepEqual(result, { status: 'skipped', reason: 'already completed' });
});

test('ad creative handler completes in CSS-only mode with mocked Claude run', async () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha';
  let called = false;

  const handleAdCreativeDesigner = createAdCreativeHandler({
    ...baseDeps(projectRoot),
    buildImagePrompt: () => 'prompt',
    runClaude: async (_prompt, agent, output) => {
      called = true;
      assert.equal(agent, 'ad_creative_designer');
      assert.equal(output, outputDir);
    },
  });

  const result = await handleAdCreativeDesigner({
    data: {
      task_name: 'campanha',
      task_date: '2026-04-02',
      output_dir: outputDir,
      project_dir: 'prj/demo',
      platform_targets: ['instagram'],
      image_source: 'folder',
      image_count: 1,
      image_formats: ['carousel_1080x1080'],
    },
  });

  assert.equal(called, true);
  assert.deepEqual(result, { status: 'complete', output: `${outputDir}/ads/` });
});

test('platform handlers generate distribution and instagram outputs with mocked Claude run', async () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha';
  const calledAgents = [];

  const handlers = createPlatformHandlers({
    projectRoot,
    runClaude: async (_prompt, agent) => {
      calledAgents.push(agent);
    },
  });

  const distribution = await handlers.handleDistributionAgent({
    data: {
      task_name: 'campanha',
      task_date: '2026-04-02',
      output_dir: outputDir,
      project_dir: 'prj/demo',
      platform_targets: ['instagram'],
    },
  });
  const instagram = await handlers.handlePlatformInstagram({
    data: {
      task_name: 'campanha',
      task_date: '2026-04-02',
      output_dir: outputDir,
      project_dir: 'prj/demo',
    },
  });

  assert.deepEqual(calledAgents, ['distribution_agent', 'platform_instagram']);
  assert.deepEqual(distribution, { status: 'complete', output: `${outputDir}/Publish campanha 2026-04-02.md` });
  assert.deepEqual(instagram, { status: 'complete', output: `${outputDir}/platforms/instagram.json` });
});
