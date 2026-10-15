# Health Dashboard

English | [日本語](README_ja.md)

A local health dashboard that pulls steps, sleep, heart rate and more from the [Google Health API](https://developers.google.com/health) (v4) and charts them.
It starts with a single `docker compose up`.

```
Browser → frontend (nginx, :3000) → backend (FastAPI) → health.googleapis.com
```

> The UI is in Japanese.

## Quick start (demo data)

```bash
docker compose up -d --build
```

Open http://localhost:3000. Without a `.env` file the app runs on **demo data**, so you can try the UI before setting anything up on Google's side.

## Showing your own data

### 1. Set up Google Cloud

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/) (an existing one works too).
2. Enable the **Google Health API** under **APIs & Services → Library**.
3. Configure the OAuth consent screen under **Google Auth Platform → Branding / Audience**.
   - User type "External" with publishing status "Testing" is fine.
   - Add the Google account whose data you want to view as a **test user**.
4. Add these scopes under **Google Auth Platform → Data Access**:
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
   - `.../auth/googlehealth.sleep.readonly`
5. Create an OAuth client ID under **Google Auth Platform → Clients**:
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3000/auth/callback`

See the official [Set up Google Cloud and OAuth](https://developers.google.com/health/setup) guide for details.

### 2. Create `.env` and restart

```bash
cp .env.example .env
# fill in GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
docker compose up -d
```

Open http://localhost:3000 and authorize with the `Google でログイン` (Sign in with Google) button. Your own data then appears on the dashboard.
Weight is hidden by default and is not fetched at all. Tick `体重を表示` (Show weight) in the header to show it; the choice is saved in the browser.

> Your data must be synced to the Google Health (formerly Fitbit) app from a Fitbit, Pixel Watch, or similar device.

## Metrics

| Metric | Data type | Method |
| --- | --- | --- |
| Steps | `steps` | `dataPoints:dailyRollUp` |
| Distance | `distance` | `dataPoints:dailyRollUp` |
| Calories burned | `total-calories` | `dataPoints:dailyRollUp` (split into 14-day requests) |
| Heart rate (avg / min / max) | `heart-rate` | `dataPoints:dailyRollUp` (split into 14-day requests) |
| Active zone minutes | `active-zone-minutes` | `dataPoints:dailyRollUp` |
| Weight (only when "Show weight" is on) | `weight` | `dataPoints:dailyRollUp` |
| Resting heart rate | `daily-resting-heart-rate` | `dataPoints.list` |
| Heart rate variability (HRV) | `daily-heart-rate-variability` | `dataPoints.list` |
| Blood oxygen (SpO2) | `daily-oxygen-saturation` | `dataPoints.list` |
| Sleep (by stage) | `sleep` | `dataPoints.list` |

Each metric is fetched independently, so a missing scope or missing data only affects that metric; the others still render, and the reason for each failure is shown at the top of the page.

## Project layout

```
.
├── docker-compose.yml
├── .env.example
├── backend/            # FastAPI: OAuth, Google Health API calls, data shaping
│   └── app/
│       ├── main.py           # routes (/api/*, /auth/*)
│       ├── oauth.py          # authorization code flow, token storage / refresh
│       ├── google_health.py  # Google Health API client
│       ├── metrics.py        # per-metric fetching and normalization
│       └── demo.py           # demo data generator
└── frontend/           # React + Recharts, served by nginx, which proxies /api and /auth to the backend
```

### API

| Endpoint | Description |
| --- | --- |
| `GET /api/status` | Run mode (`demo` / `live`) and auth state |
| `GET /api/dashboard?days=14` | All metrics in one response (`weight=true` includes weight, `refresh=true` bypasses the cache) |
| `GET /auth/login` | Redirects to Google's consent screen |
| `GET /auth/callback` | Exchanges the authorization code for tokens and stores them |
| `POST /auth/logout` | Revokes and deletes the stored tokens |

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | none | Demo mode when unset |
| `APP_BASE_URL` | `http://localhost:3000` | URL you open in the browser. The redirect URI is `${APP_BASE_URL}/auth/callback` |
| `PORT` | `3000` | Host port (if you change it, update `APP_BASE_URL` and the redirect URI too) |
| `TZ` | `Asia/Tokyo` | Time zone used to split days |
| `DEMO_MODE` | auto | `true` always serves demo data |
| `CACHE_TTL_SECONDS` | `300` | How long API results are cached, in seconds |

## Security

- Built for a single user on a local machine. Access and refresh tokens are stored in `token.json` on the `backend-data` Docker volume, and **anyone who can reach the app can read that account's data**. Do not expose it to the internet.
- Only read-only scopes are requested.
- To remove the tokens completely, press `接続解除` (Disconnect) in the UI, or delete the volume with `docker compose down -v`.

## Development

### Trying the UI with demo data

Once signed in, the app never shows demo data. To try the UI, start a separate demo-mode instance on port 3001 (it does not touch the instance on port 3000 or its tokens):

```bash
DEMO_MODE=true PORT=3001 docker compose -p health-dashboard-demo up -d --build
# when you're done
docker compose -p health-dashboard-demo down -v
```

### Running without Docker

```bash
# backend
cd backend && pip install -r requirements.txt
DATA_DIR=./.data uvicorn app.main:app --reload

# frontend (in another terminal; /api and /auth are proxied to localhost:8000)
cd frontend && npm install && npm run dev
```

When running the frontend with `npm run dev`, set `APP_BASE_URL=http://localhost:5173` and also add `http://localhost:5173/auth/callback` as a redirect URI.
