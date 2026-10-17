# Deploying: Vercel + Railway

- **Vercel** serves the React SPA (`frontend/`).
- **Railway** runs Laravel (`backend/`) and MySQL. It doesn't sleep when idle, which matters mid-party.

The browser only ever talks to the Vercel domain. `frontend/vercel.json` rewrites `/api/*` and `/broadcasting/*` to Railway, the same way the Vite dev proxy does locally. So the SPA keeps calling relative paths, and there's no CORS to configure. Devices sign in with bearer tokens, not cookies, so the extra hop doesn't affect auth.

HTTPS is required because phones only open the camera for the QR scanner on a secure page. Both `*.vercel.app` and `*.up.railway.app` come with HTTPS.

Pricing changes, so check it when you sign up. Vercel Hobby is free. Railway gives trial credit, and after that the Hobby plan costs about $5/month including usage at this size.

## 1. Railway: backend + database

1. Go to railway.com → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. In the service → **Settings**:
   - **Root Directory**: `backend`
   - Railpack detects Laravel. `backend/railway.json` runs migrations before each deploy and health-checks `/up`.
3. In the project, choose **+ New → Database → MySQL**.
4. Under **Settings → Networking**, choose **Generate Domain**. That gives you `<railway-domain>`, e.g. `karaoke-api-production.up.railway.app`.
5. Under **Variables**, add:

   ```dotenv
   APP_NAME="Multi-Phone Karaoke"
   APP_ENV=production
   APP_DEBUG=false
   APP_KEY=<output of: php artisan key:generate --show>
   APP_URL=https://<railway-domain>
   FRONTEND_URL=https://<vercel-domain>
   LOG_CHANNEL=stderr
   LOG_LEVEL=warning

   DB_CONNECTION=mysql
   DB_URL=${{MySQL.MYSQL_URL}}

   SESSION_DRIVER=database
   CACHE_STORE=database
   QUEUE_CONNECTION=sync
   BROADCAST_CONNECTION=log

   YOUTUBE_API_KEY=<your key>
   ```

   `${{MySQL.MYSQL_URL}}` is a Railway reference to the MySQL service. Rename `MySQL` if your database service has a different name. You'll fill in `FRONTEND_URL` after step 2.
6. Deploy, then open `https://<railway-domain>/up` and check that it returns 200.

## 2. Vercel: frontend

1. In `frontend/vercel.json`, replace both `RAILWAY_DOMAIN` placeholders with `<railway-domain>`, then commit and push.
2. Go to vercel.com → **Add New → Project** → import this repo.
   - **Root Directory**: `frontend`
   - Framework preset **Vite**. The defaults are fine: build with `npm run build`, output to `dist`.
   - You don't need any env vars. If `VITE_PUBLIC_URL` is empty, QR codes and invite links use the page's own address.
3. Deploy. You get `<vercel-domain>`, e.g. `karaoke.vercel.app`.
4. Back on Railway, set `FRONTEND_URL=https://<vercel-domain>`. Railway redeploys on its own.

Open `https://<vercel-domain>`. The home page shows the API and database status.

## Updating

Push to `main`. Vercel and Railway both rebuild automatically, and Railway runs `migrate --force` before switching over.

## Later: Reverb (Phase 3)

Vercel rewrites don't proxy WebSockets, so browsers connect to Reverb directly on its own Railway domain.

1. Add a second service to the Railway project from the same repo:
   - **Root Directory**: `backend`
   - **Custom Start Command**: `php artisan reverb:start --host=0.0.0.0 --port=$PORT`
   - Clear the health check path and pre-deploy command for this service, since Reverb doesn't serve `/up`.
   - Copy the API service's variables. **Generate Domain** gives you `<reverb-domain>`.
2. Run `php artisan reverb:install` locally to generate `REVERB_APP_ID`, `REVERB_APP_KEY` and `REVERB_APP_SECRET`, then set them on **both** services.
3. On the API service, set `BROADCAST_CONNECTION=reverb`. Laravel reaches Reverb over Railway's private network:

   ```dotenv
   REVERB_HOST=<reverb-service>.railway.internal
   REVERB_PORT=<the PORT the Reverb service listens on>
   REVERB_SCHEME=http
   ```

4. In Vercel → **Environment Variables**, add the following, then redeploy:

   ```dotenv
   VITE_REVERB_APP_KEY=<REVERB_APP_KEY>
   VITE_REVERB_HOST=<reverb-domain>
   VITE_REVERB_PORT=443
   VITE_REVERB_SCHEME=https
   ```

   Channel auth (`/broadcasting/auth`) still goes through the Vercel rewrite.

## Checks

- Reload a deep link such as `https://<vercel-domain>/join/ABCD`. It should load the SPA, not a 404.
- Create a room on a phone using mobile data, then join from another phone on a different network by scanning the QR code.
- Connect a laptop as the display, then search, add, play and skip a song.
