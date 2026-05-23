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

### P01 Factor Quintile Analysis
- `p01/scorecard?universe=sp500|russell2500` — P01 factor scorecard (64 factors; default: sp500)
- `p01/factor/{name}/detail?universe=sp500|russell2500` — rolling IC + quintile returns for one factor

### P02 Alpha Models
- `models/scorecard?universe=sp500|russell2500` — alpha model scorecard (sp500: M* models; russell2500: MR* models)
- `models/ic-correlation` — pairwise IC correlation matrix (base models only, S&P 500)
- `models/{id}/ic` — monthly IC series
- `models/{id}/quintiles` — quintile returns
- `models/{id}/stability` — rank autocorr + transition matrices
- `models/{id}/feature-importance` — SHAP feature importance
- `models/{id}/sector-summary` — per-sector IC breakdown

## Research UI (4-tab layout)

Research page has 4 flat tabs under `/research/`:
- `/research/factors` — S&P 500 Factor Quintile Analysis (P01, universe=sp500)
- `/research/models` — S&P 500 Alpha Models (P02, universe=sp500, model_id prefix M*)
- `/research/r2500-factors` — Russell 2500 Factor Quintile Analysis (P01, universe=russell2500)
- `/research/r2500-models` — Russell 2500 Alpha Models (P02, universe=russell2500, model_id prefix MR*)
