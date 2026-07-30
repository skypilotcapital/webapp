// The two production strategies tracked forward in the Portfolios section.
// Each strategy is followed across implementation "tracks" of increasing realism:
//   backtest (Research, in-sample) → modeled paper (here) → IBKR paper → live.
// IBKR / live are future tracks that drop onto the SAME strategy page (see the
// 2026-07-20 addendum in website_research_hub_IA_2026-07.md) — not new sections.

import type { PortfolioBacktest } from '@/types/api';

export interface ProductDef {
  slug: string;
  name: string;
  short: string;
  universe: string;   // 'sp500' | 'r2500'
  strategy: string;   // 'long_only' | 'long_short'
  blurb: string;
  // 'production' = a locked is_production finalist · 'candidate' = a Production Candidate
  // (promoted, but not yet config-locked / holdout-disciplined) · 'research' = paper/exploratory
  track?: 'production' | 'candidate' | 'research';
  fullLabel?: string;                 // explicit modeled-paper _full label (research tracks: fullLabelOf can't derive it)
  // Explicit is_production label. REQUIRED whenever two products share (universe, strategy) — the
  // R2500 L/S book now ships at two vol targets (te6 and te8), so the universe+strategy heuristic
  // below is no longer 1:1 and would send both cards to the same page.
  prodLabel?: string;
}

export const PRODUCTS: ProductDef[] = [
  {
    slug: 'sp500', name: 'S&P 500 · Long-Only', short: 'S&P 500 LO',
    universe: 'sp500', strategy: 'long_only', track: 'production',
    prodLabel: 'n014_sp500_LOCKED_relcap_rc5_lam0.5_te3_sec3_tonone',
    blurb: 'Cost-aware N014 (70/30 1M/3M blend) · TE 3% · sector ±3% · net of realistic cost @ $5M.',
  },
  {
    // The DRAWDOWN-MANAGED standalone market-neutral product. Same signal and construction as the
    // te8 book below — the vol target is the difference, and it was deliberately chosen as the
    // drawdown lever (user, 2026-07-17). Always name the vol target when referring to "the R2500 L/S".
    slug: 'r2500-ls', name: 'Russell 2500 · Long-Short (6% vol)', short: 'R2500 L/S 6%',
    universe: 'r2500', strategy: 'long_short', track: 'production',
    prodLabel: 'nr012_r2500_ls_LOCKED_v2_rc5_lam2.0_te6_sec10_to20',
    blurb: 'Market-neutral NR012 (50/50 blend) · 6% vol target · dollar- & sector-neutral. The drawdown-managed variant: shallower max drawdown than the 8% book, lower return.',
  },
  {
    // PRODUCTION (promoted 2026-07-30). SAME signal + SAME construction as the 6% book above; the
    // ONLY parameter that differs is the vol target (8% vs 6%). It is also the overlay engine inside
    // the S&P 500 Extension 150/50 (held there at 0.5×), which is why it had to be config-locked —
    // the extension cannot regenerate monthly unless this book can. See nr012_r2500_ls_te8_LOCKED.yaml.
    slug: 'r2500-ls-te8', name: 'Russell 2500 · Long-Short (8% vol)', short: 'R2500 L/S 8%',
    universe: 'r2500', strategy: 'long_short', track: 'production',
    prodLabel: 'nr012_r2500_ls_te8_LOCKED_v2_rc5_lam2.0_te8_sec10_to20',
    blurb: 'Market-neutral NR012 (50/50 blend) · 8% vol target · dollar- & sector-neutral. Same signal and construction as the 6% book, run hotter: higher return and deeper drawdowns. Also the portable-alpha overlay inside the S&P 500 Extension 150/50.',
  },
  {
    // RESEARCH/PAPER track (not a launch product): promoted 2026-07-28. R2500 long-only.
    // See Main/Planning/research/r2500_long_only_paper_track_2026-07.md
    slug: 'r2500-lo', name: 'Russell 2500 · Long-Only', short: 'R2500 LO',
    universe: 'r2500', strategy: 'long_only', track: 'research',
    fullLabel: 'nr014_r2500_lo_LOCKED_full_rc5_lam0.5_te3_secoff_tonone',
    blurb: 'Research track · NR014 (70/30 blend) · TE 3% · ~150 names · net of realistic cost @ $5M. Thin net; long-only small-cap, not a launch product.',
  },
  {
    // PRODUCTION (promoted 2026-07-29) — 150/50 extension: S&P 500 long-only core + a 50% R2500 L/S
    // overlay (portable alpha), benchmarked to S&P 500 TR. is_production=true (the FIRST IBKR
    // paper-trading candidate). Has an explicit fullLabel (a single materialized-blend track), so it
    // renders via the full-track card, NOT the in-sample/OOS ProductCard shape of the 2 locked
    // optimizer finalists. See r2500_ls_extension_analysis_2026-07.md.
    slug: 'sp500-ext', name: 'S&P 500 · Extension 150/50', short: 'S&P 500 Ext',
    universe: 'sp500', strategy: 'ext', track: 'production',
    fullLabel: 'ext_sp500_n014_te8_150_50_full_rc5',
    blurb: 'Production · 150/50 extension: S&P 500 core (N014) + 50% R2500 L/S sleeve (te8) as a portable-alpha overlay · benchmarked to S&P 500 TR · net of realistic cost @ $5M. Enhanced-equity, full equity drawdowns. First IBKR paper-trading candidate.',
  },
  {
    // RESEARCH/PAPER — same-universe 130/30 extension: R2500 long-only core + a 50% R2500 L/S overlay.
    // Benchmarked to Russell 2000 TR. See r2500_ls_extension_analysis_2026-07.md.
    slug: 'r2500-ext', name: 'Russell 2500 · Extension 150/50', short: 'R2500 Ext',
    universe: 'r2500', strategy: 'ext', track: 'research',
    fullLabel: 'ext_r2500_nr014_te8_150_50_full_rc5',
    blurb: 'Research track · 150/50 extension: R2500 core (NR014) + 50% R2500 L/S sleeve (te8) · same universe · benchmarked to Russell 2000 TR · net of realistic cost @ $5M. Enhanced-equity, full equity drawdowns.',
  },
];

const slugFor = (universe: string | null, strategy: string | null) =>
  universe === 'r2500' && strategy === 'long_short' ? 'r2500-ls'
    : universe === 'sp500' && strategy === 'long_only' ? 'sp500'
    : strategy === 'ext' ? `${universe}-ext`
    : `${universe}-${strategy === 'long_short' ? 'ls' : 'lo'}`;

// Match on the explicit production label FIRST. The universe+strategy heuristic below stopped being
// 1:1 when the R2500 L/S book shipped at two vol targets (te6 + te8) — without this, both production
// rows would resolve to 'r2500-ls' and render as duplicate cards pointing at the same page.
export const slugForRow = (r: Pick<PortfolioBacktest, 'universe' | 'strategy'> & { model_label?: string }) =>
  (r.model_label && PRODUCTS.find((p) => p.prodLabel === r.model_label)?.slug)
  || slugFor(r.universe, r.strategy);

export const productForSlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

// The modeled-paper "full" label = the production finalist continued out-of-sample to
// latest available, i.e. the same label with a `_full` segment. SP500 = the relative-cap
// re-lock (LOCKED_relcap, 2026-07-26); R2500 L/S = LOCKED_v2.
export const fullLabelOf = (prodLabel: string) =>
  prodLabel.includes('_LOCKED_relcap_')
    ? prodLabel.replace('_LOCKED_relcap_', '_LOCKED_relcap_full_')
    : prodLabel.replace('_LOCKED_v2_', '_LOCKED_v2_full_');

// In-sample / out-of-sample boundary for the modeled-paper track.
export const INSAMPLE_END = '2023-12-31';
