# PrintDesk – go live (safe, step by step)

Every step only **adds** things (a new folder, a new pm2 app, a new nginx site file).
Existing sites, apps and data on the server are not changed. Rollback is at the end.

## 0. Before you start (on your Windows PC)

DNS at your domain provider – two **A records**, both to `187.127.141.107`:

| Name | Value |
|---|---|
| `print` | 187.127.141.107 |
| `adminprint` | 187.127.141.107 |

Push the code (PowerShell in `D:\Print`):

```powershell
git push -u origin main
```

## 1. Check the server (read-only, changes nothing)

```bash
curl -fsSL https://raw.githubusercontent.com/Kishan3864/Print/main/deploy/preflight.sh | bash
```

Look at: **node version**, **port 3100 free**, the existing **server_name** list (must not
already contain print.brightonsolution.com), and DNS pointing to this server.

## 2. Node.js 22 – without touching other apps

Pick ONE line, based on `node -v` from step 1:

```bash
# a) node is v22 or newer → nothing to do.

# b) node is older (other apps use it) → Node 22 only for PrintDesk, via nvm (no system change):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && . ~/.nvm/nvm.sh && nvm install 22 && nvm alias default system 2>/dev/null; true

# c) node is not installed at all:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Build tools for the database module (safe, only adds packages):

```bash
sudo apt-get install -y build-essential python3 git
```

## 3. Code + data folder

```bash
sudo mkdir -p /var/www/printdesk /var/lib/printdesk
sudo chown -R $USER:$USER /var/www/printdesk /var/lib/printdesk
git clone https://github.com/Kishan3864/Print.git /var/www/printdesk
cd /var/www/printdesk
npm ci --omit=dev                         # case b (nvm):  . ~/.nvm/nvm.sh && nvm exec 22 npm ci --omit=dev
```

## 4. Settings (.env)

```bash
cd /var/www/printdesk
cp .env.example .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$(openssl rand -hex 32)/" .env
nano .env        # set ADMIN_EMAIL and ADMIN_PASSWORD='…' (Razorpay keys later)
```

If step 1 said port 3100 is busy: set `PORT=3110` in `.env` and run
`sed -i 's/127.0.0.1:3100/127.0.0.1:3110/' deploy/nginx/print.brightonsolution.com.conf`.

## 5. Start the app (pm2)

```bash
cd /var/www/printdesk
command -v pm2 || sudo npm install -g pm2          # case b (nvm): nvm exec 22 npm install -g pm2
pm2 start ecosystem.config.cjs                     # case b (nvm): PRINTDESK_NODE=$(. ~/.nvm/nvm.sh && nvm which 22) pm2 start ecosystem.config.cjs
sleep 3 && curl -s http://127.0.0.1:3100/healthz   # must print: ok
pm2 save
pm2 startup        # only if pm2 was not set up before – run the one command it prints
```

## 6. nginx site (new file only – tested before reload)

```bash
cd /var/www/printdesk
sudo cp deploy/nginx/print.brightonsolution.com.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/print.brightonsolution.com.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` shows an error, nothing was reloaded – undo with
`sudo rm /etc/nginx/sites-enabled/print.brightonsolution.com.conf` and send me the error.

## 7. HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx     # skip if certbot exists
sudo certbot --nginx -d print.brightonsolution.com -d adminprint.brightonsolution.com
```

## 8. Check

- https://print.brightonsolution.com – landing + pricing
- https://print.brightonsolution.com/demo – the link for Instagram leads
- https://adminprint.brightonsolution.com – your admin login

## Update later

```bash
cd /var/www/printdesk && git pull && npm ci --omit=dev && pm2 reload printdesk
```

## Payments (PayU) – when your account is ready

1. PayU Dashboard → Key & Salt → put `PAYU_KEY` and `PAYU_SALT` in `.env` (`PAYU_TEST=true` to try with test keys first).
2. `pm2 reload printdesk`. PayU sends customers back to `https://print.brightonsolution.com/pay/payu/return` automatically.
3. Until then, record UPI payments in Admin → shop → "Record payment".

## Rollback (removes only PrintDesk)

```bash
pm2 delete printdesk && pm2 save
sudo rm /etc/nginx/sites-enabled/print.brightonsolution.com.conf && sudo nginx -t && sudo systemctl reload nginx
```
