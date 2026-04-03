const test = require('node:test');
const assert = require('node:assert/strict');

const { createBotRuntime } = require('../telegram/bot-runtime');

function createSessionDouble() {
  const sessions = new Map();
  const histories = new Map();

  const ensureSession = (chatId) => {
    if (!sessions.has(chatId)) {
      sessions.set(chatId, { processing: false, projectDir: 'prj/demo' });
    }
    return sessions.get(chatId);
  };

  return {
    get(chatId) {
      return ensureSession(chatId);
    },
    addToHistory(chatId, role, content) {
      const history = histories.get(chatId) || [];
      history.push({ role, content });
      histories.set(chatId, history);
    },
    getHistory(chatId) {
      return histories.get(chatId) || [];
    },
    setCampaignV3(chatId, value) {
      ensureSession(chatId).campaignV3 = value;
    },
    getCampaignV3(chatId) {
      return ensureSession(chatId).campaignV3;
    },
    setPendingImageError(chatId, value) {
      ensureSession(chatId).pendingImageError = value;
    },
    clearRunningTask(chatId) {
      delete ensureSession(chatId).runningTask;
    },
    setRunningTask(chatId, value) {
      ensureSession(chatId).runningTask = value;
    },
    clearCampaignV3(chatId) {
      delete ensureSession(chatId).campaignV3;
    },
    setCampaignV3Stage(chatId, value) {
      ensureSession(chatId).campaignV3Stage = value;
    },
  };
}

function createReplyCollector() {
  const replies = [];

  return {
    replies,
    async reply(text, options) {
      replies.push({ text, options });
      return { ok: true };
    },
  };
}

test('handleChatMessage persists history and replies with Claude output', async () => {
  const session = createSessionDouble();
  const sentActions = [];
  const { replies, reply } = createReplyCollector();
  const ctx = {
    chat: { id: 'chat-1' },
    api: {
      sendChatAction(chatId, action) {
        sentActions.push({ chatId, action });
        return Promise.resolve();
      },
    },
    reply,
  };

  const runtime = createBotRuntime({
    bot: { api: {} },
    session,
    projectRoot: '/tmp/project',
    ensureWorker: () => null,
    enqueueStage: async () => {},
    stages: { stage1: ['research_agent'] },
    splitMessage: (text) => [text],
    toTelegramHTML: (text) => text,
    sendCampaignReport: async () => {},
    sendImageApprovalRequest: async () => {},
    sendVideoApprovalRequest: async () => {},
    runClaude(prompt, _mode, cb) {
      assert.match(prompt, /User: Quero uma campanha/);
      cb(0, 'Resposta final');
    },
  });

  const s = session.get('chat-1');
  runtime.handleChatMessage(ctx, 'chat-1', s, 'Quero uma campanha');

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(s.processing, false);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].text, 'Resposta final');
  assert.deepEqual(session.getHistory('chat-1'), [
    { role: 'user', content: 'Quero uma campanha' },
    { role: 'assistant', content: 'Resposta final' },
  ]);
  assert.ok(sentActions.some((entry) => entry.action === 'typing'));
});

test('runPipelineV3 stores campaign state and enqueues stage 1', async () => {
  const session = createSessionDouble();
  const { replies, reply } = createReplyCollector();
  const ctx = { reply };
  const enqueueCalls = [];
  const originalSetTimeout = global.setTimeout;

  global.setTimeout = () => ({ fake: true });

  try {
    const runtime = createBotRuntime({
      bot: { api: { sendMessage: async () => {}, sendVideo: async () => {}, sendPhoto: async () => {} } },
      session,
      projectRoot: '/tmp/project',
      ensureWorker: () => null,
      enqueueStage: async (payload, agents) => {
        enqueueCalls.push({ payload, agents });
      },
      stages: { stage1: ['research_agent', 'creative_director', 'copywriter_agent'] },
      splitMessage: (text) => [text],
      toTelegramHTML: (text) => text,
      sendCampaignReport: async () => {},
      sendImageApprovalRequest: async () => {},
      sendVideoApprovalRequest: async () => {},
      runClaude: () => {},
    });

    const payload = { task_name: 'campanha-a', approval_modes: { stage1: 'humano' } };
    runtime.runPipelineV3(ctx, 'chat-2', payload, 'tmp/test-output');

    await new Promise((resolve) => setImmediate(resolve));

    const campaignV3 = session.getCampaignV3('chat-2');
    assert.equal(campaignV3.outputDir, 'tmp/test-output');
    assert.equal(campaignV3.currentStage, 1);
    assert.deepEqual(enqueueCalls, [
      { payload, agents: ['research_agent', 'creative_director', 'copywriter_agent'] },
    ]);
    assert.equal(replies[0].text, 'Iniciando etapa 1/5 — Pesquisa & Brief Criativo...');
    assert.equal(replies[1].text, 'Pesquisa em andamento. Aguarde o brief criativo...');
  } finally {
    global.setTimeout = originalSetTimeout;
  }
});
