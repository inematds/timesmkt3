const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { writeImageApproval, writeVideoApproval, formatStoryboardMessage } = require('../telegram/approval-utils');

test('writeImageApproval and writeVideoApproval create approval files', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-approval-'));
  const outputDir = 'prj/demo/outputs/c0001-demo';
  const imgDir = path.join(tmpRoot, outputDir, 'imgs');
  const videoDir = path.join(tmpRoot, outputDir, 'video');

  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(videoDir, { recursive: true });
  fs.writeFileSync(path.join(imgDir, 'approval_needed.json'), JSON.stringify({ needed: true }));
  fs.writeFileSync(path.join(videoDir, 'approval_needed.json'), JSON.stringify({ needed: true }));
  fs.writeFileSync(path.join(videoDir, 'timed_out.json'), JSON.stringify({ timed_out: true }));

  writeImageApproval(tmpRoot, outputDir, true, 'ok');
  writeVideoApproval(tmpRoot, outputDir, false, 'adjust');

  const imgApproval = JSON.parse(fs.readFileSync(path.join(imgDir, 'approved.json'), 'utf-8'));
  const videoApproval = JSON.parse(fs.readFileSync(path.join(videoDir, 'rejected.json'), 'utf-8'));

  assert.equal(imgApproval.approved, true);
  assert.equal(imgApproval.feedback, 'ok');
  assert.equal(videoApproval.approved, false);
  assert.equal(videoApproval.feedback, 'adjust');
  assert.equal(fs.existsSync(path.join(imgDir, 'approval_needed.json')), false);
  assert.equal(fs.existsSync(path.join(videoDir, 'approval_needed.json')), false);
  assert.equal(fs.existsSync(path.join(videoDir, 'timed_out.json')), false);
});

test('formatStoryboardMessage returns null when no scene plans exist', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-storyboard-'));
  const msg = formatStoryboardMessage(tmpRoot, 'prj/demo/outputs/c0001-demo', (s) => s);
  assert.equal(msg, null);
});
