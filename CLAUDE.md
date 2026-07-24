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
- `portfolio/backtests?universe=&strategy=&variant=&model=` — filterable registry (meta + summary).
  **Defaults to the v2 risk model only** (risk_model_v2 adoption); the spent-holdout `_full` books are
  excluded from this list (they're fetched by-label on the Portfolios tracking pages). `include_v1=true`
  restores the retired v1 twins; `production=true` returns just the two is_production finalists. NB: v2
  labels carry the version tag AFTER the variant (`..._sweep_hard_v2_...`); the alpha registry's
  `parse_label` lifts the single-digit `v\d` token (like `rc{aum}`) so variant/experiment/is_hard/ab_twin
  parse correctly — if v2 rows ever show variant='bare' with a `*_hard_v2` experiment, that parser
  regressed and the hub's hard-keyed views (Sweep/Compare/A-B) will be empty.
- `portfolio/backtests/{label}` — one backtest: meta + monthly series (cum return, drawdown)
- `portfolio/backtests/{label}/holdings` — latest-rebalance holdings (weight + trade). Long-only rows
  also carry `benchmark_weight` (cap-weight in the universe) + `active_weight` (weight − benchmark);
  L/S leaves them null (market-neutral vs cash).
- `portfolio/backtests/{label}/sector-allocation` — latest portfolio weight by sector; long-only also
  returns `benchmark_weight` + `active_weight` per sector (portfolio-vs-benchmark bars on the report).
  Benchmark = cap-weighted universe at the rebalance date (SP500 = live `secmaster.constituents`,
  R2500 = `research.r2500_band` mcap-rank 501–3000), market cap from `clean.prices`. The date bind is
  split into distinct param names so it survives the Windows pg8000 dev driver (repeated-param bug).
- `portfolio/backtests/{label}/attribution` — factor attribution: time-aggregated summary per factor
  (avg active exposure, annualized return contribution, % of active return, t-stat, % of active risk)
  incl. `specific` (stock selection) + `total`, plus the latest-rebalance active exposures. Reads
  `portfolio.attribution_summary` + `portfolio.attribution`. 404 (section hidden) for labels without
  attribution or whose stored weights don't reconcile (stale pre-shorts-fix L/S).
- `portfolio/backtests/{label}/attribution/timeseries` — cumulative (arithmetic) return contribution by
  group (Specific / Style / Sector / Market) for the stacked cumulative chart.
- `portfolio/backtests/{label}/cost-attribution?aum=5` — the NET-OF-COST return bridge: gross active
  return minus each realistic cost component (bid–ask spread / market impact / IBKR-Fixed commission /
  borrow) = net active, under the per-name trading cost model at `aum` $M (site default 5). Returns a
  summary row (annualized drags, gross/net IR, avg one-way bps by component, % of gross kept) + a
  monthly cumulative gross-vs-net series. Reads `portfolio.cost_attribution(_summary)`. 404 (section
  hidden) for labels not re-priced at that AUM. DISTINCT from `/attribution` (factor / source-of-alpha).

**Realistic-cost numbers (2026-07-08):** the browse grid + report NET return/IR now reflect the
**realistic per-name trading cost model at $5M AUM** (not flat 5bps). The registry summary reads
`COALESCE(portfolio_net_rc, portfolio_net)` — flat-cost `portfolio_net`/`tc_cost` are retained in the
DB, just not displayed. Rebuild via `alpha/scripts/build_cost_attribution.py --aum 5`. The `_rc25`
Stage-2 analysis labels were retired from the browse grid.

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
  Compare Models tabs), with a per-backtest drill-down report at `/research/portfolios/[label]`. The
  report includes a **Factor Attribution** section (`AttributionSection`): the source-of-alpha
  decomposition — how much of the active return is stock selection (specific) vs factor/sector tilts —
  built from `portfolio.attribution*`, AND a **Net-of-Cost Bridge** section (`CostBridgeSection`): the
  gross→net waterfall (gross active − spread − impact − commission − borrow = net) at $5M AUM, built
  from `portfolio.cost_attribution*` via `/cost-attribution`. Long-only shows per-name/-sector
  benchmark active weights in Top Holdings + Sector Allocation; L/S shows Top Longs/Shorts + net
  sector exposure.

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

## Portfolios (production tracking) — `/portfolios` (2026-07-21)

Strategy-centric **tracking** surface, separate from the in-sample Research hub (Research = choose ·
Portfolios = track). New top-level sidebar item `/portfolios` → landing with one card per `is_production`
finalist (SP500 N014 LO · R2500 NR012 L/S): in-sample 2005–2023 headline + labeled OOS live-to-date +
full-track spark with an in-sample/OOS boundary. Card → `/portfolios/[strategy]` (`sp500` | `r2500-ls`),
which renders the **modeled-paper track** = the `*_LOCKED_v2_full` label (the book continued out-of-sample
to 2026-03) with a track selector (Modeled paper now; IBKR paper / Live = "soon"). `lib/products.ts` = the
2-product config (slug / universe / strategy + `fullLabelOf` / `slugForRow` helpers; `INSAMPLE_END` boundary).

- **Report component extracted:** the per-backtest report body now lives in
  `components/portfolio/BacktestReport.tsx` (props: `label, backHref, backLabel, periodLabel, boundaryDate,
  topSlot`). BOTH the research drill-down (`research/portfolios/[label]`, a thin wrapper) and the portfolios
  strategy pages reuse it. Charts (`charts.tsx`) gained an optional `boundaryDate` marker.
- **New API (`api/routers/portfolio.py`):** `?production=true` filter on `/backtests`;
  `/backtests/{label}/neutrality` (F2 — net dollar Σwᵢ + net beta Σwᵢ·βᵢ from `portfolio.weights` ⋈
  `factor.risk_exposures.beta_60m`; full window); `/backtests/{label}/credited-return?haircut_bps=50` (T9 —
  collateral-credited investor excess vs net-vs-cash; long-short only, 404 otherwise).
- **L/S report adds** (in `BacktestReport`, `isLS`-gated): **Collateral-Credited Return** (T9, 50bps
  surfaced haircut) + **Market-Neutrality** (F2, net-dollar & net-beta small-multiple).
- **Data:** modeled-paper `_full` labels got $5M cost-attribution (`build_cost_attribution --like
  '%LOCKED_v2_full%' --exec-cap 0.20 --min-trade 2000`); the 2 production labels got in-sample
  factor-attribution (`build_attribution --label … --end 2023-12-31` → CSV → droplet psql load), restoring
  the AttributionSection for the v2 finalists (factor_returns stops at 2023 → attribution is in-sample only).
- Ongoing auto-update of the paper track + the IBKR track = the deferred production/live-ops phase (B).
  Plan: `Main/Planning/technical/website_research_hub_IA_2026-07.md` 2026-07-20 addendum.

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
