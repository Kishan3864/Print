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

Open http://localhost:3100 (landing page), http://localhost:3100/admin (super admin) and http://localhost:3100/demo (demo shop, sample data reset every 6 hours).

`npm run dev` restarts on file changes. `npm run icons` regenerates the app icons in `public/icons/`.

## Deploy on Ubuntu VPS

DNS: add an **A record** `print` -> `187.127.141.107` for brightonsolution.com.

```bash
# Node.js 22 (NodeSource), build tools for better-sqlite3 (if no prebuilt binary), nginx, certbot, pm2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential python3 git nginx certbot python3-certbot-nginx
sudo npm install -g pm2

# App code
sudo git clone https://github.com/Kishan3864/Print.git /var/www/printdesk
sudo chown -R $USER:$USER /var/www/printdesk
cd /var/www/printdesk
npm ci --omit=dev

# Data folder (database + uploads), outside the code folder
sudo mkdir -p /var/lib/printdesk
sudo chown -R $USER:$USER /var/lib/printdesk

# Config: set SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD, SMTP_*
cp .env.example .env
nano .env

# Start and keep running after reboot
pm2 start ecosystem.config.cjs && pm2 save
pm2 startup        # run the command it prints

# nginx + HTTPS
sudo cp deploy/nginx/print.brightonsolution.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/print.brightonsolution.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d print.brightonsolution.com
```

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
