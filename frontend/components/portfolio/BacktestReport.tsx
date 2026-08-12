'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  fetchPortfolioDetail, fetchPortfolioHoldings, fetchPortfolioSectorAllocation,
  fetchPortfolioAttribution, fetchPortfolioAttributionTimeseries, fetchPortfolioCostAttribution,
  fetchPortfolioNeutrality, fetchPortfolioSourceAttribution, fetchPortfolioDecomposition,
  fetchPortfolioDeployment, fetchPortfolioComponentAttribution,
} from '@/lib/api';
import {
  pct, pctSign, num, fmtSector, fmtTurn,
  buildAnnualTable, buildDrawdownTable, captureRatios, activeStats, histogram, rollingIR, rollingVol,
  COLLATERAL_HAIRCUT_ANN, realizedMonth,
} from '@/lib/portfolio';
import { CumulativeChart, DrawdownChart, MultiLineChart, Histogram, HBarChart, StackedAreaChart } from '@/components/portfolio/charts';
import type { PortfolioHolding, SourceAttrPoint, ComponentAttrPoint } from '@/types/api';

// ── construction changes inside a single track ([10-BRW]) ────────────────────────────────────
// A track that spans these dates is NOT one construction measured throughout, and anyone
// comparing pre- and post-August performance on it needs to be told so rather than left to
// discover it. Formation months (the books are dated on formation; the charts plot realization,
// so the effect appears one month later on the x-axis).
//
// Only shown on books that actually hold shorts — borrow-awareness cannot touch a long-only
// book, and a caveat that does not apply is just noise that trains people to skip caveats.
const CONSTRUCTION_CHANGES = [
  { from: '2026-07-31', what: 'borrow-aware construction',
    detail: 'per-name IBKR stock-loan fee entered the objective and reported availability became a '
          + 'per-name short bound. Before this, no borrow quotes existed — IBKR archives nothing, so '
          + 'the earlier months cannot be rebuilt on the new basis at any price.' },
  { from: '2026-08-08', what: 'dropped-out names bounded to zero',
    detail: 'a name we watched LEAVE the borrow file is now treated as an observation of zero '
          + 'available rather than as missing data. Names that never appeared are unaffected.' },
];
const CONSTRUCTION_FIRST_CHANGE = CONSTRUCTION_CHANGES[0].from;

const STYLE_ORDER = ['beta', 'size', 'resid_vol', 'momentum', 'value', 'earnings_yield', 'growth',
  'profitability', 'earnings_qual', 'leverage', 'liquidity', 'dividend_yield'];
const FACTOR_LABELS: Record<string, string> = {
  market: 'Market', beta: 'Beta', size: 'Size', resid_vol: 'Residual Vol', momentum: 'Momentum',
  value: 'Value', earnings_yield: 'Earnings Yield', growth: 'Growth', profitability: 'Profitability',
  earnings_qual: 'Earnings Quality', leverage: 'Leverage', liquidity: 'Liquidity', dividend_yield: 'Dividend Yield',
};
const prettyFactor = (f: string) =>
  FACTOR_LABELS[f] ?? (f.startsWith('sec_')
    ? f.slice(4).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : f);

// ------------------------------------------------------------ sortable holdings table (longs or shorts)
type HCol = 'ticker' | 'name' | 'sector' | 'weight' | 'benchmark_weight' | 'active_weight' | 'trade_pct';
function HoldingsTable({ rows, title, note, showBench }: { rows: PortfolioHolding[]; title: string; note: string; showBench?: boolean }) {
  const [sort, setSort] = useState<{ col: HCol; dir: 1 | -1 }>({ col: 'weight', dir: -1 });
  const numeric = (c: HCol) => c === 'weight' || c === 'benchmark_weight' || c === 'active_weight' || c === 'trade_pct';
  const sorted = useMemo(() => {
    const col = sort.col;
    return [...rows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[col], bv = (b as unknown as Record<string, unknown>)[col];
      const cmp = numeric(col) ? ((av as number) ?? 0) - ((bv as number) ?? 0)
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return cmp * sort.dir;
    });
  }, [rows, sort]);
  const th = (c: HCol, label: string, left = false) => (
    <th onClick={() => setSort((p) => p.col === c ? { col: c, dir: (p.dir === 1 ? -1 : 1) } : { col: c, dir: numeric(c) ? -1 : 1 })}
      style={{ cursor: 'pointer', userSelect: 'none', textAlign: left ? 'left' : 'right', color: sort.col === c ? 'var(--teal)' : undefined }}>
      {label}{sort.col === c ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}
    </th>
  );
  return (
    <div className="panel p-4">
      <div className="panel-head">{title} <span className="muted" style={{ fontWeight: 400 }}>· {rows.length} names</span></div>
      <div className="panel-sub mb-2">{note}</div>
      <div className="overflow-x-auto" style={{ maxHeight: '38vh' }}>
        <table className="dtable">
          <thead><tr>
            {th('ticker', 'Ticker', true)}{th('name', 'Name', true)}{th('sector', 'Sector', true)}
            {th('weight', 'Weight')}
            {showBench && th('benchmark_weight', 'Bench')}
            {showBench && th('active_weight', 'Active')}
            {th('trade_pct', 'Δ mo')}
          </tr></thead>
          <tbody>
            {sorted.slice(0, 60).map((h) => (
              <tr key={h.isin}>
                <td>{h.ticker ?? '—'}</td>
                <td className="muted" style={{ textAlign: 'left', fontFamily: 'inherit' }}>{h.name ?? h.isin}</td>
                <td className="dim" style={{ textAlign: 'left', fontFamily: 'inherit' }}>{h.sector ?? '—'}</td>
                <td style={{ color: (h.weight ?? 0) < 0 ? 'var(--neg)' : 'var(--tx)' }}>{pct(h.weight, 2)}</td>
                {showBench && <td className="dim">{h.benchmark_weight == null ? '—' : pct(h.benchmark_weight, 2)}</td>}
                {showBench && <td style={{ color: (h.active_weight ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{h.active_weight == null ? '—' : pctSign(h.active_weight, 2)}</td>}
                <td style={{ color: (h.trade_pct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{h.trade_pct == null ? '—' : pctSign(h.trade_pct, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className="kpi-v" style={{ color: color ?? 'var(--tx)' }}>{value}</div>
      {sub && <div className="kpi-s">{sub}</div>}
    </div>
  );
}

// ------------------------------------------------------------ net-of-cost bridge (gross → net by cost)
// Default cost-accounting lens for the research grid, whose labels are all `_rc5`. The Portfolios
// tracking pages override it per product (`ProductDef.costAum`) — the two S&P 500 Extensions are
// accounted at $1M, the paper-account size, and quoting $5M there would contradict the card headline.
const AUM_MUSD = 5;
function CostBridgeSection({ label, isLS, aum = AUM_MUSD }: { label: string; isLS: boolean; aum?: number }) {
  const { data, error } = useSWR(['pf-cost', label, aum], () => fetchPortfolioCostAttribution(label, aum),
    { revalidateOnFocus: false });
  if (error) return null;                                   // not computed for this label → hide
  if (!data) return <div className="panel p-6 muted text-sm mt-5">Loading net-of-cost bridge…</div>;
  const s = data.summary;
  const rf = s.avg_rf_ann ?? 0;
  const CRED_HAIRCUT = 0.005;                                                    // matches the API credited convention
  // L/S: the stored gross/net are net-of-the-cash-hurdle (port−rf / port−cost−rf). Add RF back to
  // show the raw book spread (port) and the book net of cost (port−cost = excess over cash), then a
  // collateral income step (RF − haircut) reaches the investor's total return. Long-only is unchanged.
  const gross = (s.ann_gross_active ?? 0) + (isLS ? rf : 0);                     // gross book spread (L/S) / gross active (LO)
  const net = (s.ann_net_active ?? 0) + (isLS ? rf : 0);                         // excess over cash (L/S) / net active (LO)
  const collateral = isLS ? rf - CRED_HAIRCUT : 0;                              // collateral RF less haircut (income)
  const total = net + collateral;                                               // total return (L/S); == net (LO)
  const scale = Math.max(gross, s.ann_total_cost ?? 0, Math.abs(total), 1e-4);
  const barW = (v: number) => `${Math.min(100, (Math.abs(v) / scale) * 100)}%`;

  // waterfall rows: gross (teal) → each cost (red) → net (teal/red)
  const costRows = [
    { name: 'Bid–ask spread', drag: s.ann_spread_drag ?? 0, bps: s.avg_spread_bps },
    { name: 'Market impact', drag: s.ann_impact_drag ?? 0, bps: s.avg_impact_bps },
    { name: 'Commission (IBKR Fixed)', drag: s.ann_commission_drag ?? 0, bps: s.avg_commission_bps },
    ...(isLS || (s.ann_borrow_drag ?? 0) > 1e-6
      ? [{ name: 'Borrow (shorts)', drag: s.ann_borrow_drag ?? 0, bps: null as number | null }] : []),
  ];
  const dates = data.monthly.map((p) => realizedMonth(p.date));

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Net-of-Cost Bridge</h2>
        <span className="pill pill-cyan">${aum}M AUM</span>
        <span className="text-[11px] muted">how realistic trading costs turn gross {isLS ? 'book P&L' : 'active return'} into net — spread + market impact + commission{isLS ? ' + borrow' : ''}</span>
      </div>
      <div className="takeaway mb-3 text-[12px]">
        <b>At ${aum}M, costs take gross {pctSign(gross)}/yr down to {isLS ? 'excess-over-cash' : 'net'} {pctSign(net)}/yr</b>
        {isLS && <> — then cash earned on collateral (+{pct(collateral)}/yr) lifts it to <b>total return {pctSign(total)}/yr</b></>}
        {!isLS && gross > 0 && s.pct_gross_kept != null && <> — you keep {pct(s.pct_gross_kept, 0)} of the gross edge</>}
        {' '}(<b>{num(s.avg_eff_bps, 1)} bps</b> per traded dollar over {pct(s.avg_turnover, 0)}/mo turnover).
        {' '}Impact + commission scale with fund size; the spread piece does not.
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* waterfall */}
        <div className="panel p-4 xl:col-span-2">
          <div className="panel-head">Gross → {isLS ? 'Total' : 'Net'} Waterfall <span className="muted" style={{ fontWeight: 400 }}>· annualized</span></div>
          <div className="panel-sub mb-3">each cost is charged per name on every traded dollar (‖Δw‖₁), priced at ${aum}M</div>
          <div className="space-y-2">
            {/* gross */}
            <div className="flex items-center gap-2 text-[12px]">
              <span className="w-40 text-right muted" style={{ fontWeight: 600 }}>Gross {isLS ? 'book' : 'active'}</span>
              <div className="flex-1 relative h-4" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, background: 'var(--teal)', opacity: 0.9, width: barW(gross) }} />
              </div>
              <span className="mono w-16 text-right" style={{ color: 'var(--tx)', fontWeight: 600 }}>{pctSign(gross)}</span>
              <span className="mono w-14 text-right dim">bps/$</span>
            </div>
            {/* costs */}
            {costRows.map((c) => (
              <div key={c.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-40 text-right muted">− {c.name}</span>
                <div className="flex-1 relative h-4" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, background: 'var(--neg)', opacity: 0.8, width: barW(c.drag) }} />
                </div>
                <span className="mono w-16 text-right" style={{ color: 'var(--neg)' }}>−{pct(c.drag, 2)}</span>
                <span className="mono w-14 text-right dim">{c.bps == null ? '—' : `${num(c.bps, 1)}`}</span>
              </div>
            ))}
            {/* net book — excess over cash (L/S) / net active (LO). Subtotal for L/S. */}
            <div className="flex items-center gap-2 text-[12px]" style={{ borderTop: '2px solid var(--border)', paddingTop: 8 }}>
              <span className="w-40 text-right" style={{ fontWeight: 700, color: 'var(--tx)' }}>{isLS ? 'Excess over cash' : 'Net active'}</span>
              <div className="flex-1 relative h-4" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, background: net >= 0 ? 'var(--teal)' : 'var(--neg)', opacity: 0.95, width: barW(net) }} />
              </div>
              <span className="mono w-16 text-right" style={{ color: net >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>{pctSign(net)}</span>
              <span className="mono w-14 text-right dim">{isLS ? '' : num(s.avg_eff_bps, 1)}</span>
            </div>
            {isLS && <>
              {/* + cash earned on collateral (income, not a cost) */}
              <div className="flex items-center gap-2 text-[12px]">
                <span className="w-40 text-right muted">+ Cash on collateral</span>
                <div className="flex-1 relative h-4" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, background: 'var(--cyan)', opacity: 0.7, width: barW(collateral) }} />
                </div>
                <span className="mono w-16 text-right" style={{ color: 'var(--cyan)' }}>+{pct(collateral)}</span>
                <span className="mono w-14 text-right dim">RF−hc</span>
              </div>
              {/* = total return (what the investor's capital earns) */}
              <div className="flex items-center gap-2 text-[12px]" style={{ borderTop: '2px solid var(--border)', paddingTop: 8 }}>
                <span className="w-40 text-right" style={{ fontWeight: 700, color: 'var(--tx)' }}>Total return</span>
                <div className="flex-1 relative h-4" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 3, background: total >= 0 ? 'var(--teal)' : 'var(--neg)', opacity: 0.95, width: barW(total) }} />
                </div>
                <span className="mono w-16 text-right" style={{ color: total >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 700 }}>{pctSign(total)}</span>
                <span className="mono w-14 text-right dim">incl. cash</span>
              </div>
            </>}
          </div>
        </div>

        {/* cumulative gross vs net */}
        <div className="panel p-4">
          <div className="panel-head">Cumulative Gross vs Net</div>
          <div className="panel-sub mb-1">the widening wedge = cumulative cost drag</div>
          <div className="flex gap-3 text-[10px] muted mb-1">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Gross</span>
            <span><span style={{ color: 'var(--cyan)' }}>■</span> Net</span>
          </div>
          <MultiLineChart dates={dates} series={[
            { label: 'Gross', color: 'var(--teal)', values: data.monthly.map((p) => p.cum_gross) },
            { label: 'Net', color: 'var(--cyan)', values: data.monthly.map((p) => p.cum_net) },
          ]} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={200} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ factor attribution (Phase-4 headline)
function AttributionSection({ label, isLS }: { label: string; isLS: boolean }) {
  const { data, error } = useSWR(['pf-attr', label], () => fetchPortfolioAttribution(label), { revalidateOnFocus: false });
  const { data: ts } = useSWR(['pf-attr-ts', label], () => fetchPortfolioAttributionTimeseries(label), { revalidateOnFocus: false });
  if (error) return null;                                  // not computed for this label → hide the section
  if (!data) return <div className="panel p-6 muted text-sm mt-4">Loading factor attribution…</div>;

  const sm = new Map(data.summary.map((r) => [r.factor, r]));
  const g = (f: string) => sm.get(f);
  const specific = g('specific');
  const secRows = data.summary.filter((r) => r.factor_group === 'Sector');
  const secAgg = {
    ann: secRows.reduce((s, r) => s + (r.ann_ret_contrib ?? 0), 0),
    pctRet: secRows.reduce((s, r) => s + (r.pct_active_return ?? 0), 0),
    pctVar: secRows.reduce((s, r) => s + (r.pct_active_variance ?? 0), 0),
  };
  const rowOf = (name: string, r: typeof specific, hi = false) => ({
    name, hi, exp: r?.avg_active_exposure ?? null, ann: r?.ann_ret_contrib ?? null,
    pctRet: r?.pct_active_return ?? null, t: r?.contrib_tstat ?? null, pctVar: r?.pct_active_variance ?? null,
  });
  const tableRows = [
    rowOf('Specific (selection)', specific, true),
    rowOf('Market', g('market')),
    ...STYLE_ORDER.map((f) => rowOf(prettyFactor(f), g(f))),
    { name: 'Sector (net)', hi: false, exp: null, ann: secAgg.ann, pctRet: secAgg.pctRet, t: null, pctVar: secAgg.pctVar },
  ];

  const expMap = new Map(data.latest_exposures.map((e) => [e.factor, e.active_exposure ?? 0]));
  const expBars = ['market', ...STYLE_ORDER].map((f) => ({ label: prettyFactor(f), value: expMap.get(f) ?? 0 }))
    .filter((b) => Math.abs(b.value) > 0.005).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const riskBars = [
    { label: 'Specific', value: specific?.pct_active_variance ?? 0 },
    { label: 'Sector (net)', value: secAgg.pctVar },
    { label: 'Market', value: g('market')?.pct_active_variance ?? 0 },
    ...STYLE_ORDER.map((f) => ({ label: prettyFactor(f), value: g(f)?.pct_active_variance ?? 0 })),
  ].filter((b) => b.value > 0.003).sort((a, b) => b.value - a.value).slice(0, 9);

  const dates = (ts ?? []).map((p) => realizedMonth(p.date));
  const cumSeries = [
    { label: 'Specific', color: 'var(--teal)', values: (ts ?? []).map((p) => p.specific) },
    { label: 'Style', color: 'var(--cyan)', values: (ts ?? []).map((p) => p.style) },
    { label: 'Sector', color: 'var(--amber)', values: (ts ?? []).map((p) => p.sector) },
    { label: 'Market', color: 'var(--bench)', values: (ts ?? []).map((p) => p.market) },
    { label: 'Total', color: 'var(--tx)', values: (ts ?? []).map((p) => p.total) },
  ];
  const retName = isLS ? 'book P&L' : 'active return';

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Factor Attribution</h2>
        <span className="text-[11px] muted">decomposes the {retName} into the risk model’s 24 factors + specific (stock selection)</span>
      </div>
      {specific?.ann_ret_contrib != null && (
        <div className="takeaway mb-3 text-[12px]">
          <b>Stock selection contributed {pctSign(specific.ann_ret_contrib)}/yr</b>
          {specific.pct_active_return != null && <> — {pct(specific.pct_active_return, 0)} of the {retName}</>}
          {specific.contrib_tstat != null && <> (t = {num(specific.contrib_tstat, 1)})</>}
          {specific.pct_active_variance != null && <>, and {pct(specific.pct_active_variance, 0)} of active risk</>}.
          {isLS && <> Market/beta/sector exposure is held near zero — this is a pure-alpha, market-neutral book.</>}
          {!isLS && <> The remainder is incidental factor &amp; sector tilts (below).</>}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* return attribution table */}
        <div className="panel p-4 xl:col-span-2">
          <div className="panel-head">Return Attribution <span className="muted" style={{ fontWeight: 400 }}>· annualized, net of nothing (gross of TC)</span></div>
          <div className="panel-sub mb-2">factor contribution = active exposure × factor return; specific = selection. Sum = {retName}.</div>
          <div className="overflow-x-auto" style={{ maxHeight: '46vh' }}>
            <table className="dtable" style={{ fontSize: 11 }}>
              <thead><tr>
                <th style={{ textAlign: 'left' }}>Factor</th><th>Avg exp</th><th>Ann contrib</th><th>% of {isLS ? 'P&L' : 'active'}</th><th>t-stat</th><th>% of risk</th>
              </tr></thead>
              <tbody>
                {tableRows.map((r) => (
                  <tr key={r.name} style={r.hi ? { background: 'rgba(14,124,111,0.09)' } : undefined}>
                    <td style={{ textAlign: 'left', fontFamily: 'inherit', fontWeight: r.hi ? 700 : 400 }}>{r.name}</td>
                    <td className="dim">{r.exp == null ? '—' : num(r.exp, 2)}</td>
                    <td style={{ color: (r.ann ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 500 }}>{r.ann == null ? '—' : pctSign(r.ann, 2)}</td>
                    <td className="dim">{r.pctRet == null ? '—' : pct(r.pctRet, 0)}</td>
                    <td style={{ color: r.t != null && Math.abs(r.t) >= 2 ? 'var(--tx)' : 'var(--tx-dim)' }}>{r.t == null ? '—' : num(r.t, 1)}</td>
                    <td className="dim">{r.pctVar == null ? '—' : pct(r.pctVar, 0)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <td style={{ textAlign: 'left', fontFamily: 'inherit' }}>Total {retName}</td>
                  <td className="dim">—</td>
                  <td style={{ color: (g('total')?.ann_ret_contrib ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{pctSign(g('total')?.ann_ret_contrib, 2)}</td>
                  <td className="dim">100%</td><td className="dim">—</td><td className="dim">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* active exposure profile */}
        <div className="panel p-4">
          <div className="panel-head">Active Factor Exposure <span className="muted" style={{ fontWeight: 400 }}>· latest</span></div>
          <div className="panel-sub mb-2">Bᵀ(w−b) in cross-sectional σ units · where the book tilts</div>
          <HBarChart bars={expBars} valFmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        {/* cumulative return attribution */}
        <div className="panel p-4 xl:col-span-2">
          <div className="panel-head">Cumulative {retName === 'book P&L' ? 'P&L' : 'Active Return'} Attribution</div>
          <div className="panel-sub mb-1">cumulative (arithmetic) contribution by group · Specific vs factor groups</div>
          <div className="flex gap-3 text-[10px] muted mb-1 flex-wrap">
            {cumSeries.map((s) => <span key={s.label}><span style={{ color: s.color }}>■</span> {s.label}</span>)}
          </div>
          <MultiLineChart dates={dates} series={cumSeries} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={220} />
        </div>

        {/* risk decomposition */}
        <div className="panel p-4">
          <div className="panel-head">Active Risk Decomposition</div>
          <div className="panel-sub mb-2">% of active variance (ex-ante, avg) · top contributors</div>
          <HBarChart bars={riskBars} valFmt={(v) => pct(v, 0)} diverging={false} posColor="var(--cyan)" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ F2: market-neutrality (net dollar & net beta)
function NeutralitySection({ label }: { label: string }) {
  const { data, error } = useSWR(['pf-neutral', label], () => fetchPortfolioNeutrality(label), { revalidateOnFocus: false });
  if (error) return null;                                   // no weights → hide
  if (!data) return <div className="panel p-6 muted text-sm mt-5">Loading neutrality…</div>;
  const s = data.summary;
  const dates = data.monthly.map((p) => realizedMonth(p.date));
  const beta = s.avg_net_beta;
  const tight = beta != null && Math.abs(beta) < 0.15;
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Market-Neutrality</h2>
        <span className="text-[11px] muted">net dollar (Σ wᵢ) and net beta (Σ wᵢ·βᵢ) over time — a dollar-neutral book can still carry beta, so net beta is the one that matters</span>
      </div>
      <div className="takeaway mb-3 text-[12px]">
        <b>Net dollar holds at {pct(s.avg_net_dollar, 2)} (dollar-neutral by constraint); net beta averages {num(beta, 2)}</b> (max |β| {num(s.max_abs_net_beta, 2)}).{' '}
        {tight ? 'The book stays close to beta-neutral even though beta is not explicitly constrained — a strong trust signal.'
          : 'The book carries a small residual beta tilt — only dollar and sector are explicitly neutralized; an explicit beta constraint is a candidate.'}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="panel-head">Net Dollar Exposure <span className="muted" style={{ fontWeight: 400 }}>· Σ wᵢ</span></div>
          <div className="panel-sub mb-1">enforced ≈ 0 by the dollar-neutral constraint</div>
          <MultiLineChart dates={dates} series={[{ label: 'Net $', color: 'var(--teal)', values: data.monthly.map((p) => p.net_dollar) }]} refY={0} refLabel="0" yFmt={(v) => pct(v, 1)} height={185} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Net Market Beta <span className="muted" style={{ fontWeight: 400 }}>· Σ wᵢ·βᵢ</span></div>
          <div className="panel-sub mb-1">raw 60-month betas · 0 = market-neutral</div>
          <MultiLineChart dates={dates} series={[{ label: 'Net β', color: 'var(--cyan)', values: data.monthly.map((p) => p.net_beta) }]} refY={0} refLabel="0" yFmt={(v) => v.toFixed(2)} height={185} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ two-engine decomposition (130/30 extension)
function DecompositionSection({ label, benchName }: { label: string; benchName: string }) {
  const { data, error } = useSWR(['pf-decomp', label], () => fetchPortfolioDecomposition(label), { revalidateOnFocus: false });
  if (error) return null;                                    // not an extension blend → hide the section
  if (!data) return <div className="panel p-6 muted text-sm mt-5">Loading decomposition…</div>;
  const s = data.summary;
  const kPct = s.k != null ? Math.round(s.k * 100) : 50;
  const dates = data.monthly.map((p) => realizedMonth(p.date));
  const cumCore = data.monthly.map((p) => p.cum_core_alpha);
  const cumSleeve = data.monthly.map((p) => p.cum_sleeve_alpha);
  // stacked cumulative = total outperformance over the index, split by engine
  const stack = [
    { label: 'Core selection', color: 'var(--teal)', values: cumCore },
    { label: 'Sleeve overlay', color: 'var(--amber)', values: cumSleeve },
  ];
  // rolling 12-month alpha = trailing-year sum = cum[i] − cum[i−12]. The cumulative just grows; the
  // rolling view shows WHEN each engine adds or loses — e.g. the sleeve dipping in the 2025 junk rally.
  const roll12 = (cum: (number | null)[]) =>
    cum.map((v, i) => (i < 12 || v == null || cum[i - 12] == null) ? null : (v as number) - (cum[i - 12] as number));
  const r12Core = roll12(cumCore);
  const r12Sleeve = roll12(cumSleeve);
  // Rolling view as a cumulative stack (core base + sleeve overlay), matching the Cumulative-Alpha
  // chart: StackedAreaChart draws the top-of-stack (= core + sleeve = total alpha) as the total line.
  // Drop the leading 12 null months so the stack starts clean (roll12 is null there) — same as the
  // Gross-Return-Composition panel. When the sleeve turns negative (2025) its band pulls the total down.
  const rollStack = [
    { label: 'Core selection', color: 'var(--teal)', values: r12Core.slice(12) },
    { label: 'Sleeve overlay', color: 'var(--amber)', values: r12Sleeve.slice(12) },
  ];
  const sources = [
    { label: `${benchName} beta`, value: s.ann_index ?? 0, color: 'var(--bench)' },
    { label: 'Core selection', value: s.ann_core_alpha ?? 0, color: 'var(--teal)' },
    { label: `Sleeve overlay (${kPct}%)`, value: s.ann_sleeve_alpha ?? 0, color: 'var(--amber)' },
  ];
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Two-Engine Decomposition</h2>
        <span className="pill pill-cyan">150/50 extension</span>
        <span className="text-[11px] muted">how the total splits into index beta + the equity core’s selection + the L/S sleeve overlay</span>
      </div>
      <div className="takeaway mb-3 text-[12px]">
        <b>Total {pctSign(s.ann_total)}/yr = {benchName} beta {pctSign(s.ann_index)} + core selection {pctSign(s.ann_core_alpha)} + a {kPct}% L/S sleeve {pctSign(s.ann_sleeve_alpha)}.</b>{' '}
        The sleeve is near-uncorrelated to the index, so it adds alpha <i>without</i> adding beta — that’s the portable-alpha lift over just owning {benchName}. The book carries full equity beta, so its drawdowns are equity-crash-shaped.
      </div>
      {/* compact return-sources strip — replaces the sparse 3-bar chart (the numbers are in the takeaway) */}
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap mb-3 px-1 text-[12px]">
        <span className="text-[10px] font-bold tracking-wider muted">SOURCES /yr</span>
        {sources.map((x) => (
          <span key={x.label} className="flex items-center gap-1.5">
            <span style={{ color: x.color }}>■</span>
            <span className="muted">{x.label}</span>
            <span className="mono font-bold" style={{ color: (x.value ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{pctSign(x.value, 1)}</span>
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="panel-head">Cumulative Alpha Over {benchName} <span className="muted" style={{ fontWeight: 400 }}>· by engine, stacked</span></div>
          <div className="panel-sub mb-1">the two alpha engines above the index · top of stack = total outperformance since 2005</div>
          <div className="flex gap-3 text-[10px] muted mb-1 flex-wrap">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Core selection</span>
            <span><span style={{ color: 'var(--amber)' }}>■</span> Sleeve overlay</span>
          </div>
          <StackedAreaChart dates={dates} series={stack} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={230} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Rolling 12-Month Alpha <span className="muted" style={{ fontWeight: 400 }}>· by engine</span></div>
          <div className="panel-sub mb-1">core + sleeve stacked · top line = total · shows when the sleeve turns (the 2025 junk rally is visible)</div>
          <div className="flex gap-3 text-[10px] muted mb-1 flex-wrap">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Core</span>
            <span><span style={{ color: 'var(--amber)' }}>■</span> Sleeve</span>
            <span><span style={{ color: 'var(--tx)' }}>▬</span> Total</span>
          </div>
          <StackedAreaChart dates={dates.slice(12)} series={rollStack} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={230} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ contribution by SOURCE (L/S: long / short / collateral)
function SourceAttributionSection({ label }: { label: string }) {
  const { data, error } = useSWR(['pf-src', label], () => fetchPortfolioSourceAttribution(label), { revalidateOnFocus: false });
  if (error) return null;                                   // long-only / not computed → hide the section
  if (!data) return <div className="panel p-6 muted text-sm mt-5">Loading source attribution…</div>;
  const s = data.summary, mo = data.monthly;
  const dates = mo.map((p) => realizedMonth(p.date));
  const roll12 = (f: (p: SourceAttrPoint) => number | null) => {   // trailing-12-month sum (null until month 12)
    const v = mo.map((p) => f(p) ?? 0);
    return v.map((_, i) => (i < 11 ? null : v.slice(i - 11, i + 1).reduce((a, b) => a + b, 0)));
  };
  const rawBars = [
    { label: 'Long book', value: s.long_leg ?? 0 },
    { label: 'Short book', value: s.short_leg ?? 0 },
    { label: 'Collateral', value: s.collateral ?? 0 },
    { label: '− Costs', value: -(s.cost ?? 0) },
  ];
  const selBars = [
    { label: 'Long selection', value: s.long_sel ?? 0 },
    { label: 'Short selection', value: s.short_sel ?? 0 },
    { label: 'Market / beta', value: s.market ?? 0 },
    { label: 'Collateral', value: s.collateral ?? 0 },
    { label: '− Costs', value: -(s.cost ?? 0) },
  ];
  const rawRoll = [
    { label: 'Long', color: 'var(--pos)', values: roll12((p) => p.long_leg) },
    { label: 'Short', color: 'var(--neg)', values: roll12((p) => p.short_leg) },
    { label: 'Collateral', color: 'var(--cyan)', values: roll12((p) => p.collateral) },
    { label: '− Cost', color: 'var(--amber)', values: roll12((p) => -(p.cost ?? 0)) },
    { label: 'Total', color: 'var(--tx)', values: roll12((p) => p.credited_tot) },
  ];
  const selRoll = [
    { label: 'Long sel', color: 'var(--pos)', values: roll12((p) => p.long_sel) },
    { label: 'Short sel', color: 'var(--teal)', values: roll12((p) => p.short_sel) },
    { label: 'Market', color: 'var(--bench)', values: roll12((p) => p.market) },
    { label: 'Collateral', color: 'var(--cyan)', values: roll12((p) => p.collateral) },
    { label: '− Cost', color: 'var(--amber)', values: roll12((p) => -(p.cost ?? 0)) },
    { label: 'Total', color: 'var(--tx)', values: roll12((p) => p.credited_tot) },
  ];
  // stacked beta-adjusted alpha sources (collateral base → long-sel → short-sel); top of the stack ≈ gross return.
  // slice(11) drops the leading incomplete 12m windows so the stack starts clean (roll12 is null there).
  const stackSel = [
    { label: 'Collateral', color: 'var(--cyan)', values: roll12((p) => p.collateral).slice(11) },
    { label: 'Long selection', color: 'var(--pos)', values: roll12((p) => p.long_sel).slice(11) },
    { label: 'Short selection', color: 'var(--amber)', values: roll12((p) => p.short_sel).slice(11) },
  ];
  const wSeries = [
    { label: 'Long gross', color: 'var(--pos)', values: mo.map((p) => p.gross_long) },
    { label: 'Short gross', color: 'var(--neg)', values: mo.map((p) => p.gross_short) },
  ];
  const legend = (series: { label: string; color: string }[]) => (
    <div className="flex gap-3 text-[10px] muted mb-1 flex-wrap">
      {series.map((x) => <span key={x.label}><span style={{ color: x.color }}>■</span> {x.label}</span>)}
    </div>
  );
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Return by Source</h2>
        <span className="text-[11px] muted">where the total return comes from — the long book, the short book, and cash collateral</span>
      </div>
      <div className="takeaway mb-3 text-[12px]">
        Total <b>{pctSign(s.credited_tot)}/yr</b> = long {pctSign(s.long_leg)} + short {pctSign(s.short_leg)} + collateral {pctSign(s.collateral)} − costs {pct(s.cost, 2)}.
        {' '}The raw short leg looks like a drag, but that is <b>market beta</b>: beta-adjusted, the short book&rsquo;s <b>selection is {pctSign(s.short_sel)}/yr</b> vs the long&rsquo;s {pctSign(s.long_sel)} — the short book is the stronger stock-picker.
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="panel p-4">
          <div className="panel-head">Contribution by Source <span className="muted" style={{ fontWeight: 400 }}>· raw legs, annualized</span></div>
          <div className="panel-sub mb-2">long / short leg P&amp;L + collateral − costs = total · long &amp; short reflect market beta, not just selection</div>
          <HBarChart bars={rawBars} valFmt={(v) => pctSign(v, 2)} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Beta-adjusted <span className="muted" style={{ fontWeight: 400 }}>· stock selection, annualized</span></div>
          <div className="panel-sub mb-2">each leg vs the equal-weight R2500 universe · the true alpha sources (market ≈ 0, dollar-neutral)</div>
          <HBarChart bars={selBars} valFmt={(v) => pctSign(v, 2)} />
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="panel p-4">
          <div className="panel-head">Rolling 12-Month Contribution <span className="muted" style={{ fontWeight: 400 }}>· raw legs</span></div>
          <div className="panel-sub mb-1">trailing-12-month sum of each source · how the mix shifts through time</div>
          {legend(rawRoll)}
          <MultiLineChart dates={dates} series={rawRoll} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={210} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Rolling 12-Month Contribution <span className="muted" style={{ fontWeight: 400 }}>· beta-adjusted</span></div>
          <div className="panel-sub mb-1">trailing-12-month sum · long-selection vs short-selection over time</div>
          {legend(selRoll)}
          <MultiLineChart dates={dates} series={selRoll} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={210} />
        </div>
      </div>
      <div className="panel p-4 mt-4">
        <div className="panel-head">Gross Return Composition <span className="muted" style={{ fontWeight: 400 }}>· beta-adjusted, stacked · rolling 12-month</span></div>
        <div className="panel-sub mb-1">the three alpha sources stacked — collateral + long-selection + short-selection ≈ gross return (market ≈ 0 omitted); the top line is their sum · short-selection dips below zero in the 2025 junk rally</div>
        <div className="flex gap-3 text-[10px] muted mb-1 flex-wrap">
          <span><span style={{ color: 'var(--cyan)' }}>■</span> Collateral</span>
          <span><span style={{ color: 'var(--pos)' }}>■</span> Long selection</span>
          <span><span style={{ color: 'var(--amber)' }}>■</span> Short selection</span>
          <span><span style={{ color: 'var(--tx)' }}>▬</span> ≈ Gross return (sum)</span>
        </div>
        <StackedAreaChart dates={dates.slice(11)} series={stackSel} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={240} />
      </div>
      <div className="panel p-4 mt-4">
        <div className="panel-head">Gross Exposure per Side <span className="muted" style={{ fontWeight: 400 }}>· long vs short weight, monthly</span></div>
        <div className="panel-sub mb-1">dollar-neutral (long ≈ −short); the level is vol-targeted — note the de-grossing as book vol rose</div>
        {legend(wSeries)}
        <MultiLineChart dates={dates} series={wSeries} refY={0} refLabel="0" yFmt={(v) => pct(v, 0)} height={190} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ monthly attribution (the fund, by component)
// Two shapes behind one table. mode 'ext': group 1 is the FUND (and holds Core α + Sleeve = Active
// exactly), group 2 is the L/S sleeve as a STANDALONE book on its own cost basis — context for the
// Sleeve column, not a breakdown of it. mode 'ls': group 2 only, for a standalone long-short book.
// ComponentAttrYear satisfies this shape too, so the monthly and annual tables share one renderer.
type CAVals = Pick<ComponentAttrPoint,
  'total_net' | 'index_ret' | 'active' | 'core_alpha' | 'sleeve_alpha' |
  'sleeve_net' | 'sleeve_long_sel' | 'sleeve_short_sel' | 'sleeve_collateral' | 'sleeve_cost'>;
interface CACol {
  key: keyof CAVals;
  label: string;
  cost?: boolean;      // a positive DRAG — render neutral, never green
  div?: boolean;       // draw the group divider on this column's left edge
}
const CA_EXT_COLS: CACol[] = [
  { key: 'total_net', label: 'Fund net' },
  { key: 'index_ret', label: 'Index' },
  { key: 'active', label: 'Active' },
  { key: 'core_alpha', label: 'Core α' },
  { key: 'sleeve_alpha', label: 'Sleeve' },
  { key: 'sleeve_net', label: 'Sleeve net', div: true },
  { key: 'sleeve_long_sel', label: 'Long sel' },
  { key: 'sleeve_short_sel', label: 'Short sel' },
  { key: 'sleeve_cost', label: 'Cost (drag)', cost: true },
];
const CA_LS_COLS: CACol[] = [
  { key: 'sleeve_net', label: 'Net (xs cash)' },
  { key: 'sleeve_long_sel', label: 'Long sel' },
  { key: 'sleeve_short_sel', label: 'Short sel' },
  { key: 'sleeve_collateral', label: 'Collateral' },
  { key: 'sleeve_cost', label: 'Cost (drag)', cost: true },
];

// Below 0.005% a return rounds to +0.00% at 2dp — colouring that green would read as a win that
// isn't there, so anything that small (and anything missing) stays neutral.
const CA_NEAR_ZERO = 5e-5;
const caColor = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) || Math.abs(v) < CA_NEAR_ZERO
    ? 'var(--tx-dim)' : (v > 0 ? 'var(--pos)' : 'var(--neg)');

function CACell({ v, col }: { v: number | null | undefined; col: CACol }) {
  const div = col.div ? { borderLeft: '2px solid var(--border)' } : undefined;
  if (v == null) return <td className="dim" style={div}>n/a</td>;
  if (col.cost) return <td style={{ ...div, color: 'var(--tx-mut)' }}>{pct(v, 2)}</td>;
  return <td style={{ ...div, color: caColor(v) }}>{pctSign(v, 2)}</td>;
}

function CATable({ cols, groups, firstHeader, rows }: {
  cols: CACol[];
  groups: { label: string; span: number }[];
  firstHeader: string;
  rows: { key: string; label: string; sub?: string; vals: CAVals }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="dtable" style={{ fontSize: 11 }}>
        <thead>
          {/* group header — `position: static` so only the column row sticks (they'd overlap otherwise) */}
          <tr>
            <th style={{ position: 'static' }} />
            {groups.map((g, i) => (
              <th key={g.label} colSpan={g.span} style={{
                position: 'static', textAlign: 'center', color: 'var(--tx-mut)',
                borderLeft: i > 0 ? '2px solid var(--border)' : undefined,
              }}>{g.label}</th>
            ))}
          </tr>
          <tr>
            <th>{firstHeader}</th>
            {cols.map((c) => (
              <th key={c.key} style={c.div ? { borderLeft: '2px solid var(--border)' } : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}{r.sub && <span className="dim" style={{ fontWeight: 400 }}> {r.sub}</span>}</td>
              {cols.map((c) => <CACell key={c.key} v={r.vals[c.key]} col={c} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComponentAttributionSection({ label }: { label: string }) {
  const { data, error } = useSWR(['pf-compattr', label],
    () => fetchPortfolioComponentAttribution(label), { revalidateOnFocus: false });
  if (error) return null;                                   // not a blend or L/S book → hide the section
  if (!data) return <div className="panel p-6 muted text-sm mt-5">Loading monthly attribution…</div>;

  const isExtMode = data.mode === 'ext';
  const cols = isExtMode ? CA_EXT_COLS : CA_LS_COLS;
  const kPct = Math.round((data.monthly[0]?.k ?? 0.5) * 100);
  const groups = isExtMode
    ? [{ label: 'The fund · Core α + Sleeve = Active', span: 5 },
       { label: `Sleeve book, standalone · full weight, own cost basis (enters the blend at ${kPct}%)`, span: 4 }]
    : [{ label: 'The long/short book · own cost basis', span: 5 }];
  // most recent first, in both tables
  const monthly = [...data.monthly].reverse();
  const annual = [...data.annual].reverse();

  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Monthly Attribution</h2>
        <span className="pill pill-cyan">last {monthly.length} months</span>
        <span className="text-[11px] muted">
          {isExtMode ? 'month by month, where the fund’s return came from — and what the sleeve book did on its own'
            : 'month by month, where the book’s return came from'}
        </span>
      </div>
      <div className="takeaway mb-3 text-[12px]">
        Months are labelled by the month the return was <b>earned</b> (the book is formed the month before).
        {isExtMode && <> <b>Core α + Sleeve = Active</b>, exactly, every month. The right-hand group is the
          L/S sleeve as a <b>standalone book at full weight on its own cost basis</b> — context for the
          Sleeve column, not a breakdown of it, so it does not add up to it.</>}
        {' '}Long sel and Short sel are beta-adjusted against the equal-weight Russell 2500 universe, so
        <b> Short sel is positive when the shorts underperform</b> — on both, positive is good. Cost is shown
        as a positive drag (subtract it).
      </div>

      <div className="panel p-4">
        <div className="panel-head">Monthly <span className="muted" style={{ fontWeight: 400 }}>· most recent first</span></div>
        <div className="panel-sub mb-2">monthly returns, % · n/a = not reported for that month</div>
        <CATable cols={cols} groups={groups} firstHeader="Month"
          rows={monthly.map((p) => ({ key: p.formation_date, label: p.realized_month, vals: p }))} />
      </div>

      <div className="panel p-4 mt-4">
        <div className="panel-head">Annual <span className="muted" style={{ fontWeight: 400 }}>· by the year the return was earned</span></div>
        <div className="panel-sub mb-2">arithmetic sums of the months, % · summing this way is what keeps
          {isExtMode ? ' Core α + Sleeve = Active' : ' the columns'} true at the year level · full history, most recent first</div>
        <CATable cols={cols} groups={groups} firstHeader="Year"
          rows={annual.map((y) => ({
            key: String(y.year), label: String(y.year),
            sub: y.n_months < 12 ? `· ${y.n_months} mo` : undefined, vals: y,
          }))} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------ style tilts (theme rollup of factor exposures)
const STYLE_THEMES: { name: string; factors: string[] }[] = [
  { name: 'Size', factors: ['size'] },
  { name: 'Value / Yield', factors: ['value', 'earnings_yield', 'dividend_yield'] },
  { name: 'Momentum', factors: ['momentum'] },
  { name: 'Quality', factors: ['profitability', 'earnings_qual', 'leverage'] },
  { name: 'Risk / Vol', factors: ['beta', 'resid_vol', 'liquidity'] },
  { name: 'Growth', factors: ['growth'] },
];
function StyleTilts({ label, title }: { label: string; title: string }) {
  const { data, error } = useSWR(['pf-style', label], () => fetchPortfolioAttribution(label), { revalidateOnFocus: false });
  if (error || !data) return null;                            // no attribution for this label → hide
  const exp = new Map(data.latest_exposures.map((e) => [e.factor, e.active_exposure ?? 0]));
  const bars = STYLE_THEMES.map((t) => ({ label: t.name, value: t.factors.reduce((s, f) => s + (exp.get(f) ?? 0), 0) }))
    .filter((b) => Math.abs(b.value) > 0.01).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  if (!bars.length) return <div className="panel p-4"><div className="panel-head">{title} <span className="muted" style={{ fontWeight: 400 }}>· style tilts</span></div><div className="dim text-[11px] py-6 text-center">≈ style-neutral</div></div>;
  return (
    <div className="panel p-4">
      <div className="panel-head">{title} <span className="muted" style={{ fontWeight: 400 }}>· style tilts</span></div>
      <div className="panel-sub mb-2">active exposure by style theme · σ-units vs benchmark</div>
      <HBarChart bars={bars} valFmt={(v) => (v >= 0 ? '+' : '') + v.toFixed(2)} />
    </div>
  );
}

// ------------------------------------------------------------ reusable sector-allocation panel (per label)
function SectorPanel({ label, isLS, title }: { label: string; isLS: boolean; title: string }) {
  const { data: sectors } = useSWR(['pf-sec', label], () => fetchPortfolioSectorAllocation(label), { revalidateOnFocus: false });
  const maxSec = Math.max(0.01, ...(sectors ?? []).flatMap((s) => [Math.abs(s.weight ?? 0), Math.abs(s.benchmark_weight ?? 0)]));
  return (
    <div className="panel p-4 flex flex-col">
      <div className="panel-head">{title} <span className="muted" style={{ fontWeight: 400 }}>· latest</span></div>
      <div className="panel-sub mb-2">{isLS ? 'net long − short weight by sector'
        : <><span style={{ color: 'var(--teal)' }}>■</span> portfolio vs <span style={{ color: 'var(--bench)' }}>■</span> cap-wtd benchmark · Active = over/underweight</>}</div>
      <div className="flex-1 flex flex-col justify-between min-h-0 gap-0.5">
        {(sectors ?? []).map((s) => {
          const w = s.weight ?? 0, frac = Math.abs(w) / maxSec;
          if (isLS) return (
            <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate muted text-right">{s.sector ?? '—'}</span>
              <div className="flex-1 relative h-3.5" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 2, opacity: 0.85,
                  background: w >= 0 ? 'var(--teal)' : 'var(--neg)', left: w >= 0 ? '50%' : `${50 - frac * 50}%`, width: `${frac * 50}%` }} />
              </div>
              <span className="mono w-12 text-right" style={{ color: w < 0 ? 'var(--neg)' : 'var(--tx)' }}>{pctSign(w)}</span>
            </div>
          );
          const bw = s.benchmark_weight ?? 0, aw = s.active_weight ?? (w - bw);
          return (
            <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[11px]">
              <span className="w-28 truncate muted text-right">{s.sector ?? '—'}</span>
              <div className="flex-1 space-y-1">
                <div className="relative h-2.5" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, background: 'var(--teal)', opacity: 0.9, width: `${(Math.abs(w) / maxSec) * 100}%` }} />
                </div>
                <div className="relative h-2.5" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, background: 'var(--bench)', opacity: 0.7, width: `${(Math.abs(bw) / maxSec) * 100}%` }} />
                </div>
              </div>
              <span className="mono w-9 text-right" style={{ color: 'var(--tx)' }}>{pct(w)}</span>
              <span className="mono w-11 text-right" style={{ color: aw >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{pctSign(aw)}</span>
            </div>
          );
        })}
        {(!sectors || sectors.length === 0) && <div className="dim text-[11px] py-4 text-center">Loading…</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ reusable holdings panel (per label)
function HoldingsPanel({ label, isLS, longTitle }: { label: string; isLS: boolean; longTitle: string }) {
  const { data: holdings } = useSWR(['pf-hold', label], () => fetchPortfolioHoldings(label, undefined), { revalidateOnFocus: false });
  const longs = (holdings ?? []).filter((h) => (h.weight ?? 0) > 0);
  const shorts = (holdings ?? []).filter((h) => (h.weight ?? 0) < 0);
  return (
    <div className={`grid grid-cols-1 gap-4 ${isLS ? 'xl:grid-cols-2' : ''}`}>
      <HoldingsTable rows={longs} title={isLS ? 'Top Longs' : longTitle} showBench={!isLS}
        note={isLS ? 'latest rebalance · Δ mo = weight change vs prior · click a header to sort'
          : 'latest rebalance · Active = weight − benchmark · Δ mo = change vs prior · click a header to sort'} />
      {isLS && <HoldingsTable rows={shorts} title="Top Shorts" note="latest rebalance · Δ mo = weight change vs prior · click a header to sort" />}
    </div>
  );
}

// ------------------------------------------------------------ 130/30 ext: beta profile + capital deployment
function ExtBetaDeployment({ label, benchName }: { label: string; benchName: string }) {
  const { data: neu } = useSWR(['pf-neutral', label], () => fetchPortfolioNeutrality(label), { revalidateOnFocus: false });
  const { data: dep } = useSWR(['pf-deploy', label], () => fetchPortfolioDeployment(label), { revalidateOnFocus: false });
  const ndates = neu?.monthly.map((p) => realizedMonth(p.date)) ?? [];
  const s = dep?.summary;
  const depBars = s ? [
    { label: 'Core long', value: s.core_long ?? 0 },
    { label: `Sleeve long (${Math.round((s.k ?? 0.5) * 100)}%)`, value: s.sleeve_long ?? 0 },
    { label: 'Sleeve short', value: s.sleeve_short ?? 0 },
    { label: 'Cash', value: s.cash ?? 0 },
  ] : [];
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Beta & Capital Deployment</h2>
        <span className="text-[11px] muted">the whole book: full-equity beta (the sleeve adds none) + where the $ and leverage go</span>
      </div>
      {s && (
        <div className="takeaway mb-3 text-[12px]">
          <b>Net {pct(s.net, 0)} long, gross {pct(s.gross, 0)} ({num((s.gross ?? 2) / Math.max(0.01, s.net ?? 1), 1)}× on capital)</b> — core long {pct(s.core_long, 0)}, a {Math.round((s.k ?? 0.5) * 100)}% L/S sleeve (+{pct(s.sleeve_long, 0)} / {pct(s.sleeve_short, 0)}), cash {pct(s.cash, 0)}. Fully invested & self-funded (short proceeds fund the sleeve longs), so net β ≈ 1.0 — full {benchName} exposure, no cash drag.
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="panel-head">Capital Deployment <span className="muted" style={{ fontWeight: 400 }}>· % of capital</span></div>
          <div className="panel-sub mb-2">core + the k× L/S sleeve · gross = Σ|exposure|, net ≈ 100%</div>
          <HBarChart bars={depBars} valFmt={(v) => pctSign(v, 0)} />
          {s && <div className="mt-2 pt-2 text-[11px] flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="muted">Net <b style={{ color: 'var(--tx)' }}>{pct(s.net, 0)}</b></span>
            <span className="muted">Gross <b style={{ color: 'var(--tx)' }}>{pct(s.gross, 0)}</b></span></div>}
        </div>
        <div className="panel p-4">
          <div className="panel-head">Net Market Beta <span className="muted" style={{ fontWeight: 400 }}>· Σ wᵢ·βᵢ</span></div>
          <div className="panel-sub mb-1">raw 60-month betas · ≈ 1.0 = full equity (the dollar-neutral sleeve adds ~0)</div>
          <MultiLineChart dates={ndates} series={[{ label: 'Net β', color: 'var(--cyan)', values: neu?.monthly.map((p) => p.net_beta) ?? [] }]} refY={1} refLabel="1.0" yFmt={(v) => v.toFixed(2)} height={185} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Gross Exposure <span className="muted" style={{ fontWeight: 400 }}>· over time</span></div>
          <div className="panel-sub mb-1">total book leverage · rises/falls as the sleeve is vol-targeted</div>
          <MultiLineChart dates={dep?.monthly.map((p) => realizedMonth(p.date)) ?? []} series={[
            { label: 'Gross', color: 'var(--teal)', values: dep?.monthly.map((p) => p.gross) ?? [] },
            { label: 'Net', color: 'var(--bench)', values: dep?.monthly.map((p) => p.net) ?? [] },
          ]} refY={1} refLabel="1.0" yFmt={(v) => pct(v, 0)} height={185} />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ 130/30 ext: per-component positioning (core vs sleeve)
function ExtComponentPositioning({ coreLabel, sleeveLabel, coreName, sleeveName }:
  { coreLabel: string; sleeveLabel: string; coreName: string; sleeveName: string }) {
  return (
    <div className="mt-5">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Positioning by Engine</h2>
        <span className="text-[11px] muted">sector, style &amp; holdings for each sleeve, vs its OWN benchmark — a combined view would misread the cross-universe sleeve as a size bet</span>
      </div>
      {/* CORE (long-only equity) */}
      <div className="text-[11px] font-bold tracking-wider mb-2" style={{ color: 'var(--teal)' }}>◆ CORE · {coreName} <span className="muted" style={{ fontWeight: 400 }}>(the 100% net-long equity book)</span></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-3">
        <SectorPanel label={coreLabel} isLS={false} title="Core Sector Allocation" />
        <StyleTilts label={coreLabel} title="Core" />
      </div>
      <HoldingsPanel label={coreLabel} isLS={false} longTitle="Core Top Holdings" />
      {/* SLEEVE (dollar-neutral L/S overlay) */}
      <div className="text-[11px] font-bold tracking-wider mb-2 mt-5" style={{ color: 'var(--amber)' }}>◆ SLEEVE · {sleeveName} <span className="muted" style={{ fontWeight: 400 }}>(the dollar-neutral L/S overlay, shown at full weight; enters the blend at 50%)</span></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-3">
        <SectorPanel label={sleeveLabel} isLS={true} title="Sleeve Net Sector Exposure" />
        <StyleTilts label={sleeveLabel} title="Sleeve" />
      </div>
      <HoldingsPanel label={sleeveLabel} isLS={true} longTitle="Sleeve Holdings" />
    </div>
  );
}

export function BacktestReport({ label, backHref = '/research/portfolios', backLabel = '← Back to Portfolios',
  periodLabel = 'Out-of-sample 2005–2023', boundaryDate, topSlot, costAum = AUM_MUSD }:
  { label: string; backHref?: string; backLabel?: string; periodLabel?: string; boundaryDate?: string;
    topSlot?: React.ReactNode; costAum?: number }) {
  const { data, error } = useSWR(['pf-detail', label], () => fetchPortfolioDetail(label), { revalidateOnFocus: false });
  const { data: holdings } = useSWR(['pf-hold', label], () => fetchPortfolioHoldings(label, undefined), { revalidateOnFocus: false });
  const { data: sectors } = useSWR(['pf-sec', label], () => fetchPortfolioSectorAllocation(label), { revalidateOnFocus: false });
  // ext blends: the component labels (for per-component positioning) come from the decomposition row
  const { data: decomp } = useSWR(['pf-decomp', label], () => fetchPortfolioDecomposition(label), { revalidateOnFocus: false });

  if (error) return <Back backHref={backHref} backLabel={backLabel}><div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load {label}.</div></Back>;
  if (!data) return <Back backHref={backHref} backLabel={backLabel}><div className="panel p-16 text-center muted text-sm">Loading report…</div></Back>;

  const m = data.meta;
  const isLS = m.strategy === 'long_short';
  const isExt = m.strategy === 'ext';                        // 130/30 extension blend → per-component views
  const benchName = m.benchmark_report === 'sp500tr' ? 'S&P 500' : 'Russell 2000';
  const uni = m.universe === 'r2500' ? 'r2500' : 'sp500';
  const modelsHref = uni === 'r2500' ? '/research/r2500-models' : '/research/models';
  const factorsHref = uni === 'r2500' ? '/research/r2500-factors' : '/research/factors';
  const monthly = data.monthly;
  // Chart x-axis on REALIZATION months (M+1) so the curve sits on the calendar month each return was
  // earned (portfolio.returns is formation-dated; see realizedMonth). Purely a display shift — the raw
  // formation `date` still drives the OOS split on the landing/strategy pages.
  const dates = monthly.map((p) => realizedMonth(p.date));
  const bDate = boundaryDate ? realizedMonth(boundaryDate) : undefined;   // boundary in realization space
  // Active/excess series. Long-only: net return vs the equity index (as stored). L/S: the
  // collateral-CREDITED excess over cash (book net − haircut), so the distribution, rolling IR,
  // best/worst and hit-rate all match the annual table's "Excess over cash" convention rather
  // than the old port−cost−rf double-count. (Rolling vol is ~convention-invariant either way.)
  const active = monthly.map((p) =>
    isLS ? (p.portfolio_net == null ? null : p.portfolio_net - COLLATERAL_HAIRCUT_ANN / 12) : p.active_return);
  const cons = [m.te_target != null ? `${isLS ? 'vol' : 'TE'} ${pct(m.te_target, 0)}` : null,
    `sector ${fmtSector(m.sector_tol)}`, `turnover ${fmtTurn(m.turnover_cap)}`, `λ${m.lambda_risk}`].filter(Boolean).join(' · ');

  // L/S headline in the collateral-credited convention. Computed once in the API (_add_credited) and
  // served on the meta, so the browse grid and this report show the SAME numbers (single source).
  const annTotal = isLS ? m.ann_total_credited : null;         // total return incl. cash on collateral
  const shownIR = isLS ? m.ir_credited : (m.ir ?? null);       // IR on the credited excess over cash

  const annual = buildAnnualTable(monthly, isLS);
  const drawdowns = buildDrawdownTable(monthly, 5);
  // Max-DD KPI reads the SAME (credited-total for L/S) monthly drawdown the chart plots, so card = chart.
  const chartMaxDD = monthly.length ? Math.min(0, ...monthly.map((p) => p.drawdown ?? 0)) : (m.max_drawdown ?? null);
  const liveTo = boundaryDate && dates.length ? dates[dates.length - 1].slice(0, 7) : null;
  const cap = captureRatios(monthly);
  const astat = activeStats(active);
  const bins = histogram(active.filter((v): v is number => v != null), 25);
  const rIR = rollingIR(active);
  const rTE = rollingVol(active);
  const longs = (holdings ?? []).filter((h) => (h.weight ?? 0) > 0);
  const shorts = (holdings ?? []).filter((h) => (h.weight ?? 0) < 0);
  const maxAnnual = Math.max(0.01, ...annual.map((a) => Math.abs(a.active)));
  const maxSec = Math.max(0.01, ...(sectors ?? []).flatMap((s) => [Math.abs(s.weight ?? 0), Math.abs(s.benchmark_weight ?? 0)]));

  return (
    <Back backHref={backHref} backLabel={backLabel}>
      {topSlot}
      {/* config header */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{m.signal_model_id} · {m.experiment}</h1>
        <span className="pill pill-cyan">{uni === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{isLS ? 'Long-short' : 'Long-only'}</span>
        <span className="pill pill-ok">{pct(m.opt_pct, 0)} optimal</span>
        <span className="pill pill-warn">{periodLabel}{liveTo ? ` · live to ${liveTo}` : ''}</span>
        <span className="pill pill-cyan">Net of realistic cost · ${costAum}M</span>
        <span className="mono text-[11px] muted">{cons}</span>
        <span className="ml-auto text-[11px] muted">Drill ▸ <Link href={modelsHref} className="teal font-semibold">{m.signal_model_id} (P02)</Link> ▸ <Link href={factorsHref} className="teal font-semibold">Factors (P01)</Link></span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 mb-4">
        {isExt && <Stat label="Total Return" value={pctSign(decomp?.summary.ann_total)} sub="incl. equity beta" color={(decomp?.summary.ann_total ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />}
        <Stat label={isLS ? 'Ann Return' : 'Ann Active'} value={pctSign(isLS ? annTotal : m.ann_active)} sub={isLS ? 'total, incl. cash' : (isExt ? 'alpha vs benchmark' : 'vs cap-wtd universe')} color={((isLS ? annTotal : m.ann_active) ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <Stat label="Info Ratio" value={num(shownIR)} sub={isLS ? 'excess/cash' : ' '} />
        <Stat label="Sharpe (net)" value={num(m.sharpe_net)} sub=" " />
        <Stat label={isLS ? 'Realized Vol' : 'Realized TE'} value={pct(m.realized_te)} sub={m.te_target != null ? `target ${pct(m.te_target, 0)}` : ' '} />
        <Stat label="Max Drawdown" value={pct(isLS ? chartMaxDD : m.max_drawdown, 0)} sub={astat ? `hit ${pct(astat.hit, 0)}` : ' '} color="var(--neg)" />
        <Stat label="Up capture" value={cap.up != null ? num(cap.up) : '—'} sub={cap.down != null ? `down ${num(cap.down)}` : 'vs benchmark'} />
        <Stat label="Turnover/mo" value={pct(m.avg_turnover, 0)} sub={`TC ${num(m.tc_drag_bps, 1)}bps`} />
        {!isExt && <Stat label="Optimal" value={pct(m.opt_pct, 0)} sub={`${pct(m.inacc_pct, 0)} inacc`} />}
      </div>

      {/* performance + positioning */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className={`panel p-4 ${isExt ? 'xl:col-span-3' : 'xl:col-span-2'}`}>
          <div className="panel-head">Cumulative Net Return</div>
          <div className="panel-sub mb-1">Growth of 100 · {isLS ? 'total return incl. collateral cash, ' : ''}net of cost · log scale · vs {isLS ? 'cash (market-neutral)' : 'cap-weighted universe'}</div>
          <div className="flex gap-4 text-[10px] muted mb-1">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Portfolio</span>
            <span><span style={{ color: 'var(--bench)' }}>■</span> {isLS ? 'Cash' : 'Benchmark'}</span>
          </div>
          <CumulativeChart dates={dates} boundaryDate={bDate} log series={[
            { label: 'Portfolio', color: 'var(--teal)', values: monthly.map((p) => p.cum_portfolio) },
            { label: 'Benchmark', color: 'var(--bench)', values: monthly.map((p) => p.cum_benchmark), dash: true },
          ]} />
          <div className="panel-head mt-3">Drawdown</div>
          <DrawdownChart dates={dates} dd={monthly.map((p) => p.drawdown)} boundaryDate={bDate} />
          {(isLS || isExt) && dates.length > 0
            && dates[dates.length - 1] >= realizedMonth(CONSTRUCTION_FIRST_CHANGE) && (
            <div className="mt-3 pt-2 text-[10px] muted" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--amber)' }}>▲</span>{' '}
              <strong style={{ fontWeight: 600 }}>Construction changes inside this track.</strong>{' '}
              The curve above is not one construction measured throughout — the short book is built
              differently before and after these dates, so a pre- vs post-August comparison is not
              like-for-like.
              <ul className="mt-1 space-y-0.5" style={{ listStyle: 'none' }}>
                {CONSTRUCTION_CHANGES.map((c) => (
                  <li key={c.from}>
                    <span className="mono">{c.from}</span> — {c.what}: {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* sector allocation + style-tilt rollup (right column) — ext blends show these per-component below */}
        {!isExt && (
        <div className="flex flex-col gap-4">
        <div className="panel p-4 flex flex-col flex-1">
          <div className="panel-head">Sector {isLS ? 'Net Exposure' : 'Allocation'} <span className="muted" style={{ fontWeight: 400 }}>· latest</span></div>
          <div className="panel-sub mb-2">{isLS ? 'net long − short weight by sector'
            : <><span style={{ color: 'var(--teal)' }}>■</span> portfolio vs <span style={{ color: 'var(--bench)' }}>■</span> cap-wtd benchmark · Active = over/underweight</>}</div>
          <div className="flex-1 flex flex-col justify-between min-h-0">
            {(sectors ?? []).map((s) => {
              const w = s.weight ?? 0, frac = Math.abs(w) / maxSec;
              if (isLS) return (
                <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 truncate muted text-right">{s.sector ?? '—'}</span>
                  <div className="flex-1 relative h-3.5" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
                    <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--border)' }} />
                    <div style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 2, opacity: 0.85,
                      background: w >= 0 ? 'var(--teal)' : 'var(--neg)',
                      left: w >= 0 ? '50%' : `${50 - frac * 50}%`, width: `${frac * 50}%` }} />
                  </div>
                  <span className="mono w-12 text-right" style={{ color: w < 0 ? 'var(--neg)' : 'var(--tx)' }}>{pctSign(w)}</span>
                </div>
              );
              // long-only: portfolio bar over benchmark bar + active over/underweight
              const bw = s.benchmark_weight ?? 0, aw = s.active_weight ?? (w - bw);
              return (
                <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[11px]">
                  <span className="w-28 truncate muted text-right">{s.sector ?? '—'}</span>
                  <div className="flex-1 space-y-1">
                    <div className="relative h-2.5" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, background: 'var(--teal)', opacity: 0.9, width: `${(Math.abs(w) / maxSec) * 100}%` }} />
                    </div>
                    <div className="relative h-2.5" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, background: 'var(--bench)', opacity: 0.7, width: `${(Math.abs(bw) / maxSec) * 100}%` }} />
                    </div>
                  </div>
                  <span className="mono w-9 text-right" style={{ color: 'var(--tx)' }}>{pct(w)}</span>
                  <span className="mono w-11 text-right" style={{ color: aw >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{pctSign(aw)}</span>
                </div>
              );
            })}
            {(!sectors || sectors.length === 0) && <div className="dim text-[11px] py-4 text-center">Loading…</div>}
          </div>
        </div>
        <StyleTilts label={label} title="Style" />
        </div>
        )}
      </div>

      {/* 130/30 extension: two-engine decomposition + beta/capital-deployment (combined book) */}
      {isExt && <DecompositionSection label={label} benchName={benchName} />}
      {isExt && <ExtBetaDeployment label={label} benchName={benchName} />}

      {/* net-of-cost bridge */}
      <CostBridgeSection label={label} isLS={isLS} aum={costAum} />

      {/* L/S only: collateral-credited investor return (T9) + market-neutrality (F2) */}
      {isLS && <NeutralitySection label={label} />}
      {isLS && <SourceAttributionSection label={label} />}

      {/* month-by-month component attribution — ext blends (fund + sleeve book) and standalone L/S books */}
      {(isExt || isLS) && <ComponentAttributionSection label={label} />}

      {/* annual returns table */}
      <div className="panel p-4 mt-4">
        <div className="panel-head mb-2">Annual Returns <span className="muted" style={{ fontWeight: 400 }}>· net, %{isLS ? ' — total return = cash + excess' : ' — active shaded by magnitude'}</span></div>
        <div className="overflow-x-auto">
          <table className="dtable" style={{ fontSize: 11 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Year</th>{annual.map((a) => <th key={a.year}>{a.year}</th>)}</tr></thead>
            <tbody>
              <tr><td style={{ textAlign: 'left' }} className="muted">{isLS ? 'Total return' : 'Portfolio'}</td>{annual.map((a) => <td key={a.year}>{pctSign(a.portfolio, 1)}</td>)}</tr>
              <tr><td style={{ textAlign: 'left' }} className="muted">{isLS ? 'Cash' : 'Benchmark'}</td>{annual.map((a) => <td key={a.year} className="dim">{pctSign(a.benchmark, 1)}</td>)}</tr>
              <tr><td style={{ textAlign: 'left' }} className="muted">{isLS ? 'Excess over cash' : 'Active'}</td>{annual.map((a) => (
                <td key={a.year} style={{
                  color: a.active >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 500,
                  background: `${a.active >= 0 ? 'rgba(21,128,61,' : 'rgba(185,28,28,'}${Math.min(0.28, Math.abs(a.active) / maxAnnual * 0.28).toFixed(3)})`,
                }}>{pctSign(a.active, 1)}</td>
              ))}</tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* rolling metrics */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="panel p-4">
          <div className="panel-head">Rolling 12-month Information Ratio</div>
          <div className="panel-sub mb-1">trailing-year active return ÷ tracking error · above 0 beats the benchmark</div>
          <MultiLineChart dates={dates} series={[{ label: 'IR', color: 'var(--teal)', values: rIR }]} refY={0} refLabel="0" yFmt={(v) => v.toFixed(1)} height={190} />
        </div>
        <div className="panel p-4">
          <div className="panel-head">Rolling 12-month {isLS ? 'Volatility' : 'Tracking Error'}</div>
          <div className="panel-sub mb-1">annualized{m.te_target != null ? ` · dashed line = ${pct(m.te_target, 0)} target` : ''}</div>
          <MultiLineChart dates={dates} series={[{ label: 'TE', color: 'var(--cyan)', values: rTE }]} refY={m.te_target ?? null} refLabel={m.te_target != null ? pct(m.te_target, 0) : undefined} yFmt={(v) => pct(v, 0)} height={190} />
        </div>
      </div>

      {/* distribution + drawdown table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="panel p-4">
          <div className="panel-head">Monthly {isLS ? 'Excess-over-Cash' : 'Active Return'} Distribution</div>
          <div className="panel-sub mb-1">{astat ? `${astat.n} months · hit rate ${pct(astat.hit, 0)} · best ${pctSign(astat.best, 1)} · worst ${pctSign(astat.worst, 1)}` : ' '}</div>
          <Histogram bins={bins} xFmt={(v) => pct(v, 1)} height={160} />
        </div>
        <div className="panel p-4">
          <div className="panel-head mb-2">Deepest Drawdowns</div>
          <table className="dtable" style={{ fontSize: 11 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Depth</th><th>Peak</th><th>Trough</th><th>Recovered</th></tr></thead>
            <tbody>
              {drawdowns.map((d, i) => (
                <tr key={i}>
                  <td style={{ textAlign: 'left', color: 'var(--neg)', fontFamily: 'inherit' }}>{pct(d.depth, 1)}</td>
                  <td className="dim">{d.peak.slice(0, 7)}</td>
                  <td className="dim">{d.trough.slice(0, 7)}</td>
                  <td className="dim">{d.recovery ? d.recovery.slice(0, 7) : <span className="neg">ongoing</span>}</td>
                </tr>
              ))}
              {drawdowns.length === 0 && <tr><td colSpan={4} className="dim" style={{ textAlign: 'center' }}>—</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ext blends: per-component positioning (core + sleeve, each vs its OWN benchmark) replaces the
          combined attribution + holdings — a combined view misreads the cross-universe sleeve as a size bet */}
      {isExt ? (
        (decomp?.summary.core_label && decomp?.summary.sleeve_label) ? (
          <ExtComponentPositioning
            coreLabel={decomp.summary.core_label} sleeveLabel={decomp.summary.sleeve_label}
            coreName={uni === 'sp500' ? 'S&P 500 Long-Only' : 'Russell 2500 Long-Only'}
            sleeveName="Russell 2500 Long-Short (te8)" />
        ) : null
      ) : (
        <>
          {/* factor attribution */}
          <AttributionSection label={label} isLS={isLS} />

          {/* holdings */}
          <div className={`grid grid-cols-1 gap-4 mt-4 ${isLS ? 'xl:grid-cols-2' : ''}`}>
            <HoldingsTable rows={longs} title={isLS ? 'Top Longs' : 'Top Holdings'} showBench={!isLS}
              note={isLS ? 'latest rebalance · Δ mo = weight change vs prior rebalance · click a header to sort'
                : 'latest rebalance · Active = weight − benchmark · Δ mo = change vs prior rebalance · click a header to sort'} />
            {isLS && (shorts.length > 0
              ? <HoldingsTable rows={shorts} title="Top Shorts" note="latest rebalance · Δ mo = weight change vs prior rebalance · click a header to sort" />
              : <div className="panel p-4"><div className="panel-head">Top Shorts</div><div className="dim text-[11px] py-8 text-center">Short book re-persisting — refresh shortly.</div></div>)}
          </div>
        </>
      )}

      <div className="text-[10px] dim mt-4" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
        {periodLabel}. {isLS ? 'Market-neutral: benchmark = cash, so a position’s weight IS its active bet.' : 'Active weight = portfolio − cap-weighted benchmark, per name and per sector.'} Net returns are charged the realistic per-name trading cost model (Corwin–Schultz half-spread + √-law market impact + IBKR Pro Fixed commission{isLS ? ' + flat borrow on shorts' : ''}) at <b>${costAum}M AUM</b> — see the Net-of-Cost Bridge. {isExt ? 'Returns split into index beta + core selection + the L/S sleeve overlay (see the Two-Engine Decomposition above); each engine is shown against its own benchmark.' : <>Factor attribution decomposes the gross {isLS ? 'book P&L' : 'active return'} against the Phase-3 risk model (24 factors + specific); factor + specific reconciles to the realized {isLS ? 'P&L' : 'active return'} to machine precision each month.</>} Config label: <span className="mono">{label}</span>
      </div>
    </Back>
  );
}

function Back({ backHref, backLabel, children }: { backHref: string; backLabel: string; children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <Link href={backHref} className="text-[11px] teal font-semibold">{backLabel}</Link>
      <div className="mt-2">{children}</div>
    </div>
  );
}
