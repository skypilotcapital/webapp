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
}

export const PRODUCTS: ProductDef[] = [
  {
    slug: 'sp500', name: 'S&P 500 · Long-Only', short: 'S&P 500 LO',
    universe: 'sp500', strategy: 'long_only',
    blurb: 'Cost-aware N014 (70/30 1M/3M blend) · TE 3% · sector ±3% · net of realistic cost @ $5M.',
  },
  {
    slug: 'r2500-ls', name: 'Russell 2500 · Long-Short', short: 'R2500 L/S',
    universe: 'r2500', strategy: 'long_short',
    blurb: 'Market-neutral NR012 (50/50 blend) · 6% vol target · dollar- & sector-neutral.',
  },
];

const slugFor = (universe: string | null, strategy: string | null) =>
  universe === 'r2500' && strategy === 'long_short' ? 'r2500-ls'
    : universe === 'sp500' && strategy === 'long_only' ? 'sp500'
    : `${universe}-${strategy === 'long_short' ? 'ls' : 'lo'}`;

export const slugForRow = (r: Pick<PortfolioBacktest, 'universe' | 'strategy'>) =>
  slugFor(r.universe, r.strategy);

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
