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
