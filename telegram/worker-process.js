const { spawn, execSync } = require('child_process');

function isWorkerRunning() {
  try {
    const out = execSync("pgrep -af 'node.*pipeline/worker.js' | grep -v bash | grep -v pgrep", { encoding: 'utf-8', timeout: 3000 });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function ensureWorker({ projectRoot }) {
  if (isWorkerRunning()) {
    console.log('[bot] Worker already running, skipping spawn.');
    return null;
  }

  console.log('[bot] Spawning new worker...');
  const worker = spawn('node', ['pipeline/worker.js'], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  worker.on('error', err => console.error('[worker spawn error]', err.message));
  return worker;
}

module.exports = { isWorkerRunning, ensureWorker };
