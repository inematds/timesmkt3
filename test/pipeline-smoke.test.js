const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createWorkerVideoHandlers, attachExistingQuickNarration, ensureQuickNarration } = require('../pipeline/worker-video');
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

test('attachExistingQuickNarration reuses prior quick narration when plan has null audio', () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha-quick';
  const videoDir = path.join(projectRoot, outputDir, 'video');
  const audioDir = path.join(projectRoot, outputDir, 'audio');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const planPath = path.join(videoDir, 'campanha-quick_video_01_scene_plan.json');
  fs.writeFileSync(planPath, JSON.stringify({
    titulo: 'Teste',
    narration_file: null,
    scenes: [{ id: 'hook', duration: 3, image: '/tmp/a.png', text_overlay: 'Teste' }],
  }, null, 2));
  fs.writeFileSync(path.join(audioDir, 'campanha-quick_quick_01_narration.mp3'), 'audio');

  const reused = attachExistingQuickNarration(projectRoot, outputDir, 'campanha-quick', '01');
  const updated = JSON.parse(fs.readFileSync(planPath, 'utf-8'));

  assert.equal(reused, true);
  assert.equal(updated.narration_file, `${outputDir}/audio/campanha-quick_quick_01_narration.mp3`);
});

test('ensureQuickNarration generates narration from scene text when quick plan has no audio file', () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha-quick';
  const videoDir = path.join(projectRoot, outputDir, 'video');
  fs.mkdirSync(videoDir, { recursive: true });

  const planPath = path.join(videoDir, 'campanha-quick_video_01_scene_plan.json');
  fs.writeFileSync(planPath, JSON.stringify({
    titulo: 'Teste',
    narration_file: null,
    scenes: [
      { id: 'hook', duration: 3, narration: 'Primeira frase.' },
      { id: 'cta', duration: 3, narration: 'Segunda frase.' },
    ],
  }, null, 2));

  process.env.ELEVENLABS_API_KEY = 'test-key';
  const fakeExec = (cmd, args) => {
    assert.equal(cmd, 'node');
    assert.match(args[0], /pipeline\/generate-audio\.js$/);
    assert.equal(args[2], 'Primeira frase. Segunda frase.');
    fs.mkdirSync(path.dirname(args[1]), { recursive: true });
    fs.writeFileSync(args[1], 'audio');
    return Buffer.from('ok');
  };

  try {
    const result = ensureQuickNarration({
      projectRoot,
      output_dir: outputDir,
      task_name: 'campanha-quick',
      idx: '01',
      narrator: 'rachel',
      log: () => {},
      execFile: fakeExec,
    });

    const updated = JSON.parse(fs.readFileSync(planPath, 'utf-8'));
    assert.equal(result.ok, true);
    assert.equal(result.reason, 'generated_from_scene_narration');
    assert.equal(updated.narration_file, `${outputDir}/audio/campanha-quick_quick_01_narration.mp3`);
    assert.ok(fs.existsSync(path.join(projectRoot, updated.narration_file)));
  } finally {
    delete process.env.ELEVENLABS_API_KEY;
  }
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

test('worker video pro falls back to project assets when scene images are missing', async () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha';
  const projectDir = 'prj/demo';
  const videoDir = path.join(projectRoot, outputDir, 'video');
  const assetDir = path.join(projectRoot, projectDir, 'assets');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(assetDir, { recursive: true });

  const fallbackImage = path.join(assetDir, 'fallback.png');
  fs.writeFileSync(fallbackImage, 'image');

  const rendererPath = path.join(projectRoot, 'mock-renderer.js');
  fs.writeFileSync(rendererPath, [
    "const fs = require('fs');",
    "const path = require('path');",
    "const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));",
    "const output = process.argv[3];",
    "fs.mkdirSync(path.dirname(output), { recursive: true });",
    "fs.writeFileSync(output, JSON.stringify({ image: plan.scenes[0].image }));",
  ].join('\n'));

  const handleVideoPro = createWorkerVideoProHandler({
    ...baseDeps(projectRoot),
    renderFfmpeg: rendererPath,
    renderRemotion: rendererPath,
    getVideoRenderer: () => rendererPath,
    runClaude: async () => {
      fs.writeFileSync(path.join(videoDir, 'campanha_video_01_scene_plan_motion.json'), JSON.stringify({
        titulo: 'Teste',
        video_length: 6,
        format: '9:16',
        width: 1080,
        height: 1920,
        narration_file: null,
        music: null,
        scenes: [
          {
            id: 'scene_01',
            type: 'hook',
            duration: 3,
            image: path.join(videoDir, 'frames', 'missing.png'),
            image_has_text: false,
            text_overlay: 'Teste',
            text_layout: { font_size: 96, font_weight: 900, font_family: 'Lora', position: 'top', color: '#FFFFFF', line_height: 1 },
            motion: { type: 'push-in' },
          },
          {
            id: 'scene_02',
            type: 'cta',
            duration: 3,
            image: path.join(videoDir, 'frames', 'missing-2.png'),
            image_has_text: false,
            text_overlay: 'CTA',
            text_layout: { font_size: 96, font_weight: 900, font_family: 'Lora', position: 'top', color: '#FFFFFF', line_height: 1 },
            motion: { type: 'drift' },
          },
        ],
      }, null, 2));
    },
    waitForFile: async () => true,
    getImageDimensions: () => ({ width: 1080, height: 1920, orientation: 'portrait', ratio: '0.56' }),
    getProjectAssets: () => [{ path: fallbackImage, imageType: 'raw', width: 1080, height: 1920, orientation: 'portrait', ratio: '0.56' }],
  });

  const result = await handleVideoPro({
    token: 'job-token',
    extendLock: async () => {},
    data: {
      task_name: 'campanha',
      task_date: '2026-04-02',
      output_dir: outputDir,
      project_dir: projectDir,
      platform_targets: ['instagram'],
      video_count: 1,
      image_source: 'brand',
    },
  });

  const plan = JSON.parse(fs.readFileSync(path.join(videoDir, 'campanha_video_01_scene_plan_motion.json'), 'utf-8'));
  assert.equal(plan.scenes[0].image, fallbackImage);
  assert.equal(plan.scenes[1].image, fallbackImage);
  assert.deepEqual(result, { status: 'complete', output: `${outputDir}/video/` });
});

test('worker video pro falls back when photography director times out', async () => {
  const projectRoot = makeProjectRoot();
  const outputDir = 'prj/demo/outputs/campanha-timeout';
  const projectDir = 'prj/demo';
  const videoDir = path.join(projectRoot, outputDir, 'video');
  const audioDir = path.join(projectRoot, outputDir, 'audio');
  const assetDir = path.join(projectRoot, projectDir, 'assets');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(assetDir, { recursive: true });

  const fallbackImage = path.join(assetDir, 'fallback-timeout.png');
  fs.writeFileSync(fallbackImage, 'image');
  fs.writeFileSync(path.join(audioDir, 'campanha-timeout_video_01_narration.mp3'), 'audio');

  const rendererPath = path.join(projectRoot, 'mock-renderer-timeout.js');
  fs.writeFileSync(rendererPath, [
    "const fs = require('fs');",
    "const path = require('path');",
    "const output = process.argv[3];",
    "fs.mkdirSync(path.dirname(output), { recursive: true });",
    "fs.writeFileSync(output, 'video');",
  ].join('\n'));

  let runCount = 0;
  const handleVideoPro = createWorkerVideoProHandler({
    ...baseDeps(projectRoot),
    renderFfmpeg: rendererPath,
    renderRemotion: rendererPath,
    getVideoRenderer: () => rendererPath,
    runClaude: async () => {
      runCount += 1;
      if (runCount === 1) {
        throw new Error('Claude CLI timed out for video_pro after 300000ms');
      }
      fs.writeFileSync(path.join(videoDir, 'campanha-timeout_video_01_scene_plan_motion.json'), JSON.stringify({
        titulo: 'Fallback',
        video_length: 63,
        format: '9:16',
        width: 1080,
        height: 1920,
        narration_file: path.join(outputDir, 'audio', 'campanha-timeout_video_01_narration.mp3'),
        music: null,
        scenes: [
          {
            id: 'scene_01',
            type: 'hook',
            duration: 60,
            image: path.join(videoDir, 'missing-frame.png'),
            image_has_text: false,
            text_overlay: 'Teste',
            text_layout: { font_size: 96, font_weight: 900, font_family: 'Lora', position: 'top', color: '#FFFFFF', line_height: 1 },
            motion: { type: 'push-in' },
          },
          {
            id: 'scene_02',
            type: 'cta',
            duration: 3,
            image: path.join(videoDir, 'missing-frame-2.png'),
            image_has_text: false,
            text_overlay: 'CTA',
            text_layout: { font_size: 96, font_weight: 900, font_family: 'Lora', position: 'top', color: '#FFFFFF', line_height: 1 },
            motion: { type: 'drift' },
          },
        ],
      }, null, 2));
    },
    waitForFile: async () => true,
    getImageDimensions: () => ({ width: 1080, height: 1920, orientation: 'portrait', ratio: '0.56' }),
    getProjectAssets: () => [{ path: fallbackImage, imageType: 'raw', width: 1080, height: 1920, orientation: 'portrait', ratio: '0.56' }],
  });

  const result = await handleVideoPro({
    token: 'job-token',
    extendLock: async () => {},
    data: {
      task_name: 'campanha-timeout',
      task_date: '2026-04-04',
      output_dir: outputDir,
      project_dir: projectDir,
      platform_targets: ['instagram'],
      video_count: 1,
      image_source: 'brand',
    },
  });

  const photoPlan = JSON.parse(fs.readFileSync(path.join(videoDir, 'photography_plan.json'), 'utf-8'));
  assert.ok(Array.isArray(photoPlan.shots));
  assert.equal(photoPlan.shots[0].image, fallbackImage);
  assert.deepEqual(result, { status: 'complete', output: `${outputDir}/video/` });
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
