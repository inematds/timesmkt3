const { spawn } = require('child_process');

function runClaude({ prompt, agentName, callback, projectRoot, claudePath = '/home/nmaldaner/.local/bin/claude', model = 'sonnet', timeoutMs = 600000 }) {
  const child = spawn(claudePath, [
    '-p', prompt,
    '--dangerously-skip-permissions',
    '--model', model,
  ], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', d => { stdout += d.toString(); });
  child.stderr.on('data', d => { stderr += d.toString(); });

  child.on('error', err => {
    console.error(`[${agentName}] Claude spawn error: ${err.message}`);
    callback(1, '');
  });

  child.on('close', code => {
    if (code !== 0) {
      console.error(`[${agentName}] Claude exit ${code}: ${stderr.slice(0, 500)}`);
    }
    callback(code, stdout);
  });

  setTimeout(() => { child.kill('SIGTERM'); }, timeoutMs);
  return child;
}

module.exports = { runClaude };
