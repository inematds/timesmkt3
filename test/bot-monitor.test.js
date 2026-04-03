const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { startContinuousMonitor } = require('../telegram/bot-monitor');

test('startContinuousMonitor auto-approves pending video when stage3 mode is auto', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-monitor-'));
  const campDir = path.join(projectRoot, 'prj', 'inema', 'outputs', 'camp-01');
  fs.mkdirSync(path.join(campDir, 'video'), { recursive: true });
  fs.writeFileSync(path.join(campDir, 'chat_context.json'), JSON.stringify({ chatId: '321' }));
  fs.writeFileSync(path.join(campDir, 'video', 'approval_needed.json'), JSON.stringify({ needed: true }));

  const sessionState = {
    runningTask: { outputDir: 'prj/inema/outputs/camp-01' },
    campaignV3: {
      payload: { approval_modes: { stage3: 'auto' } },
      notifications: true,
    },
  };

  const originalSetInterval = global.setInterval;
  let cleared = false;
  global.setInterval = (fn) => {
    Promise.resolve().then(fn);
    return { fake: true };
  };

  const sentMessages = [];
  try {
    startContinuousMonitor({
      bot: {
        api: {
          sendMessage: async (chatId, text) => { sentMessages.push({ chatId, text }); },
          sendDocument: async () => {},
          sendVideo: async () => {},
        },
      },
      session: {
        get: () => sessionState,
        clearRunningTask: () => { cleared = true; },
        clearCampaignV3: () => { cleared = true; },
      },
      projectRoot,
      monitoredSignals: new Set(),
      readChatContext: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'chat_context.json'), 'utf-8')),
      writeImageApproval: () => {},
      writeVideoApproval: (root, outputDir, approved, feedback) => {
        const videoDir = path.join(root, outputDir, 'video');
        fs.mkdirSync(videoDir, { recursive: true });
        fs.writeFileSync(path.join(videoDir, approved ? 'approved.json' : 'rejected.json'), JSON.stringify({ feedback }));
      },
      sendImageApprovalRequest: async () => {},
      sendVideoApprovalRequest: async () => {},
      sendStageApprovalRequest: async () => {},
      enqueueStage: async () => {},
      stages: {},
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(fs.existsSync(path.join(campDir, 'video', 'approved.json')));
    assert.ok(sentMessages.some((entry) => entry.text.includes('Roteiro aprovado automaticamente')));
    assert.equal(cleared, false);
  } finally {
    global.setInterval = originalSetInterval;
  }
});

test('startContinuousMonitor advances stage1 when research is skipped and copywriter completed', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-monitor-skip-'));
  const campDir = path.join(projectRoot, 'prj', 'inema', 'outputs', 'camp-02');
  fs.mkdirSync(path.join(campDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(campDir, 'chat_context.json'), JSON.stringify({ chatId: '654' }));
  fs.writeFileSync(path.join(campDir, 'logs', 'copywriter_agent.log'), 'Completed successfully\n');

  const sessionState = {
    runningTask: { outputDir: 'prj/inema/outputs/camp-02' },
    campaignV3: {
      payload: {
        skip_research: true,
        approval_modes: { stage1: 'auto' },
      },
      notifications: true,
    },
  };

  const originalSetInterval = global.setInterval;
  const enqueued = [];
  global.setInterval = (fn) => {
    Promise.resolve().then(fn);
    return { fake: true };
  };

  try {
    startContinuousMonitor({
      bot: {
        api: {
          sendMessage: async () => {},
          sendDocument: async () => {},
          sendVideo: async () => {},
        },
      },
      session: {
        get: () => sessionState,
        clearRunningTask: () => {},
        clearCampaignV3: () => {},
        setCampaignV3Stage: (_chatId, stage) => { sessionState.campaignV3.currentStage = stage; },
      },
      projectRoot,
      monitoredSignals: new Set(),
      readChatContext: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'chat_context.json'), 'utf-8')),
      writeImageApproval: () => {},
      writeVideoApproval: () => {},
      sendImageApprovalRequest: async () => {},
      sendVideoApprovalRequest: async () => {},
      sendStageApprovalRequest: async () => {},
      enqueueStage: async (_payload, nextAgents) => { enqueued.push(nextAgents); },
      stages: { stage2: ['ad_creative_designer'] },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(sessionState.campaignV3.currentStage, 2);
    assert.deepEqual(enqueued[0], ['ad_creative_designer']);
  } finally {
    global.setInterval = originalSetInterval;
  }
});
