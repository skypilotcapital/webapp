// The strategies tracked forward in the Portfolios section.
// Each strategy is followed across implementation "tracks" of increasing realism:
//   backtest (Research, in-sample) → modeled paper (here) → IBKR paper → live.
// IBKR / live are future tracks that drop onto the SAME strategy page (see the
// 2026-07-20 addendum in website_research_hub_IA_2026-07.md) — not new sections.
//
// PRODUCTION = THE BOOK WE HOLD, and nothing else (owner, 2026-08-02, `[10-OT7]`).
// Exactly one label carries `is_production`: the te6-sleeve S&P 500 Extension, the book traded in
// the IBKR paper account. Everything else here — including the N014 core and the te6 R2500 L/S
// sleeve that the traded extension is BUILT FROM — is a production candidate. They are not lesser
// books; the flag simply answers "what do we hold?", not "what have we locked". All of them
// continue to rebuild monthly (`monthly_production_run.BOOKS` / `build_blend_portfolio.BLENDS`);
// the flag has never gated that.
//
// The ★ Production badge on the landing page is derived from the DB feed, NOT from `track` below —
// so the flag and the site cannot drift apart again, which is the defect `[10-OT7]` existed to fix.

import type { PortfolioBacktest } from '@/types/api';

export interface ProductDef {
  slug: string;
  name: string;
  short: string;
  universe: string;   // 'sp500' | 'r2500'
  strategy: string;   // 'long_only' | 'long_short'
  blurb: string;
  // 'production' = the traded book (is_production; exactly one) · 'candidate' = a Production
  // Candidate — locked-and-tracked but not held, which since 2026-08-02 includes the traded book's
  // own core and sleeve · 'research' = paper/exploratory.
  // NB the landing badge comes from the DB production feed; this drives ordering + report copy.
  track?: 'production' | 'candidate' | 'research';
  fullLabel?: string;                 // explicit modeled-paper _full label (research tracks: fullLabelOf can't derive it)
  // Explicit is_production label. REQUIRED whenever two products share (universe, strategy) — the
  // R2500 L/S book now ships at two vol targets (te6 and te8), so the universe+strategy heuristic
  // below is no longer 1:1 and would send both cards to the same page.
  prodLabel?: string;
  // COST-ACCOUNTING lens for this track, in $M — the `aum` passed to /cost-attribution, and the
  // number printed on the report's AUM pills. MUST equal `portfolio.returns.rc_aum_musd` for the
  // label, or the card headline (which reads `portfolio_net_rc`) and the Net-of-Cost Bridge would
  // quote two different fund sizes for the same book. Defaults to 5 where omitted.
  // NB this is the ACCOUNTING lens only; CONSTRUCTION AUM is a config property (the traded
  // extension builds its sleeves at $1M and its cost-aware core at $5M — see the banner in
  // build_blend_portfolio.BLENDS and the 2026-08-06 decisions_log entry).
  costAum?: number;
}

export const PRODUCTS: ProductDef[] = [
  {
    // THE CORE of the traded extension (held there at 1.0×). Demoted from is_production 2026-08-02
    // (`[10-OT7]`) — still config-locked, still rebuilt monthly, simply not a book we hold standalone.
    slug: 'sp500', name: 'S&P 500 · Long-Only', short: 'S&P 500 LO',
    universe: 'sp500', strategy: 'long_only', track: 'candidate',
    // v3 (2026-08-06): F-018 price restatement + the `[05-MINP]` re-lock. ⚠️ `_v3_full_rc5` is the
    // canonical core — `n014_..._relcap_v3_full_rc1` ALSO exists and is the REJECTED $1M-construction
    // diagnostic arm (IR 0.454 vs 0.652). trading/config.py names the rc5 label; keep them equal.
    fullLabel: 'n014_sp500_LOCKED_relcap_v3_full_rc5_lam0.5_te3_sec3_tonone',
    blurb: 'The equity core of the S&P 500 Extension, tracked standalone. Cost-aware N014 (70/30 1M/3M blend) · TE 3% · sector ±3% · net of realistic cost @ $5M.',
  },
  {
    // The DRAWDOWN-MANAGED standalone market-neutral product. Same signal and construction as the
    // te8 book below — the vol target is the difference, and it was deliberately chosen as the
    // drawdown lever (user, 2026-07-17). Always name the vol target when referring to "the R2500 L/S".
    // THE SLEEVE of the traded extension (held there at 0.5×), since `[10-SLV]` locked te6 over te8
    // for the first paper book. Demoted from is_production 2026-08-02 (`[10-OT7]`) for the same
    // reason as the core: it is a component of the held book, not a book we hold standalone.
    slug: 'r2500-ls', name: 'Russell 2500 · Long-Short (6% vol)', short: 'R2500 L/S 6%',
    universe: 'r2500', strategy: 'long_short', track: 'candidate',
    // v3 (2026-08-06): carries the `[05-MINP]` anchored min_position floor + F-018-corrected prices.
    fullLabel: 'nr012_r2500_ls_LOCKED_v3_full_rc1_lam2.0_te6_sec10_to20',
    blurb: 'The portable-alpha sleeve of the S&P 500 Extension, tracked standalone. Market-neutral NR012 (50/50 blend) · 6% vol target · dollar- & sector-neutral. The drawdown-managed variant: shallower max drawdown than the 8% book, lower return.',
  },
  {
    // SAME signal + SAME construction as the 6% book above; the ONLY parameter that differs is the
    // vol target (8% vs 6%). Promoted to is_production 2026-07-30 as the then-sleeve of the S&P 500
    // Extension; demoted 2026-08-02 (`[10-OT7]`) when `[10-SLV]` chose te6 for the traded book. It
    // stays config-locked and monthly-rebuilt: it is the sleeve of the te8 extension twin, and the
    // te6-vs-te8 comparison only stays live while both books keep running.
    slug: 'r2500-ls-te8', name: 'Russell 2500 · Long-Short (8% vol)', short: 'R2500 L/S 8%',
    universe: 'r2500', strategy: 'long_short', track: 'candidate',
    fullLabel: 'nr012_r2500_ls_te8_LOCKED_v3_full_rc1_lam2.0_te8_sec10_to20',
    blurb: 'Market-neutral NR012 (50/50 blend) · 8% vol target · dollar- & sector-neutral. Same signal and construction as the 6% book, run hotter: higher return and deeper drawdowns. The sleeve of the te8 extension twin.',
  },
  {
    // RESEARCH/PAPER track (not a launch product): promoted 2026-07-28. R2500 long-only.
    // See Main/Planning/research/r2500_long_only_paper_track_2026-07.md
    slug: 'r2500-lo', name: 'Russell 2500 · Long-Only', short: 'R2500 LO',
    universe: 'r2500', strategy: 'long_only', track: 'research',
    // v3 (2026-08-07): rebuilt on F-018-corrected prices. The track got WORSE and that is the honest
    // number — IR 0.382 → 0.250, the whole decline in 2024–26, the window F-018 corrupted. The old
    // vintage's record was partly fabricated by unadjusted splits/dividends/spinoffs.
    fullLabel: 'nr014_r2500_lo_LOCKED_v3_full_rc5_lam0.5_te3_secoff_tonone',
    blurb: 'Research track · NR014 (70/30 blend) · TE 3% · ~150 names · net of realistic cost @ $5M. Thin net; long-only small-cap, not a launch product.',
  },
  {
    // The te8-sleeve TWIN of the traded extension. Was is_production 2026-07-29 → 2026-08-02, when
    // `[10-SLV]` chose the te6 sleeve for the first paper book and `[10-OT7]` moved the flag to it.
    // Kept as a first-class candidate: te8 wins the full-period average (16.5%/yr, IR 0.97 vs te6's
    // 15.4%/0.88) and losing that comparison would hide what the te6 choice actually costs.
    slug: 'sp500-ext', name: 'S&P 500 · Extension 150/50 (te8 sleeve)', short: 'S&P 500 Ext · te8',
    universe: 'sp500', strategy: 'ext', track: 'candidate',
    fullLabel: 'ext_sp500_n014_te8_150_50_v3_full_rc1', costAum: 1,
    blurb: 'Production candidate · te8 (8% vol) sleeve twin of the traded extension · same N014 core + 50% R2500 L/S overlay · benchmarked to S&P 500 TR · net of realistic cost @ $1M. Higher average return than the te6 book we trade, but more exposed to a 2025-style junk rally.',
  },
  {
    // ★ THE PRODUCTION BOOK — the portfolio held in the IBKR paper account, and the only label
    // carrying is_production (`[10-SLV]` locked the te6 sleeve 2026-08-02; `[10-OT7]` moved the flag).
    // 150/50: S&P 500 long-only core (N014) at 1.0× + the R2500 L/S te6 sleeve at 0.5× as portable
    // alpha, benchmarked to S&P 500 TR. Chosen over te8 knowing it costs ~1 pt/yr on the full-period
    // average: te8 amplifies the sleeve's regime bet both ways and was materially worse through the
    // 2025 junk rally (blend 2025: te6 +13.4% vs te8 +10.4%), which is both spent holdout AND this
    // strategy's documented failure mode. A first live book that is deliberately drawdown-managed
    // through the one regime we know breaks it. See r2500_ls_extension.md §5c.
    slug: 'sp500-ext-te6', name: 'S&P 500 · Extension 150/50 (te6 sleeve)', short: 'S&P 500 Ext · te6',
    universe: 'sp500', strategy: 'ext', track: 'production',
    fullLabel: 'ext_sp500_n014_te6_150_50_v3_full_rc1', costAum: 1,
    blurb: 'The book we trade · 150/50 extension: S&P 500 core (N014) + 50% R2500 L/S sleeve at the te6 (6% vol, drawdown-managed) target as a portable-alpha overlay · benchmarked to S&P 500 TR · net of realistic cost @ $1M (the paper-account size). Enhanced-equity: full equity drawdowns, alpha layered on top.',
  },
  {
    // RESEARCH/PAPER — same-universe 130/30 extension: R2500 long-only core + a 50% R2500 L/S overlay.
    // Benchmarked to Russell 2000 TR. See r2500_ls_extension_analysis_2026-07.md.
    slug: 'r2500-ext', name: 'Russell 2500 · Extension 150/50', short: 'R2500 Ext',
    universe: 'r2500', strategy: 'ext', track: 'research',
    fullLabel: 'ext_r2500_nr014_te8_150_50_v3_full_rc5',
    blurb: 'Research track · 150/50 extension: R2500 core (NR014) + 50% R2500 L/S sleeve (te8) · same universe · benchmarked to Russell 2000 TR · net of realistic cost @ $5M. Enhanced-equity, full equity drawdowns.',
  },
];

const slugFor = (universe: string | null, strategy: string | null) =>
  universe === 'r2500' && strategy === 'long_short' ? 'r2500-ls'
    : universe === 'sp500' && strategy === 'long_only' ? 'sp500'
    : strategy === 'ext' ? `${universe}-ext`
    : `${universe}-${strategy === 'long_short' ? 'ls' : 'lo'}`;

// Match on an EXPLICIT label first — `prodLabel` or `fullLabel`. The universe+strategy heuristic below
// stopped being 1:1 when the R2500 L/S book shipped at two vol targets (te6 + te8), and again when the
// S&P 500 Extension shipped te6 + te8 twins: the production row IS the te6 ext's `fullLabel` (a
// materialized blend has no separate in-sample twin), so a prodLabel-only match fell through to
// slugFor('sp500','ext') and pointed the traded book at the te8 card.
export const slugForRow = (r: Pick<PortfolioBacktest, 'universe' | 'strategy'> & { model_label?: string }) =>
  (r.model_label && PRODUCTS.find((p) => p.prodLabel === r.model_label || p.fullLabel === r.model_label)?.slug)
  || slugFor(r.universe, r.strategy);

export const productForSlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

// Derive the modeled-paper "full" label from an in-sample production label by splicing in `_full`.
// ⚠️ CURRENTLY UNREACHABLE and left deliberately un-updated for v3: every product above now carries an
// explicit `fullLabel`, so `portfolios/[strategy]` short-circuits before this runs. The v3 rebuild also
// produced NO in-sample twins (every v3 label is `_v3_full_*`), so there is nothing for this to map.
// If a product ever ships without `fullLabel` again, this needs a `_v3_` case before it is trusted.
export const fullLabelOf = (prodLabel: string) =>
  prodLabel.includes('_LOCKED_relcap_')
    ? prodLabel.replace('_LOCKED_relcap_', '_LOCKED_relcap_full_')
    : prodLabel.replace('_LOCKED_v2_', '_LOCKED_v2_full_');

// In-sample / out-of-sample boundary for the modeled-paper track.
export const INSAMPLE_END = '2023-12-31';
