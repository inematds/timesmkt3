const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveStageAlias, buildPayload, buildConfigTable } = require('../telegram/campaign-utils');

test('resolveStageAlias maps known aliases', () => {
  assert.equal(resolveStageAlias('brief'), 1);
  assert.equal(resolveStageAlias('imagem'), 2);
  assert.equal(resolveStageAlias('pro'), 3);
  assert.equal(resolveStageAlias('instagram'), 4);
  assert.equal(resolveStageAlias('publish'), 5);
  assert.equal(resolveStageAlias('xpto'), null);
});

test('buildPayload uses sane defaults', () => {
  const payload = buildPayload('Pascoa 2026', {}, 'prj/inema', '2026-04-02', {
    KIE_DEFAULT_MODEL: 'z-image-turbo',
    IMAGE_PROVIDER: 'kie',
  });

  assert.equal(payload.task_name, 'pascoa_2026');
  assert.equal(payload.image_model, 'z-image-turbo');
  assert.equal(payload.video_mode, 'quick');
  assert.deepEqual(payload.platform_targets, ['instagram', 'youtube', 'threads', 'facebook', 'tiktok', 'linkedin']);
  assert.deepEqual(payload.approval_modes, {
    stage1: 'auto',
    stage2: 'auto',
    stage3: 'auto',
    stage4: 'auto',
    stage5: 'auto',
  });
});

test('buildConfigTable includes skip flags when enabled', () => {
  const lines = buildConfigTable({
    task_name: 'c0001-demo',
    project_dir: 'prj/inema',
    platform_targets: ['instagram'],
    image_source: 'brand',
    image_model: 'z-image',
    approval_modes: { stage1: 'humano', stage2: 'humano' },
    skip_research: true,
    skip_video: true,
  }, 'Teste');

  const text = lines.join('\n');
  assert.match(text, /Pular:/);
  assert.match(text, /pesquisa/);
  assert.match(text, /video/);
});
