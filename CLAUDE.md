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

### Macro Beta Signal — router prefix `/api/v1/macro-beta`
All endpoints take `?universe=sp500|smid` (default sp500; smid = Russell 2000 variant,
identical rules with the credit latch on HY OAS — model doc §3.4):
- `latest` — current state + component readings (credit label per universe)
- `timeline` — weekly-downsampled 1973+ state + index level (the universe's own index)
- `components-history?months=` — daily component series for sparklines
- `episodes` — drawdown report card (dd_threshold 0.15 sp500 / 0.20 smid)
- `stats` — cost-of-insurance stats by window + dial_* summary rows
- `dial-sim` — hypothetical dial portfolios (0.4/0.5/0.7), monthly-downsampled
- `health` — input freshness (universal) + recent pipeline runs
The /macro-beta page has a universe toggle; backed by `macro_signal.*` tables keyed by
`universe`. API changes need the manual droplet `git pull + restart skypilot-api`.

All under `/api/v1/research/`:

### P01 Factor Quintile Analysis
- `p01/scorecard?universe=sp500|russell2500` — P01 factor scorecard (64 factors; default: sp500)
- `p01/factor/{name}/detail?universe=sp500|russell2500` — rolling IC + quintile returns for one factor

### P02 Alpha Models
- `models/scorecard?universe=sp500|russell2500` — alpha model scorecard (sp500: N* only; russell2500: NR* only). The legacy M*/MR* zoo was built on bad/pre-audit data and has been purged from the DB.
- `models/ic-correlation` — pairwise IC correlation matrix (base models only, S&P 500)
- `models/{id}/ic` — monthly IC series
- `models/{id}/quintiles` — quintile returns
- `models/{id}/stability` — rank autocorr + transition matrices
- `models/{id}/feature-importance` — SHAP feature importance
- `models/{id}/sector-summary` — per-sector IC breakdown

### L2 Portfolios (optimized backtests) — router prefix `/api/v1/portfolio` (NOT `/research`)
- `portfolio/backtests?universe=&strategy=&variant=&model=` — filterable registry (meta + summary)
- `portfolio/backtests/{label}` — one backtest: meta + monthly series (cum return, drawdown)
- `portfolio/backtests/{label}/holdings` — latest-rebalance holdings (weight + trade)
- `portfolio/backtests/{label}/sector-allocation` — latest portfolio weight by sector

Backed by `portfolio.*` + `optimizer.*` DB tables. Needs `GRANT SELECT ... TO skypilot_app` in prod;
`api/routers/portfolio.py` is a NEW router, so the droplet needs the manual `git pull + restart
skypilot-api` for these endpoints to exist.

## Research UI (decision hub)

The whole authenticated app lives under the route group `app/(app)/` — the app shell (fixed
sidebar + top bar; only `<main>` scrolls). `/login` sits on the bare root layout (no chrome). The
research section is a decision hub with a persistent layer switch (Factors P01 · Alpha Models P02 ·
Portfolios L2) + a universe toggle (S&P 500 / Russell 2500), rendered by `research/ResearchNav.tsx`.

Pages:
- `/research/factors` · `/research/r2500-factors` — Factor Quintile Analysis (P01)
- `/research/models` · `/research/r2500-models` — Alpha Models (P02)
- `/research/portfolios?u=sp500|r2500` — Layer-2 optimized-backtest hub (Sweep Explorer / Browse /
  Compare Models tabs), with a per-backtest drill-down report at `/research/portfolios/[label]`

Scroll architecture (LOCKED — do not revert to whole-page scroll): fixed-height frame via
`h-screen overflow-hidden` → `flex-1 min-h-0 overflow-y-auto`, with `min-h-0` at EVERY flex level.
On the master-detail pages the chrome (condensed one-line page header + info bars) is frozen; the
list pane and the detail pane each scroll independently — never the whole page. Density is
"Balanced": tight spacing/headings, data numbers kept ≥11px, charts ~240–250px tall.

Compare Models tab: holds ONE standard config fixed (no dropdown — S&P 500 hard/te5/sec5/turn30%,
R2500 …/turn60%, picked by `defaultCompareConfig`) and compares every model that ran that config:
a "Models compared" description key (from `models/scorecard` — the P02 descriptions are the single
source of truth), a metrics table, a metric-vs-metric scatter with Y/X axis pickers, and interactive
rolling IR / batting / excess-return charts (12/24/36M) + a cumulative reference, all driven by
shared model-visibility chips. TO ADD A MODEL to the comparison: run its Layer-2 optimizer backtest
at the standard config ONLY — `Code_Repo/alpha/backtest_configs/<model>_<uni>_sweep_hard.yaml` with
a single `max_turnover` (0.30 SP500 / 0.60 R2500), then `python -m scripts.run_optimizer_backtest
--config … --persist` self-registers it and it appears automatically (Compare groups by
variant|strategy|te|sec|to; needs the model's `optimizer.expected_returns` to exist first).

Model naming: S&P 500 generation = M*/N*; Russell 2500 generation = the same IDs R-prefixed
(MR*/NR*). Current production generation = N*/NR* (53-factor superset + new-data block).
The `models/scorecard` universe filter: `russell2500` = NR* only, `sp500` = neither MR* nor NR*
(i.e. M* + N*). Legacy MR* are hidden — never rebuilt on corrected data (built_from=
'legacy-pre-audit'), superseded by NR*. M* WERE rebuilt on clean data so they stay on SP500.

## Theme — "Warm Ivory" (light)

Whole-site theme defined in `app/globals.css` as CSS variables on `:root` (used via Tailwind
arbitrary values like `bg-[var(--panel)]` and the semantic classes `.panel/.kpi/.pill*/.dtable/
.takeaway/.chip-btn`). Switched from the old dark "Institutional Blue" to a light warm-ivory palette
(2026-07): `--bg #f3eee4` (ivory canvas), `--panel #fffdf9` (warm-white cards), `--border-soft
#e7ddcd`, `--tx #26303c` (charcoal-navy text), `--tx-mut #5f5a50`, `--tx-dim #857c6d`, `--teal
#0e7c6f` (brand accent), `--cyan #1e40af` (navy secondary), `--pos #15803d`, `--neg #b91c1c`,
`--amber #b45309`. Hand-rolled SVG charts read these variables (stroke/fill = `var(--…)`) so they
follow the theme automatically; the quintile ramp is `#dc2626/#ea580c/#64748b/#0d9488/#16a34a`
(red→green, light-legible). To re-theme, swap the variable VALUES — layout/components are
palette-agnostic. Text on the teal accent is `#fffdf9` (cream), never near-black.
