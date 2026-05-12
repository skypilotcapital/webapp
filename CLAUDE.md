# Webapp Development Notes

## Deployment Architecture

**Frontend** — Next.js, hosted on Vercel.
- Auto-deploys on every push to `main` branch on GitHub.
- No manual step needed after `git push`.

**Backend** — FastAPI, running as `skypilot-api` systemd service on the DigitalOcean droplet (165.22.47.36) at `/root/webapp/`.
- Does **NOT** auto-deploy. Must be updated manually after any changes to `api/`.
- After pushing to GitHub, run:
  ```bash
  ssh droplet "cd /root/webapp && git pull origin main && systemctl restart skypilot-api && systemctl is-active skypilot-api"
  ```
- If the site shows stale API behaviour or missing endpoints after a push, this is always the first thing to check.

## Research Schema Access

- DB user for the API: `skypilot_app` (not `skypilot_user`)
- Has `USAGE + SELECT` on the `research` schema only
- New `research.*` tables need an explicit `GRANT SELECT ON <table> TO skypilot_app`
- The compute scripts (`compute_research_tables.py`, `compute_ic_correlation.py`, etc.) handle grants automatically

## Key Endpoints

All under `/api/v1/research/`:
- `p01/scorecard` — P01 factor scorecard
- `p01/factor/{name}/detail` — rolling IC + quintile returns for one factor
- `models/scorecard` — alpha model scorecard (all models)
- `models/ic-correlation` — pairwise IC correlation matrix (base models only)
- `models/{id}/ic` — monthly IC series
- `models/{id}/quintiles` — quintile returns
- `models/{id}/stability` — rank autocorr + transition matrices
- `models/{id}/feature-importance` — SHAP feature importance
- `models/{id}/sector-summary` — per-sector IC breakdown
