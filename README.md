# PrintDesk by Brighton Solution

Online order intake for print shops: one link for customers, one order number, one final file, with proofs, status tracking and WhatsApp updates.

## Run locally

Needs Node.js 22 or newer.

```bash
npm install
cp .env.example .env
# edit .env for local use:
#   NODE_ENV=development
#   BASE_URL=http://localhost:3100
#   DATA_DIR=../printdesk-data
#   ADMIN_EMAIL / ADMIN_PASSWORD = your admin login
npm start
```

Open http://localhost:3100 (landing + pricing), http://localhost:3100/demo (demo: sample shop, or create a free demo shop) and http://localhost:3100/admin (super admin; in production it runs on ADMIN_HOST).

`npm run dev` restarts on file changes. `npm run icons` regenerates the app icons in `public/icons/`.

## Deploy on Ubuntu VPS

Safe step-by-step guide (does not touch other sites on the server): [deploy/GO-LIVE.md](deploy/GO-LIVE.md).
Read-only server check first: `bash deploy/preflight.sh`.

Update to the latest version:

```bash
cd /var/www/printdesk && git pull && npm ci --omit=dev && pm2 reload printdesk
```

Logs: `pm2 logs printdesk` (rotate them with `pm2 install pm2-logrotate`).

Backup (consistent copy of the live database, then the files):

```bash
mkdir -p /var/backups/printdesk
cd /var/www/printdesk && node -e 'require("better-sqlite3")("/var/lib/printdesk/printdesk.db").backup(process.argv[1]).then(() => console.log("ok"))' /var/backups/printdesk/printdesk-$(date +%F).db
rsync -a /var/lib/printdesk/uploads /var/lib/printdesk/logos /var/backups/printdesk/
```
