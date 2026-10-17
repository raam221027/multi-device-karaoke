# Multi-Device Karaoke

Browser-based karaoke for multiple phones. The host creates a room on their phone, guests join by QR code or room code (no accounts, no app install), and a laptop connected to a TV plays YouTube karaoke videos. All devices sync in real time through a cloud backend, even when they're on different networks.

See [docs/architecture.md](docs/architecture.md) for the design.

```
backend/    Laravel 12 REST API + Sanctum + Reverb (Pest tests)
frontend/   React + TypeScript + Vite + Tailwind CSS
docs/       Architecture and design notes
```

## Prerequisites

- PHP 8.2+ with `pdo_mysql` (XAMPP works)
- Composer 2
- Node.js 20+ and npm
- MySQL 8 / MariaDB 10.4+ (XAMPP's MySQL works)

## First-time setup

```bash
# 1. Databases (start MySQL from the XAMPP Control Panel first)
mysql -u root -e "CREATE DATABASE karaoke CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -e "CREATE DATABASE karaoke_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
#    On XAMPP the client is at C:\xampp\mysql\bin\mysql.exe

# 2. Backend
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan reverb:install      # fills in REVERB_APP_ID / KEY / SECRET
php artisan migrate

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env            # set VITE_REVERB_APP_KEY = backend REVERB_APP_KEY
```

## Running locally (3 terminals)

```bash
cd backend  && php artisan serve --host=0.0.0.0 --port=8000
cd backend  && php artisan reverb:start --host=0.0.0.0 --port=8080
cd frontend && npm run dev
```

Open http://localhost:5173. The home page shows the API and database status.

The Vite dev server proxies `/api` and `/broadcasting` to Laravel, so the browser only uses one origin and you don't need CORS settings.

### Testing on real phones

- **Same Wi-Fi:** open `http://<your-PC-LAN-IP>:5173` on the phone. Allow ports 5173 and 8080 through Windows Firewall if needed.
- **Different networks:** expose the app with a tunnel such as Cloudflare Tunnel (`cloudflared`). This is set up in Phase 7.

## Tests

```bash
cd backend  && php artisan test     # Pest; uses the karaoke_test database
cd frontend && npm run build        # type-check + production build
```

## Deploying

See [docs/deploy.md](docs/deploy.md): the frontend on Vercel (`frontend/vercel.json` proxies `/api` to the backend), and Laravel + MySQL on Railway (`backend/railway.json`).

## Pushing to GitHub

Create an **empty** repository on github.com (no README or .gitignore), then:

```bash
git remote add origin https://github.com/<you>/multi-device-karaoke.git
git push -u origin main
```
