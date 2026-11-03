#!/usr/bin/env bash
# Brighton Print – READ-ONLY check of the VPS before installing. It changes nothing.
#   curl -fsSL https://raw.githubusercontent.com/Kishan3864/Print/main/deploy/preflight.sh | bash

line() { printf '\n== %s\n' "$1"; }

line "System"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME"
uptime -p 2>/dev/null

line "Disk (/) and memory"
df -h / | tail -1
free -h | awk 'NR<=2'

line "Node / npm / pm2"
if command -v node >/dev/null; then echo "node $(node -v)  (Brighton Print needs v22+)"; else echo "node: not installed"; fi
command -v npm >/dev/null && echo "npm $(npm -v)"
if command -v pm2 >/dev/null; then pm2 ls; else echo "pm2: not installed"; fi
[ -s "$HOME/.nvm/nvm.sh" ] && echo "nvm: installed" || echo "nvm: not installed"

line "nginx sites (existing sites stay untouched)"
if command -v nginx >/dev/null; then
  nginx -v 2>&1
  ls -1 /etc/nginx/sites-enabled/ 2>/dev/null
  echo "-- server_name in use:"
  sudo nginx -T 2>/dev/null | grep -E '^\s*server_name' | sed 's/^\s*//' | sort -u
else
  echo "nginx: not installed"
fi

line "Ports 80 / 443 / 3100"
sudo ss -ltnp 2>/dev/null | grep -E ':(80|443|3100)\s' || echo "none of 80, 443, 3100 in use"
if sudo ss -ltn 2>/dev/null | grep -qE ':3100\s'; then echo "WARNING: 3100 is busy – use another PORT for Brighton Print (e.g. 3110)"; else echo "OK: port 3100 is free"; fi

line "DNS (should show this server's IP)"
echo "this server: $(curl -s -4 --max-time 5 ifconfig.me || hostname -I | awk '{print $1}')"
for h in print.brightonsolution.com adminprint.brightonsolution.com; do
  printf '%-36s -> %s\n' "$h" "$(getent hosts "$h" | awk '{print $1}' | head -1)"
done

line "Existing Brighton Print / certificates"
ls -d /var/www/printdesk /var/lib/printdesk 2>/dev/null || echo "Brighton Print not installed yet"
if command -v certbot >/dev/null; then sudo certbot certificates 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry'; else echo "certbot: not installed"; fi
echo
