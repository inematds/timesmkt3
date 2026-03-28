/**
 * In-memory session manager.
 * Tracks the active project per chat and any running campaign.
 */

// Map<chatId, { projectDir, runningTask, ... }>
const sessions = new Map();

const DEFAULT_PROJECT = 'prj/coldbrew-coffee-co';
const MAX_HISTORY = 20;

function get(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      projectDir: DEFAULT_PROJECT,
      runningTask: null,
      history: [],
      processing: false,
      photoTarget: { destination: 'project', folder: 'imgs' },
      pendingCampaign: null,
      pendingVideoApproval: null, // legacy v2 approval
      campaignV3: null,           // v3 pipeline state
    });
  }
  return sessions.get(chatId);
}

// ── v3 campaign state ─────────────────────────────────────────────────────────

/**
 * campaignV3 shape:
 * {
 *   payload: { ...original campaign payload },
 *   outputDir: 'prj/xxx/outputs/campanha_2026-03-27',
 *   currentStage: 1,           // 1..4
 *   pendingApproval: {
 *     stage: 1,
 *     type: 'humano'|'agente'|'auto',
 *   } | null,
 *   stageResults: {
 *     stage1: { status, briefPath } | null,
 *     stage2: { status, adsPaths, copyPath } | null,
 *     stage3: { status, videoPaths } | null,
 *     stage4: { status } | null,
 *   },
 *   approvalModes: {
 *     stage1: 'humano',
 *     stage2: 'humano',
 *     stage3: 'humano',
 *     stage4: 'humano',
 *   },
 *   notifications: true,
 * }
 */

function setCampaignV3(chatId, data) {
  const s = get(chatId);
  s.campaignV3 = data;
}

function getCampaignV3(chatId) {
  return get(chatId).campaignV3;
}

function updateCampaignV3Stage(chatId, stage, result) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.stageResults[`stage${stage}`] = result;
}

function setCampaignV3Stage(chatId, stage) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.currentStage = stage;
}

function setPendingStageApproval(chatId, approvalData) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.pendingApproval = approvalData;
}

function clearPendingStageApproval(chatId) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.pendingApproval = null;
}

function clearCampaignV3(chatId) {
  const s = get(chatId);
  s.campaignV3 = null;
}

// ── legacy fields ─────────────────────────────────────────────────────────────

function setPendingVideoApproval(chatId, data) {
  const s = get(chatId);
  s.pendingVideoApproval = data;
}

function clearPendingVideoApproval(chatId) {
  const s = get(chatId);
  s.pendingVideoApproval = null;
}

function setPendingCampaign(chatId, payload) {
  const s = get(chatId);
  s.pendingCampaign = payload;
}

function clearPendingCampaign(chatId) {
  const s = get(chatId);
  s.pendingCampaign = null;
}

function setPhotoTarget(chatId, destination, folder) {
  const s = get(chatId);
  s.photoTarget = { destination, folder };
}

function addToHistory(chatId, role, content) {
  const s = get(chatId);
  s.history.push({ role, content });
  if (s.history.length > MAX_HISTORY) {
    s.history = s.history.slice(-MAX_HISTORY);
  }
}

function getHistory(chatId) {
  return get(chatId).history;
}

function clearHistory(chatId) {
  const s = get(chatId);
  s.history = [];
}

function setProject(chatId, projectDir) {
  const s = get(chatId);
  s.projectDir = projectDir;
}

function setRunningTask(chatId, taskInfo) {
  const s = get(chatId);
  s.runningTask = taskInfo;
}

function clearRunningTask(chatId) {
  const s = get(chatId);
  s.runningTask = null;
}

module.exports = {
  get, setProject, setRunningTask, clearRunningTask,
  addToHistory, getHistory, clearHistory,
  setPhotoTarget,
  setPendingCampaign, clearPendingCampaign,
  setPendingVideoApproval, clearPendingVideoApproval,
  setCampaignV3, getCampaignV3, updateCampaignV3Stage, setCampaignV3Stage,
  setPendingStageApproval, clearPendingStageApproval, clearCampaignV3,
  DEFAULT_PROJECT,
};
