/**
 * Persistent session manager — saves to disk on every write.
 * Survives bot restarts without losing campaign state.
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.resolve(__dirname, '..', '.sessions.json');
const DEFAULT_PROJECT = 'prj/inema';
const MAX_HISTORY = 20;

// Map<chatId, sessionData>
let sessions = new Map();

// ── Persistence ──────────────────────────────────────────────────────────────

function loadFromDisk() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
      sessions = new Map(Object.entries(data));
      console.log(`[session] Loaded ${sessions.size} sessions from disk`);
    }
  } catch (e) {
    console.error(`[session] Failed to load sessions: ${e.message}`);
  }
}

function saveToDisk() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[session] Failed to save sessions: ${e.message}`);
  }
}

// Debounce saves — max 1 write per 500ms
let _saveTimer = null;
function debouncedSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveToDisk();
  }, 500);
}

// Load on startup
loadFromDisk();

// ── Session access ───────────────────────────────────────────────────────────

function get(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      projectDir: DEFAULT_PROJECT,
      runningTask: null,
      history: [],
      processing: false,
      photoTarget: { destination: 'project', folder: 'imgs' },
      pendingCampaign: null,
      pendingVideoApproval: null,
      campaignV3: null,
    });
    debouncedSave();
  }
  return sessions.get(chatId);
}

// ── v3 campaign state ────────────────────────────────────────────────────────

function setCampaignV3(chatId, data) {
  const s = get(chatId);
  s.campaignV3 = data;
  debouncedSave();
}

function getCampaignV3(chatId) {
  return get(chatId).campaignV3;
}

function updateCampaignV3Stage(chatId, stage, result) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.stageResults = s.campaignV3.stageResults || {};
  s.campaignV3.stageResults[`stage${stage}`] = result;
  debouncedSave();
}

function setCampaignV3Stage(chatId, stage) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.currentStage = stage;
  debouncedSave();
}

function setPendingStageApproval(chatId, approvalData) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.pendingApproval = approvalData;
  debouncedSave();
}

function clearPendingStageApproval(chatId) {
  const s = get(chatId);
  if (!s.campaignV3) return;
  s.campaignV3.pendingApproval = null;
  debouncedSave();
}

function clearCampaignV3(chatId) {
  const s = get(chatId);
  s.campaignV3 = null;
  debouncedSave();
}

// ── legacy fields ────────────────────────────────────────────────────────────

function setPendingVideoApproval(chatId, data) {
  const s = get(chatId);
  s.pendingVideoApproval = data;
  debouncedSave();
}

function clearPendingVideoApproval(chatId) {
  const s = get(chatId);
  s.pendingVideoApproval = null;
  debouncedSave();
}

function setPendingImageError(chatId, data) {
  const s = get(chatId);
  s.pendingImageError = data;
  debouncedSave();
}

function clearPendingImageError(chatId) {
  const s = get(chatId);
  s.pendingImageError = null;
  debouncedSave();
}

function setPendingLote(chatId, data) {
  const s = get(chatId);
  s.pendingLote = data;
  debouncedSave();
}

function clearPendingLote(chatId) {
  const s = get(chatId);
  s.pendingLote = null;
  debouncedSave();
}

function setPendingCampaign(chatId, payload) {
  const s = get(chatId);
  s.pendingCampaign = payload;
  debouncedSave();
}

function clearPendingCampaign(chatId) {
  const s = get(chatId);
  s.pendingCampaign = null;
  debouncedSave();
}

function setPendingRerun(chatId, data) {
  const s = get(chatId);
  s.pendingRerun = data;
  debouncedSave();
}

function clearPendingRerun(chatId) {
  const s = get(chatId);
  s.pendingRerun = null;
  debouncedSave();
}

function setPhotoTarget(chatId, destination, folder) {
  const s = get(chatId);
  s.photoTarget = { destination, folder };
  debouncedSave();
}

function addToHistory(chatId, role, content) {
  const s = get(chatId);
  s.history = s.history || [];
  s.history.push({ role, content });
  if (s.history.length > MAX_HISTORY) {
    s.history = s.history.slice(-MAX_HISTORY);
  }
  debouncedSave();
}

function getHistory(chatId) {
  return get(chatId).history || [];
}

function clearHistory(chatId) {
  const s = get(chatId);
  s.history = [];
  debouncedSave();
}

function setProject(chatId, projectDir) {
  const s = get(chatId);
  s.projectDir = projectDir;
  debouncedSave();
}

function setRunningTask(chatId, taskInfo) {
  const s = get(chatId);
  s.runningTask = taskInfo;
  debouncedSave();
}

function clearRunningTask(chatId) {
  const s = get(chatId);
  s.runningTask = null;
  debouncedSave();
}

module.exports = {
  get, setProject, setRunningTask, clearRunningTask,
  addToHistory, getHistory, clearHistory,
  setPhotoTarget,
  setPendingLote, clearPendingLote,
  setPendingCampaign, clearPendingCampaign,
  setPendingRerun, clearPendingRerun,
  setPendingVideoApproval, clearPendingVideoApproval,
  setPendingImageError, clearPendingImageError,
  setCampaignV3, getCampaignV3, updateCampaignV3Stage, setCampaignV3Stage,
  setPendingStageApproval, clearPendingStageApproval, clearCampaignV3,
  DEFAULT_PROJECT,
  loadFromDisk, saveToDisk,
};
