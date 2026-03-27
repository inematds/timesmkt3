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
      pendingVideoApproval: null, // { outputDir, scenePlans: [...] }
    });
  }
  return sessions.get(chatId);
}

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
  DEFAULT_PROJECT,
};
