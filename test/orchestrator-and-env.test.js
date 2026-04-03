const test = require('node:test');
const assert = require('node:assert/strict');

const { getEnv, getList } = require('../config/env');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  validatePayload,
  validateAgentGraph,
  ensureSkippedResearchArtifacts,
  ensureSkippedImageArtifacts,
  ensureSkippedVideoArtifacts,
} = require('../pipeline/orchestrator');

test('validateAgentGraph passes for the current agent graph', () => {
  assert.deepEqual(validateAgentGraph(), []);
});

test('validateAgentGraph reports unknown dependencies', () => {
  const errors = validateAgentGraph([
    { name: 'alpha', dependencies: [] },
    { name: 'beta', dependencies: ['missing_agent'] },
  ]);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /missing_agent/);
});

test('validatePayload reports required fields', () => {
  const errors = validatePayload({});

  assert.ok(errors.some(err => err.includes('task_name')));
  assert.ok(errors.some(err => err.includes('task_date')));
  assert.ok(errors.some(err => err.includes('platform_targets')));
  assert.ok(errors.some(err => err.includes('project_dir')));
});

test('env helpers read process env and parse comma-separated lists', () => {
  process.env.CODEX_TEST_SINGLE = 'value-123';
  process.env.CODEX_TEST_LIST = 'one, two , ,three';

  assert.equal(getEnv('CODEX_TEST_SINGLE'), 'value-123');
  assert.deepEqual(getList('CODEX_TEST_LIST'), ['one', 'two', 'three']);

  delete process.env.CODEX_TEST_SINGLE;
  delete process.env.CODEX_TEST_LIST;
});

test('ensureSkippedResearchArtifacts creates simulated stage1 inputs', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-skip-research-'));
  const sourceFolder = path.join(projectRoot, 'prj', 'demo', 'assets', 'campanha_demo');
  fs.mkdirSync(sourceFolder, { recursive: true });
  fs.writeFileSync(path.join(sourceFolder, 'hero.jpg'), 'x');

  const result = ensureSkippedResearchArtifacts({
    task_name: 'campanha_demo',
    task_date: '2026-04-03',
    project_dir: 'prj/demo',
    output_dir: 'prj/demo/outputs/campanha_demo',
    platform_targets: ['instagram'],
    campaign_brief: 'Campanha de teste com fallback',
    skip_research: true,
  }, { projectRoot });

  assert.ok(result.created.includes('research_results.json'));
  assert.ok(result.created.includes(path.join('creative', 'creative_brief.json')));

  const research = JSON.parse(fs.readFileSync(path.join(projectRoot, 'prj', 'demo', 'outputs', 'campanha_demo', 'research_results.json'), 'utf-8'));
  const creative = JSON.parse(fs.readFileSync(path.join(projectRoot, 'prj', 'demo', 'outputs', 'campanha_demo', 'creative', 'creative_brief.json'), 'utf-8'));

  assert.equal(research.simulated, true);
  assert.equal(creative.simulated, true);
  assert.ok(Array.isArray(research.ad_hooks));
  assert.ok(Array.isArray(creative.approved_ctas));
});

test('ensureSkippedImageArtifacts and ensureSkippedVideoArtifacts create simulated stage outputs', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-skip-stages-'));

  const imageResult = ensureSkippedImageArtifacts({
    task_name: 'campanha_demo',
    project_dir: 'prj/demo',
    output_dir: 'prj/demo/outputs/campanha_demo',
    skip_image: true,
  }, { projectRoot });

  const videoResult = ensureSkippedVideoArtifacts({
    task_name: 'campanha_demo',
    project_dir: 'prj/demo',
    output_dir: 'prj/demo/outputs/campanha_demo',
    skip_video: true,
  }, { projectRoot });

  assert.ok(imageResult.created.includes(path.join('ads', 'layout.json')));
  assert.ok(videoResult.created.includes(path.join('video', 'skip_video.json')));

  const layout = JSON.parse(fs.readFileSync(path.join(projectRoot, 'prj', 'demo', 'outputs', 'campanha_demo', 'ads', 'layout.json'), 'utf-8'));
  const video = JSON.parse(fs.readFileSync(path.join(projectRoot, 'prj', 'demo', 'outputs', 'campanha_demo', 'video', 'skip_video.json'), 'utf-8'));

  assert.equal(layout.simulated, true);
  assert.equal(video.simulated, true);
});
