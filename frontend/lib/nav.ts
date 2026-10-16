/**
 * The site's navigation, defined ONCE. The sidebar renders it; the home page renders it as cards;
 * nothing else may hard-code a menu, so the three cannot disagree again (they had — the home page
 * still described "two production finalists" after one book went to production).
 *
 * Reorganised 2026-10-16 (owner): four groups named for the THING each is about, in the order the
 * fund works — choose a strategy, hold a portfolio, trade it, check the machinery. Rules:
 *   - one word, one meaning: "Portfolio" is the book we hold; research books are "Backtests";
 *     "Factors" is research, the live model's view is "Model Health";
 *   - no internal codes in labels (P01 / P02 / L2 / te6 / N014 stay inside the pages);
 *   - flat within a group; sub-items only when a page genuinely has siblings;
 *   - routes UNCHANGED in this phase, so every bookmark and Slack link keeps working.
 *
 * `paper` is still hard-coded in the Portfolio and Trading routes because paper is the only
 * configured environment (the live route 404s). Phase 2 replaces that with one account selector
 * per group rather than a second copy of the list.
 */

export type NavItem = {
  label: string;
  href: string;
  /** Path prefixes that mark this item active (default: `href` and anything under it). */
  match?: string[];
  /** Exact-path match only (for an index page whose children are separate items). */
  exact?: boolean;
  icon: string;
  /** One sentence for the home-page card. */
  blurb: string;
};

export type NavGroup = {
  key: 'strategy' | 'portfolio' | 'trading' | 'system';
  label: string;
  /** The question the group answers, for the home page. */
  question: string;
  items: NavItem[];
};

export const HOME: NavItem = {
  label: 'Home', href: '/', exact: true, icon: '⌂',
  blurb: 'The fund operating dashboard.',
};

export const NAV_GROUPS: NavGroup[] = [
  {
    key: 'strategy',
    label: 'Strategy',
    question: 'What we chose, and why',
    items: [
      { label: 'Factors', href: '/research/factors', icon: '◔',
        match: ['/research/factors', '/research/r2500-factors'],
        blurb: 'Factor quintile analysis for both universes: which signals pay, how strongly, and how stably.' },
      { label: 'Alpha Models', href: '/research/models', icon: '◉',
        match: ['/research/models', '/research/r2500-models'],
        blurb: 'The alpha models and their ensembles: information coefficients, quintile spreads, stability, what each leans on.' },
      { label: 'Backtests', href: '/research/portfolios', icon: '▥',
        match: ['/research/portfolios'],
        blurb: 'The optimized portfolio backtests: sweep explorer, browse grid, model comparison, per-backtest reports.' },
      { label: 'Macro Overlay', href: '/macro-beta', icon: '∿',
        blurb: 'The macro beta signal applied as an overlay: current state, components, episode record, cost of insurance.' },
    ],
  },
  {
    key: 'portfolio',
    label: 'Portfolio',
    question: 'What we hold, and how it is doing',
    items: [
      { label: 'Overview', href: '/portfolios', exact: true, icon: '◈',
        blurb: 'Every tracked strategy: the production book, the candidates, and the research tracks, with their records.' },
      { label: 'Paper Account', href: '/portfolios/sp500-ext-te6/ibkr', icon: '◧',
        match: ['/portfolios/sp500-ext-te6/ibkr'],
        blurb: 'The book we actually hold in the IBKR paper account: performance, core vs sleeve, last rebalance, integrity.' },
      { label: 'Holdings', href: '/portfolio-monitor/paper/holdings', icon: '≡',
        match: ['/portfolio-monitor/paper/holdings'],
        blurb: "Today's positions, name by name: held vs target weight, P&L, borrow, with filters and CSV export." },
      { label: 'Exposures', href: '/portfolio-monitor/paper/exposures', icon: '◫',
        match: ['/portfolio-monitor/paper/exposures'],
        blurb: "Today's factor and sector exposures against the benchmark, the frozen target, and the allowed range." },
      { label: 'Reports', href: '/portfolios/sp500-ext-te6/reports', icon: '▤',
        match: ['/portfolios/sp500-ext-te6/reports'],
        blurb: 'The frozen report archive: daily, weekly, monthly, and post-rebalance reports as they were published.' },
    ],
  },
  {
    key: 'trading',
    label: 'Trading',
    question: 'What we do to it',
    items: [
      { label: 'Rebalance', href: '/trading/paper/rebalance', icon: '⌁',
        match: ['/trading/paper/rebalance', '/trading/paper'],
        blurb: 'The monthly rebalance: freeze, review, approve, execute, and the halt control.' },
      // Route is `orders/` because trading_ui_IA.md §2.2 says so (S4). The LABEL stays "Trade
      // Blotter" — that is the domain word and what the screen calls itself; the IA governs the URL.
      { label: 'Trade Blotter', href: '/trading/paper/orders', icon: '☰',
        match: ['/trading/paper/orders'],
        blurb: 'Every order and fill sent to the broker, with slippage against the arrival price.' },
    ],
  },
  {
    key: 'system',
    label: 'System Health',
    question: 'Is the machinery working',
    items: [
      { label: 'Data Pipeline', href: '/monitor', icon: '⛁',
        blurb: 'Pipeline freshness, gap detection, and factor coverage for the data the models read.' },
      // One entry until a second page exists; model-health percentiles ([04-MH]) join Factors as a
      // sub-item then.
      { label: 'Model Health', href: '/model-monitor/factors', icon: '◎',
        match: ['/model-monitor'],
        blurb: 'What the production models lean on, what each factor paid, and what their use of it earned.' },
    ],
  },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  const prefixes = item.match ?? [item.href];
  return prefixes.some((m) => pathname === m || pathname.startsWith(m + '/') || pathname.startsWith(m + '?'));
}

/**
 * Among items whose prefixes overlap (Overview `/portfolios` exact vs Paper Account under it;
 * Rebalance `/trading/paper` vs Trade Blotter under it), the most specific match wins, so exactly
 * one item lights up for any path.
 */
export function activeHref(pathname: string): string | null {
  let best: { href: string; len: number } | null = null;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (!isActive(it, pathname)) continue;
      const len = Math.max(...(it.match ?? [it.href]).filter((m) => pathname === m || pathname.startsWith(m)).map((m) => m.length), 0);
      if (!best || len > best.len) best = { href: it.href, len };
    }
  }
  return best?.href ?? (isActive(HOME, pathname) ? HOME.href : null);
}
