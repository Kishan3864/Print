// pm2 process file (.cjs because package.json is "type": "module").
//   pm2 start ecosystem.config.cjs && pm2 save
//   pm2 reload printdesk        (after git pull)
module.exports = {
  apps: [
    {
      name: 'printdesk',
      script: 'server.js',
      cwd: __dirname,
      node_args: '--env-file=.env',
      // SQLite + in-process jobs (retention, demo reset): exactly one process.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '400M',
      // server.js closes open connections for up to 5 s on SIGTERM.
      kill_timeout: 6000,
      env: {
        NODE_ENV: 'production',
      },
      time: true,
      merge_logs: true,
    },
  ],
};
