const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createPendingTextHandlers } = require('../telegram/bot-text-pending');

function createSessionDouble() {
  const sessions = new Map();

  const ensureSession = (chatId) => {
    if (!sessions.has(chatId)) {
      sessions.set(chatId, {});
    }
    return sessions.get(chatId);
  };

  return {
    get(chatId) {
      return ensureSession(chatId);
    },
    clearPendingImageError(chatId) {
      delete ensureSession(chatId).pendingImageError;
    },
    clearPendingVideoApproval(chatId) {
      delete ensureSession(chatId).pendingVideoApproval;
    },
    clearPendingCampaign(chatId) {
      delete ensureSession(chatId).pendingCampaign;
    },
    clearPendingRerun(chatId) {
      delete ensureSession(chatId).pendingRerun;
    },
    setPendingCampaign(chatId, payload) {
      ensureSession(chatId).pendingCampaign = payload;
    },
    setRunningTask(chatId, value) {
      ensureSession(chatId).runningTask = value;
    },
    clearHistory(chatId) {
      ensureSession(chatId).history = [];
    },
    setCampaignV3(chatId, value) {
      ensureSession(chatId).campaignV3 = value;
    },
    setCampaignV3Stage(chatId, value) {
      ensureSession(chatId).campaignV3Stage = value;
    },
    clearRunningTask(chatId) {
      delete ensureSession(chatId).runningTask;
    },
    clearCampaignV3(chatId) {
      delete ensureSession(chatId).campaignV3;
    },
  };
}

function createCtx() {
  const replies = [];
  return {
    replies,
    async reply(text, options) {
      replies.push({ text, options });
      return { ok: true };
    },
  };
}

function createHandlers(projectRoot, session, extra = {}) {
  return createPendingTextHandlers({
    projectRoot,
    session,
    bot: { api: { sendMessage: async () => {} } },
    monitoredSignals: new Set(),
    ensureWorker: () => null,
    stages: { stage1: ['research_agent'] },
    enqueueStage: async () => {},
    writeVideoApproval: () => {},
    runClaude: () => {},
    sendVideoApprovalRequest: async () => {},
    showCampaignConfirmation: async () => {},
    parseCampaignFromText: () => {},
    runPipelineV3: () => {},
    ...extra,
  });
}

test('handlePendingImageError writes retry decision and clears pending state', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-text-'));
  const session = createSessionDouble();
  const ctx = createCtx();
  const chatId = '123';
  const s = session.get(chatId);
  s.pendingImageError = { outputDir: 'prj/demo/outputs/campanha' };

  const { handlePendingImageError } = createHandlers(projectRoot, session);
  const handled = await handlePendingImageError(ctx, chatId, s, 'tentar novamente');

  const decisionPath = path.join(projectRoot, 'prj/demo/outputs/campanha/imgs/error_decision.json');
  assert.equal(handled, true);
  assert.equal(fs.existsSync(decisionPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(decisionPath, 'utf-8')), {
    action: 'retry',
    ts: JSON.parse(fs.readFileSync(decisionPath, 'utf-8')).ts,
  });
  assert.equal(session.get(chatId).pendingImageError, undefined);
  assert.match(ctx.replies[0].text, /Tentando gerar as imagens novamente/);
});

test('handlePendingVideoApproval confirms and writes approval', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-text-'));
  const session = createSessionDouble();
  const ctx = createCtx();
  const chatId = '456';
  const s = session.get(chatId);
  s.pendingVideoApproval = { outputDir: 'prj/demo/outputs/campanha' };
  const videoDir = path.join(projectRoot, 'prj/demo/outputs/campanha/video');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.writeFileSync(path.join(videoDir, 'approval_needed.json'), JSON.stringify({ needed: true }));

  const approvals = [];
  const { handlePendingVideoApproval } = createHandlers(projectRoot, session, {
    writeVideoApproval: (_root, outputDir, approved) => approvals.push({ outputDir, approved }),
  });

  const handled = await handlePendingVideoApproval(ctx, chatId, s, 'sim');

  assert.equal(handled, true);
  assert.deepEqual(approvals, [{ outputDir: 'prj/demo/outputs/campanha', approved: true }]);
  assert.equal(session.get(chatId).pendingVideoApproval, undefined);
  assert.match(ctx.replies[0].text, /Aprovado! Renderizando os vídeos agora/);
});

test('handlePendingVideoApproval ignores expired approval', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-text-'));
  const session = createSessionDouble();
  const ctx = createCtx();
  const chatId = '457';
  const s = session.get(chatId);
  s.pendingVideoApproval = { outputDir: 'prj/demo/outputs/campanha' };

  const videoDir = path.join(projectRoot, 'prj/demo/outputs/campanha/video');
  fs.mkdirSync(videoDir, { recursive: true });
  fs.writeFileSync(path.join(videoDir, 'timed_out.json'), JSON.stringify({ timed_out: true }));

  const approvals = [];
  const { handlePendingVideoApproval } = createHandlers(projectRoot, session, {
    writeVideoApproval: () => approvals.push('called'),
  });

  const handled = await handlePendingVideoApproval(ctx, chatId, s, 'sim');

  assert.equal(handled, true);
  assert.equal(approvals.length, 0);
  assert.equal(session.get(chatId).pendingVideoApproval, undefined);
  assert.match(ctx.replies[0].text, /aprovação expirou/i);
});

test('handlePendingCampaign starts pipeline and numbers campaign on confirmation', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-text-'));
  const outputsDir = path.join(projectRoot, 'prj', 'demo', 'outputs');
  fs.mkdirSync(outputsDir, { recursive: true });
  fs.mkdirSync(path.join(outputsDir, 'c0003-antiga'), { recursive: true });

  const session = createSessionDouble();
  const ctx = createCtx();
  const chatId = '789';
  const s = session.get(chatId);
  s.pendingCampaign = {
    task_name: 'nova_campanha',
    task_date: '2026-04-02',
    project_dir: 'prj/demo',
  };

  const runs = [];
  const { handlePendingCampaign } = createHandlers(projectRoot, session, {
    runPipelineV3: (_ctx, _chatId, payload, outputDir) => runs.push({ payload, outputDir }),
  });

  const handled = await handlePendingCampaign(ctx, chatId, s, 'sim');

  assert.equal(handled, true);
  assert.equal(session.get(chatId).pendingCampaign, undefined);
  assert.equal(session.get(chatId).runningTask.taskName, 'c0004-nova_campanha');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].outputDir, 'prj/demo/outputs/c0004-nova_campanha');
  assert.match(ctx.replies[0].text, /Iniciando pipeline/);
});

test('handlePendingCampaign updates approval mode and refreshes confirmation', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-text-'));
  const session = createSessionDouble();
  const ctx = createCtx();
  const chatId = '790';
  const s = session.get(chatId);
  s.pendingCampaign = {
    task_name: 'campanha',
    project_dir: 'prj/demo',
    approval_modes: { stage1: 'humano' },
  };

  const confirmations = [];
  const { handlePendingCampaign } = createHandlers(projectRoot, session, {
    showCampaignConfirmation: async ({ payload }) => confirmations.push(payload.approval_modes),
  });

  const handled = await handlePendingCampaign(ctx, chatId, s, 'auto');

  assert.equal(handled, true);
  assert.deepEqual(s.pendingCampaign.approval_modes, {
    stage1: 'auto',
    stage2: 'auto',
    stage3: 'auto',
    stage4: 'auto',
    stage5: 'auto',
  });
  assert.equal(confirmations.length, 1);
  assert.match(ctx.replies[0].text, /aprovações definidas como/);
});
