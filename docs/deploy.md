# Deploying on a VPS

One small Ubuntu 24.04 server runs everything: Caddy (HTTPS + static SPA), PHP-FPM (Laravel), MySQL and, later, Reverb. It never sleeps, which matters mid-party, and it can hold the long-lived WebSocket process Reverb needs. Hosts that sleep when idle (Render, Koyeb) or only serve static files (Vercel, Netlify, Cloudflare Pages) don't fit.

HTTPS is required: phones only open the camera for the QR scanner on a secure page.

Where to host (prices change; check them when you sign up):

| Provider | Plan | About | Notes |
|---|---|---|---|
| Hetzner Cloud | smallest CX / CAX | €4–5/month, 2 vCPU / 4 GB | Best value. Has a Singapore location (a bit pricier) |
| DigitalOcean | Basic droplet | $6/month, 1 GB | Simple UI, Singapore region. Add swap (below) |
| Oracle Cloud | Always Free A1 | $0 | Card needed to verify; setup has extra firewall steps (below) |

Pick a region near your guests. Every provider uses the same steps below.

## 1. Create the server

1. Create an **Ubuntu 24.04** server with your SSH key. In the provider's firewall, allow TCP **22**, **80** and **443**.
2. These steps run as a sudo user named `ubuntu`. Oracle already has one. On Hetzner and DigitalOcean you log in as `root`, so create it:

   ```bash
   adduser ubuntu && usermod -aG sudo ubuntu
   rsync --archive --chown=ubuntu:ubuntu ~/.ssh /home/ubuntu
   ```

   Then reconnect with `ssh ubuntu@<public-ip>`.
3. **1 GB servers only:** add swap so Composer, the frontend build and MySQL fit in memory:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

### If you use Oracle

- Sign up at cloud.oracle.com. Your home region can't be changed later, and free Arm capacity is sometimes "out of capacity", so retry or pick a less busy region.
- Upgrading the account to **Pay As You Go** almost always fixes "out of capacity" and stops Oracle reclaiming idle free VMs. It stays $0 while you stay within the Always Free limits.
- Compute → Instances → Create: shape **VM.Standard.A1.Flex** (Ampere), 2 OCPU / 12 GB.
- Networking → your VCN → default security list → add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
- Oracle's Ubuntu image also blocks those ports in the instance firewall:

  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```

## 2. Free domain

Create a subdomain at duckdns.org (e.g. `karaoke-xyz.duckdns.org`) and point it at the server's public IP, or point a domain you own at it with an A record. Below, `<domain>` means that name.

## 3. Install packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git unzip acl mysql-server composer supervisor \
  php8.3-fpm php8.3-mysql php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# Caddy must be able to reach the PHP-FPM socket (owned by www-data)
sudo usermod -aG www-data caddy
sudo systemctl restart caddy   # a reload doesn't pick up the new group
```

## 4. Database

```bash
sudo mysql -e "CREATE DATABASE karaoke CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'karaoke'@'localhost' IDENTIFIED BY '<strong-password>';
  GRANT ALL ON karaoke.* TO 'karaoke'@'localhost';"
```

## 5. Backend

```bash
sudo mkdir -p /var/www && sudo chown ubuntu:ubuntu /var/www
git clone https://github.com/raam221027/multi-phone-karaoke.git /var/www/karaoke
cd /var/www/karaoke/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
```

Edit `.env`:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://<domain>
FRONTEND_URL=https://<domain>
LOG_LEVEL=warning

DB_DATABASE=karaoke
DB_USERNAME=karaoke
DB_PASSWORD=<strong-password>

YOUTUBE_API_KEY=<your key>
```

Then:

```bash
php artisan key:generate
php artisan reverb:install      # only fills REVERB_* keys; harmless before Phase 3
php artisan migrate --force
php artisan config:cache && php artisan route:cache

# Both PHP-FPM (www-data) and you (ubuntu, running artisan) write here
sudo setfacl -R  -m u:www-data:rwX -m u:ubuntu:rwX storage bootstrap/cache
sudo setfacl -dR -m u:www-data:rwX -m u:ubuntu:rwX storage bootstrap/cache
```

## 6. Frontend

```bash
cd /var/www/karaoke/frontend
echo "VITE_PUBLIC_URL=https://<domain>" > .env.production
npm ci && npm run build
```

## 7. Caddy

```bash
sudo cp /var/www/karaoke/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile      # replace karaoke-example.duckdns.org with <domain>
sudo systemctl reload caddy
```

Open `https://<domain>`. The home page shows the API and database status.

## Updating

```bash
/var/www/karaoke/deploy/deploy.sh
```

It pulls `main`, installs dependencies, migrates, rebuilds the caches and the SPA, and reloads PHP-FPM.

## Later: Reverb (Phase 3)

Add to `frontend/.env.production` (the key is `REVERB_APP_KEY` from `backend/.env`) and rebuild:

```dotenv
VITE_REVERB_APP_KEY=<REVERB_APP_KEY>
VITE_REVERB_HOST=<domain>
VITE_REVERB_PORT=443
VITE_REVERB_SCHEME=https
```

Keep `REVERB_HOST=localhost`, `REVERB_PORT=8080`, `REVERB_SCHEME=http` in `backend/.env`: Laravel talks to Reverb locally, and Caddy forwards browser WebSockets on `/app/*` to it. Run Reverb under Supervisor, in `/etc/supervisor/conf.d/reverb.conf`:

```ini
[program:reverb]
command=php /var/www/karaoke/backend/artisan reverb:start --host=127.0.0.1 --port=8080
user=ubuntu
autostart=true
autorestart=true
stdout_logfile=/var/www/karaoke/backend/storage/logs/reverb.log
redirect_stderr=true
```

```bash
sudo supervisorctl reread && sudo supervisorctl update
```

Add `sudo supervisorctl restart reverb` to the end of `deploy.sh`.

## Checks

- Create a room on a phone using mobile data, then join from another phone on different Wi-Fi by scanning the QR code.
- Connect a laptop as the display; search, add, play and skip a song.
- `sudo reboot`, then confirm the site still works (Caddy, PHP-FPM and MySQL are enabled at boot by default).
