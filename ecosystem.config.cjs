module.exports = {
  apps: [
    {
      name: 'timesmkt3-bot',
      script: 'telegram/bot.js',
      cwd: '/home/nmaldaner/projetos/timesmkt3',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'timesmkt3-worker',
      script: 'pipeline/worker.js',
      cwd: '/home/nmaldaner/projetos/timesmkt3',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
