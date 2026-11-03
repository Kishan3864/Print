import { config } from './src/config.js';
import { createApp } from './src/app.js';
import { startJobs } from './src/jobs.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  console.log(`[printdesk] listening on http://${config.host}:${config.port}  (BASE_URL ${config.baseUrl})`);
  if (!config.adminEmail || !config.adminPassword) console.warn('[printdesk] ADMIN_EMAIL / ADMIN_PASSWORD not set – /admin login is disabled');
  startJobs();
});

// Large uploads on slow mobile networks: allow long requests.
server.requestTimeout = 60 * 60 * 1000;
server.headersTimeout = 65 * 1000;
server.keepAliveTimeout = 65 * 1000;

// Background work (emails) must never take the server down.
process.on('unhandledRejection', (err) => console.error('[printdesk] unhandled rejection:', err));

const shutdown = (signal) => {
  console.log(`[printdesk] ${signal} – shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
