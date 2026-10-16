#!/usr/bin/env bash
# Pull the latest main and rebuild in place. Run on the server from any directory.
set -euo pipefail

cd "$(dirname "$0")/.."
git pull --ff-only

cd backend
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan config:cache
php artisan route:cache

cd ../frontend
npm ci
npm run build

# Drop OPcache so PHP picks up the new code.
sudo systemctl reload php8.3-fpm
