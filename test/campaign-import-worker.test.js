const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { normalizeTargets, parseManifest, shouldPrepareAdsForQuickVideo } = require('../scripts/campaign-import-worker');

test('normalizeTargets expands combined aliases', () => {
  assert.deepEqual(normalizeTargets('both'), ['video_quick', 'video_pro']);
  assert.deepEqual(normalizeTargets(['ads', 'quick', 'pro']), ['ads', 'video_quick', 'video_pro']);
  assert.deepEqual(normalizeTargets('quickj'), ['video_quick']);
});

test('shouldPrepareAdsForQuickVideo only forces ad designer for solid quick videos', () => {
  assert.equal(shouldPrepareAdsForQuickVideo({ targets: ['video_quick'], image_source: 'solid' }), true);
  assert.equal(shouldPrepareAdsForQuickVideo({ targets: ['video_quick'], image_source: 'brand' }), false);
  assert.equal(shouldPrepareAdsForQuickVideo({ targets: ['video_pro'], image_source: 'solid' }), false);
  assert.equal(shouldPrepareAdsForQuickVideo({ targets: ['ads'], image_source: 'solid' }), false);
});

test('parseManifest resolves defaults, solid background and output root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-import-'));
  const repoRoot = process.cwd();
  const batchDir = path.join(repoRoot, 'imports', `test-batch-${path.basename(root)}`);
  const projectDir = path.join(repoRoot, 'prj', `test-import-${path.basename(root)}`, 'outputs', 'c0001-demo', 'creative');

  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, 'creative_brief.json'), '{}');
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, 'manifest.json'), JSON.stringify({
    titulo: 'Batch demo',
    project_dir: `prj/test-import-${path.basename(root)}`,
    defaults: {
      targets: ['video_quick'],
      image_source: 'solid',
      quick_mode: 'enxuto',
    },
    campaigns: [
      {
        campaign_id: 'c0001-demo',
        image_background_color: '#112233',
      },
    ],
  }, null, 2));

  const manifest = parseManifest(batchDir);
  assert.equal(manifest.titulo, 'Batch demo');
  assert.equal(manifest.project_dir, `prj/test-import-${path.basename(root)}`);
  assert.equal(manifest.campaigns[0].targets[0], 'video_quick');
  assert.equal(manifest.campaigns[0].image_source, 'solid');
  assert.equal(manifest.campaigns[0].image_background_color, '#112233');
  assert.equal(manifest.campaigns[0].quick_mode, 'enxuto');
  assert.match(manifest.output_root, /outputs\/imports\/test-batch-/);

  fs.rmSync(path.join(repoRoot, 'prj', `test-import-${path.basename(root)}`), { recursive: true, force: true });
  fs.rmSync(batchDir, { recursive: true, force: true });
});
