const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resumeInProgressCampaigns } = require('../telegram/bot-operations');

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-bot-ops-'));
}

function createSessionDouble() {
  const data = new Map();

  function get(chatId) {
    if (!data.has(chatId)) data.set(chatId, {});
    return data.get(chatId);
  }

  return {
    data,
    get,
    setProject(chatId, projectDir) {
      get(chatId).projectDir = projectDir;
    },
    setRunningTask(chatId, value) {
      get(chatId).runningTask = value;
    },
    setCampaignV3(chatId, value) {
      get(chatId).campaignV3 = value;
    },
    setCampaignV3Stage(chatId, value) {
      get(chatId).campaignV3Stage = value;
    },
  };
}

test('resumeInProgressCampaigns restores newest incomplete campaign state', async () => {
  const projectRoot = makeTempProject();
  const campDir = path.join(projectRoot, 'prj', 'inema', 'outputs', 'camp-01');
  fs.mkdirSync(path.join(campDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(campDir, 'campaign_payload.json'), JSON.stringify({
    task_date: '2026-04-02',
    platform_targets: ['instagram'],
    approval_modes: { stage1: 'humano' },
  }));
  fs.writeFileSync(path.join(campDir, 'chat_context.json'), JSON.stringify({ chatId: '123' }));
  fs.writeFileSync(path.join(campDir, 'logs', 'research_agent.log'), 'Completed successfully\n');
  fs.writeFileSync(path.join(campDir, 'logs', 'creative_director.log'), 'Completed successfully\n');
  fs.writeFileSync(path.join(campDir, 'logs', 'copywriter_agent.log'), 'Completed successfully\n');

  const session = createSessionDouble();
  const monitoredSignals = new Set();

  await resumeInProgressCampaigns({
    projectRoot,
    session,
    readChatContext: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'chat_context.json'), 'utf-8')),
  }, monitoredSignals);

  const restored = session.get('123');
  assert.equal(restored.projectDir, 'prj/inema');
  assert.equal(restored.runningTask.taskName, 'camp-01');
  assert.equal(restored.runningTask.outputDir, 'prj/inema/outputs/camp-01');
  assert.equal(restored.campaignV3Stage, 1);
  assert.ok(monitoredSignals.has('stage_done:prj/inema/outputs/camp-01:1'));
});
