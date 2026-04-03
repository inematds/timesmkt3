const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createCampaignOutputHandlers,
  detectProjectFromText,
  findCampaign,
  findCampaignAcrossProjects,
} = require('../telegram/campaign-outputs');

test('findCampaign resolves exact and partial campaign names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-campaign-search-'));
  fs.mkdirSync(path.join(root, 'prj', 'demo', 'outputs', 'c0015-pascoa2026'), { recursive: true });
  fs.mkdirSync(path.join(root, 'prj', 'demo', 'outputs', 'black-friday-2026'), { recursive: true });

  assert.equal(findCampaign(root, 'prj/demo', 'c0015-pascoa2026'), 'c0015-pascoa2026');
  assert.equal(findCampaign(root, 'prj/demo', 'c15'), 'c0015-pascoa2026');
  assert.equal(findCampaign(root, 'prj/demo', 'black'), 'black-friday-2026');
});

test('findCampaignAcrossProjects and detectProjectFromText resolve project context', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-campaign-project-'));
  fs.mkdirSync(path.join(root, 'prj', 'alpha', 'outputs', 'c0001-demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'prj', 'beta', 'outputs', 'c0020-launch'), { recursive: true });

  assert.deepEqual(findCampaignAcrossProjects(root, 'launch'), {
    projectDir: 'prj/beta',
    campaignFolder: 'c0020-launch',
  });
  assert.equal(
    detectProjectFromText(root, 'rodar campanha no projeto beta agora', 'prj/alpha'),
    'prj/beta',
  );
});

test('sendCampaignFiles ignores prompt artifacts and reports sent files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'timesmkt3-campaign-send-'));
  const outputDir = path.join(root, 'campaign');
  fs.mkdirSync(path.join(outputDir, 'ads'), { recursive: true });
  fs.mkdirSync(path.join(outputDir, 'copy'), { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'ads', 'piece.png'), 'x');
  fs.writeFileSync(path.join(outputDir, 'ads', 'piece_prompt.txt'), 'ignore');
  fs.writeFileSync(path.join(outputDir, 'copy', 'Publish-demo.md'), 'publish');

  const delivered = [];
  const replies = [];
  const { sendCampaignFiles } = createCampaignOutputHandlers({
    splitMessage: (text) => [text],
    toTelegramHTML: (text) => text,
    sendPhoto: async (_ctx, filePath, fileName) => delivered.push({ type: 'photo', filePath, fileName }),
    sendVideo: async () => {},
    sendDocument: async (_ctx, filePath, fileName) => delivered.push({ type: 'document', filePath, fileName }),
  });

  await sendCampaignFiles({
    reply: async (message) => replies.push(message),
  }, outputDir, 'tudo');

  assert.equal(delivered.length, 2);
  assert.deepEqual(
    delivered.map((item) => item.fileName).sort(),
    ['Publish-demo.md', 'piece.png'],
  );
  assert.match(replies.at(-1), /2 arquivo\(s\) enviado\(s\)\./);
});
