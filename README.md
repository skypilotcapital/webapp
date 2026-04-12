# SkyPilot Capital — Web App

Internal dashboard for the SkyPilot Capital team. Monorepo containing the FastAPI backend and Next.js frontend.

```
Team browser → Vercel (Next.js) → FastAPI on droplet (port 8000) → PostgreSQL
```

**Live deployment:** https://webapp-tau-swart.vercel.app

## Repository Structure

```
webapp/
├── api/                         ← FastAPI backend (Python)
│   ├── main.py                  — app entry point, CORS, router registration
│   ├── config.py                — settings loaded from api/.env
│   ├── db.py                    — SQLAlchemy connection pool
│   ├── routers/
│   │   ├── health.py            — GET /health
│   │   └── data_monitor.py      — Panel 1: data monitor endpoints
│   ├── requirements.txt         — Python dependencies
│   └── .env.example             — template — copy to .env and fill in
├── frontend/                    ← Next.js frontend (deployed on Vercel)
│   ├── app/
│   │   ├── layout.tsx           — root layout with header/nav
│   │   ├── page.tsx             — home page: 3 panel cards
│   │   └── monitor/page.tsx     — Panel 1: data monitor page
│   ├── components/
│   │   ├── monitor/             — 4 section components (auto-refresh via SWR)
│   │   └── ui/                  — Card, Badge primitives
│   ├── lib/
│   │   ├── api.ts               — typed fetch functions
│   │   └── utils.ts             — formatters, color helpers
│   ├── types/api.ts             — TypeScript interfaces matching backend models
│   └── next.config.ts           — Vercel proxy rewrite (avoids mixed content)
├── deploy/
│   └── skypilot-api.service     — systemd unit (already installed on droplet)
├── .gitignore
└── README.md
```

---

## Architecture Notes

**Vercel proxy:** The frontend never calls the droplet directly. `next.config.ts` rewrites
`/api-proxy/*` → `http://165.22.47.36:8000/*` server-side on Vercel. This avoids the
browser's mixed content block (HTTPS page → HTTP API). The env var `API_URL` on Vercel
controls the rewrite destination.

**Row counts:** Use `pg_stat_user_tables` estimates rather than `COUNT(*)` — returns
instantly even on 40M+ row tables. Approximate but sufficient for a health dashboard.

**Date indexes:** Single-column date indexes were added to all large tables for fast
`MAX(date)` queries. See decisions_log.md April 12 entry for the full list.

---

## Backend — Local Development

**Prerequisites:** Python 3.11+, SSH tunnel open to the droplet's PostgreSQL on `localhost:5432`.

```bash
cd Code_Repo/webapp

# Create virtual environment inside api/
python3.11 -m venv api/venv
source api/venv/bin/activate        # Windows: api\venv\Scripts\activate

# Install dependencies
pip install -r api/requirements.txt

# Configure environment
cp api/.env.example api/.env
# Edit api/.env — fill in DB credentials

# Run the dev server (run from monorepo root so 'api' is an importable package)
uvicorn api.main:app --reload --port 8000
```

Then open:
- `http://localhost:8000/docs` — interactive Swagger UI (test all endpoints here)
- `http://localhost:8000/health` — health check

---

## Backend — Droplet Operations

**After every push (deploy an update):**
```bash
cd /root/webapp && git pull && systemctl restart skypilot-api
```

**Check logs:**
```bash
journalctl -u skypilot-api -f
```

**Check status:**
```bash
systemctl status skypilot-api
```

---

## Frontend — Vercel Deployment

Vercel auto-deploys on every push to `main`. Settings:
- **Root Directory:** `frontend`
- **Environment variables:**
  - `API_URL=http://165.22.47.36:8000` (server-side, no NEXT_PUBLIC_ prefix)
  - `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` (team password protection)

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB connectivity check |
| GET | `/api/v1/data-monitor/table-status` | MAX(date) + row count for all 11 tables |
| GET | `/api/v1/data-monitor/run-log` | Latest pipeline.run_log entry per step |
| GET | `/api/v1/data-monitor/gap-detection` | Missing trading days (last 90 days) |
| GET | `/api/v1/data-monitor/factor-coverage` | % of S&P 500 with valid factor.scores |

Full interactive docs at `http://165.22.47.36:8000/docs`.

---

## Pending / Future Work

- [ ] DigitalOcean firewall — restrict port 8000 to Vercel egress IPs only
- [ ] Custom domain (e.g. dashboard.skypilotcapital.com) pointing to Vercel
- [ ] Panel 2: Model Research & Analytics (requires alpha model to be running)
- [ ] Panel 3: Portfolio Management & Trading (requires optimizer to be running)
