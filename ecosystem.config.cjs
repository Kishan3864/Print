// pm2 process file (.cjs because package.json is "type": "module").
//   pm2 start ecosystem.config.cjs && pm2 save
//   pm2 reload printdesk        (after git pull)
module.exports = {
  apps: [
    {
      name: 'printdesk',
      script: 'server.js',
      cwd: __dirname,
      // Node 22+ binary for this app only (e.g. from nvm) so other apps on the
      // server keep their own Node version:  PRINTDESK_NODE=$(nvm which 22) pm2 start …
      interpreter: process.env.PRINTDESK_NODE || 'node',
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
