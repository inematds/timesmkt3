const fs = require('fs');
const path = require('path');
const { Queue } = require('bullmq');
const { spawn } = require('child_process');

function videoTimestamp() {
  const d = new Date();
  return d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '_' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
}

function backupIfExists(filePath) {
  if (!fs.existsSync(filePath)) return;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let v = 1;
  while (fs.existsSync(path.join(dir, `${base}_v${v}${ext}`))) v++;
  fs.renameSync(filePath, path.join(dir, `${base}_v${v}${ext}`));
}

function createLogger(projectRoot) {
  return function log(outputDir, agentName, message) {
    const logDir = path.resolve(projectRoot, outputDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${agentName}.log`);
    const entry = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(`  [${agentName}] ${message.split('\n')[0]}`);
  };
}

function createDependencyWaiter({ queueName, redisConnection, log }) {
  return async function waitForDependencies(job) {
    const deps = job.data.dependencies || [];
    if (deps.length === 0) return;

    const queue = new Queue(queueName, { connection: redisConnection });
    log(job.data.output_dir, job.data.agent, `Waiting for dependencies: ${deps.join(', ')}`);

    const maxWait = 3600000;
    const pollInterval = 5000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const completed = await queue.getCompleted(0, 1000);
      const outputDir = job.data.output_dir;
      const completedAgents = completed.filter(j => j.data.output_dir === outputDir).map(j => j.data.agent);

      if (deps.every(dep => completedAgents.includes(dep))) {
        log(job.data.output_dir, job.data.agent, 'All dependencies completed.');
        await queue.close();
        return;
      }

      const failed = await queue.getFailed(0, 1000);
      const failedAgents = failed.filter(j => j.data.output_dir === outputDir).map(j => j.data.agent);
      if (deps.some(dep => failedAgents.includes(dep))) {
        await queue.close();
        throw new Error(`Dependency failed for ${job.data.agent}. Cannot proceed.`);
      }

      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed % 30 < pollInterval / 1000) {
        const waiting = deps.filter(dep => !completedAgents.includes(dep));
        log(job.data.output_dir, job.data.agent, `Still waiting for: ${waiting.join(', ')} (${elapsed}s elapsed)`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    await queue.close();
    throw new Error(`Timeout waiting for dependencies: ${deps.join(', ')}`);
  };
}

function createClaudeRunner({ projectRoot, log, command = 'claude' }) {
  return function runClaude(prompt, agentName, outputDir, timeoutMs = 600000, { model = 'sonnet' } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [
        '-p', prompt,
        '--dangerously-skip-permissions',
        '--model', model,
        '--no-session-persistence',
      ], {
        cwd: projectRoot,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      log(outputDir, agentName, 'Invoking Claude CLI...');

      child.stdout.on('data', data => { stdout += data.toString(); });
      child.stderr.on('data', data => { stderr += data.toString(); });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Claude CLI timed out for ${agentName} after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        if (stdout) log(outputDir, agentName, `Claude output:\n${stdout}`);
        if (stderr) log(outputDir, agentName, `Claude stderr:\n${stderr}`);

        if (code !== 0) {
          log(outputDir, agentName, `Claude CLI exited with code ${code}`);
          reject(new Error(`Claude CLI failed for ${agentName} (exit code ${code})`));
          return;
        }

        resolve(stdout);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        log(outputDir, agentName, `Claude CLI spawn error: ${err.message}`);
        reject(new Error(`Claude CLI spawn failed for ${agentName}: ${err.message}`));
      });
    });
  };
}

module.exports = {
  videoTimestamp,
  backupIfExists,
  createLogger,
  createDependencyWaiter,
  createClaudeRunner,
};
