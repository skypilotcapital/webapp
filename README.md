# SkyPilot Capital — Web App

Internal dashboard for the SkyPilot Capital team. Monorepo containing the FastAPI backend and Next.js frontend.

```
Team browser → Vercel (Next.js) → FastAPI on droplet (port 8000) → PostgreSQL
```

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
├── frontend/                    ← Next.js frontend (to be built)
├── deploy/
│   ├── skypilot-api.service     — systemd unit (copy to droplet once)
│   └── create_readonly_user.sql — run once in psql to create DB user
├── .gitignore
└── README.md
```

---

## Backend — Local Development

**Prerequisites:** Python 3.11+, SSH tunnel open to the droplet's PostgreSQL on `localhost:5432`.

```bash
cd Code_Repo/webapp

# Create virtual environment inside api/
python -m venv api/venv
source api/venv/bin/activate        # Windows: api\venv\Scripts\activate

# Install dependencies
pip install -r api/requirements.txt

# Configure environment
cp api/.env.example api/.env
# Edit api/.env — fill in DB credentials

# Run the dev server (run from monorepo root so 'api' is a importable package)
uvicorn api.main:app --reload --port 8000
```

Then open:
- `http://localhost:8000/docs` — interactive Swagger UI (test all endpoints here)
- `http://localhost:8000/health` — health check

---

## Backend — Deployment on the Droplet

**One-time setup (run once via SSH):**

```bash
# 1. Create read-only DB user
#    Edit the SQL file first to set a real password, then run:
psql -U postgres -d skypilot -f /root/webapp/deploy/create_readonly_user.sql

# 2. Clone the repo
cd /root
git clone https://github.com/skypilotcapital/webapp.git webapp

# 3. Create virtual environment and install dependencies
cd /root/webapp
python3.11 -m venv api/venv
api/venv/bin/pip install -r api/requirements.txt

# 4. Create .env
cp api/.env.example api/.env
nano api/.env    # fill in DB credentials

# 5. Install and start the systemd service
cp deploy/skypilot-api.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable skypilot-api
systemctl start skypilot-api

# 6. Verify
curl http://localhost:8000/health
```

**After every push (deploy an update):**

```bash
cd /root/webapp && git pull && systemctl restart skypilot-api
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB connectivity check |
| GET | `/api/v1/data-monitor/table-status` | MAX(date) + row count for all 11 tables |
| GET | `/api/v1/data-monitor/run-log` | Latest pipeline.run_log entry per step |
| GET | `/api/v1/data-monitor/gap-detection` | Missing trading days (last 90 days) |
| GET | `/api/v1/data-monitor/factor-coverage` | % of S&P 500 with valid factor.scores |

Full interactive docs at `/docs` when the server is running.

---

## DigitalOcean Firewall

Once the Next.js frontend is on Vercel, restrict port 8000 to Vercel egress IPs only — do not leave it open to the public internet.
