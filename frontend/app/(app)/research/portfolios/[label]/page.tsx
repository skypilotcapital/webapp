'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import {
  fetchPortfolioDetail, fetchPortfolioHoldings, fetchPortfolioSectorAllocation,
  fetchPortfolioAttribution, fetchPortfolioAttributionTimeseries,
} from '@/lib/api';
import {
  pct, pctSign, num, fmtSector, fmtTurn,
  buildAnnualTable, buildDrawdownTable, captureRatios, activeStats, histogram, rollingIR, rollingVol,
} from '@/lib/portfolio';
import { CumulativeChart, DrawdownChart, MultiLineChart, Histogram, HBarChart } from '@/components/portfolio/charts';
import type { PortfolioHolding } from '@/types/api';

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

  const dates = (ts ?? []).map((p) => p.date);
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

export default function BacktestReportPage() {
  const label = decodeURIComponent((useParams().label as string) || '');
  const { data, error } = useSWR(['pf-detail', label], () => fetchPortfolioDetail(label), { revalidateOnFocus: false });
  const { data: holdings } = useSWR(['pf-hold', label], () => fetchPortfolioHoldings(label, undefined), { revalidateOnFocus: false });
  const { data: sectors } = useSWR(['pf-sec', label], () => fetchPortfolioSectorAllocation(label), { revalidateOnFocus: false });

  if (error) return <Back label={label}><div className="panel p-8 text-sm" style={{ color: 'var(--neg)' }}>Failed to load {label}.</div></Back>;
  if (!data) return <Back label={label}><div className="panel p-16 text-center muted text-sm">Loading report…</div></Back>;

  const m = data.meta;
  const isLS = m.strategy === 'long_short';
  const uni = m.universe === 'r2500' ? 'r2500' : 'sp500';
  const modelsHref = uni === 'r2500' ? '/research/r2500-models' : '/research/models';
  const factorsHref = uni === 'r2500' ? '/research/r2500-factors' : '/research/factors';
  const monthly = data.monthly;
  const dates = monthly.map((p) => p.date);
  const active = monthly.map((p) => p.active_return);
  const cons = [m.te_target != null ? `${isLS ? 'vol' : 'TE'} ${pct(m.te_target, 0)}` : null,
    `sector ${fmtSector(m.sector_tol)}`, `turnover ${fmtTurn(m.turnover_cap)}`, `λ${m.lambda_risk}`].filter(Boolean).join(' · ');

  const annual = buildAnnualTable(monthly);
  const drawdowns = buildDrawdownTable(monthly, 5);
  const cap = captureRatios(monthly);
  const astat = activeStats(monthly);
  const bins = histogram(active.filter((v): v is number => v != null), 25);
  const rIR = rollingIR(active);
  const rTE = rollingVol(active);
  const longs = (holdings ?? []).filter((h) => (h.weight ?? 0) > 0);
  const shorts = (holdings ?? []).filter((h) => (h.weight ?? 0) < 0);
  const maxAnnual = Math.max(0.01, ...annual.map((a) => Math.abs(a.active)));
  const maxSec = Math.max(0.01, ...(sectors ?? []).flatMap((s) => [Math.abs(s.weight ?? 0), Math.abs(s.benchmark_weight ?? 0)]));

  return (
    <Back label={label}>
      {/* config header */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tx)' }}>{m.signal_model_id} · {m.experiment}</h1>
        <span className="pill pill-cyan">{uni === 'sp500' ? 'S&P 500' : 'Russell 2500'}</span>
        <span className="pill pill-cyan">{isLS ? 'Long-short' : 'Long-only'}</span>
        <span className="pill pill-ok">{pct(m.opt_pct, 0)} optimal</span>
        <span className="pill pill-warn">Out-of-sample 2005–2023</span>
        <span className="mono text-[11px] muted">{cons}</span>
        <span className="ml-auto text-[11px] muted">Drill ▸ <Link href={modelsHref} className="teal font-semibold">{m.signal_model_id} (P02)</Link> ▸ <Link href={factorsHref} className="teal font-semibold">Factors (P01)</Link></span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 mb-4">
        <Stat label={isLS ? 'Ann Return' : 'Ann Active'} value={pctSign(m.ann_active)} sub={isLS ? 'over cash' : 'vs cap-wtd universe'} color={(m.ann_active ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
        <Stat label="Info Ratio" value={num(m.ir)} sub=" " />
        <Stat label="Sharpe (net)" value={num(m.sharpe_net)} sub=" " />
        <Stat label={isLS ? 'Realized Vol' : 'Realized TE'} value={pct(m.realized_te)} sub={`target ${pct(m.te_target, 0)}`} />
        <Stat label="Max Drawdown" value={pct(m.max_drawdown, 0)} sub={astat ? `hit ${pct(astat.hit, 0)}` : ' '} color="var(--neg)" />
        <Stat label="Up capture" value={cap.up != null ? num(cap.up) : '—'} sub={cap.down != null ? `down ${num(cap.down)}` : 'vs benchmark'} />
        <Stat label="Turnover/mo" value={pct(m.avg_turnover, 0)} sub={`TC ${num(m.tc_drag_bps, 1)}bps`} />
        <Stat label="Optimal" value={pct(m.opt_pct, 0)} sub={`${pct(m.inacc_pct, 0)} inacc`} />
      </div>

      {/* performance + positioning */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="panel p-4 xl:col-span-2">
          <div className="panel-head">Cumulative Net Return</div>
          <div className="panel-sub mb-1">Growth of 100 · net of cost · vs {isLS ? 'cash (market-neutral)' : 'cap-weighted universe'}</div>
          <div className="flex gap-4 text-[10px] muted mb-1">
            <span><span style={{ color: 'var(--teal)' }}>■</span> Portfolio</span>
            <span><span style={{ color: 'var(--bench)' }}>■</span> {isLS ? 'Cash' : 'Benchmark'}</span>
          </div>
          <CumulativeChart dates={dates} series={[
            { label: 'Portfolio', color: 'var(--teal)', values: monthly.map((p) => p.cum_portfolio) },
            { label: 'Benchmark', color: 'var(--bench)', values: monthly.map((p) => p.cum_benchmark), dash: true },
          ]} />
          <div className="panel-head mt-3">Drawdown</div>
          <DrawdownChart dates={dates} dd={monthly.map((p) => p.drawdown)} />
        </div>

        {/* sector exposure */}
        <div className="panel p-4">
          <div className="panel-head">Sector {isLS ? 'Net Exposure' : 'Allocation'} <span className="muted" style={{ fontWeight: 400 }}>· latest</span></div>
          <div className="panel-sub mb-2">{isLS ? 'net long − short weight by sector'
            : <><span style={{ color: 'var(--teal)' }}>■</span> portfolio vs <span style={{ color: 'var(--bench)' }}>■</span> cap-wtd benchmark · Active = over/underweight</>}</div>
          <div className="space-y-1.5">
            {(sectors ?? []).map((s) => {
              const w = s.weight ?? 0, frac = Math.abs(w) / maxSec;
              if (isLS) return (
                <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[10.5px]">
                  <span className="w-24 truncate muted text-right">{s.sector ?? '—'}</span>
                  <div className="flex-1 relative h-2.5" style={{ background: 'var(--panel2)', borderRadius: 3 }}>
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
                <div key={s.sector ?? 'na'} className="flex items-center gap-2 text-[10.5px]">
                  <span className="w-24 truncate muted text-right">{s.sector ?? '—'}</span>
                  <div className="flex-1 space-y-0.5">
                    <div className="relative h-2" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
                      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 2, background: 'var(--teal)', opacity: 0.9, width: `${(Math.abs(w) / maxSec) * 100}%` }} />
                    </div>
                    <div className="relative h-2" style={{ background: 'var(--panel2)', borderRadius: 2 }}>
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
      </div>

      {/* annual returns table */}
      <div className="panel p-4 mt-4">
        <div className="panel-head mb-2">Annual Returns <span className="muted" style={{ fontWeight: 400 }}>· net, % — active shaded by magnitude</span></div>
        <div className="overflow-x-auto">
          <table className="dtable" style={{ fontSize: 11 }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Year</th>{annual.map((a) => <th key={a.year}>{a.year}</th>)}</tr></thead>
            <tbody>
              <tr><td style={{ textAlign: 'left' }} className="muted">Portfolio</td>{annual.map((a) => <td key={a.year}>{pctSign(a.portfolio, 1)}</td>)}</tr>
              <tr><td style={{ textAlign: 'left' }} className="muted">{isLS ? 'Cash' : 'Benchmark'}</td>{annual.map((a) => <td key={a.year} className="dim">{pctSign(a.benchmark, 1)}</td>)}</tr>
              <tr><td style={{ textAlign: 'left' }} className="muted">Active</td>{annual.map((a) => (
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
          <div className="panel-sub mb-1">annualized · dashed line = {pct(m.te_target, 0)} target</div>
          <MultiLineChart dates={dates} series={[{ label: 'TE', color: 'var(--cyan)', values: rTE }]} refY={m.te_target ?? 0} refLabel={pct(m.te_target, 0)} yFmt={(v) => pct(v, 0)} height={190} />
        </div>
      </div>

      {/* distribution + drawdown table */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="panel p-4">
          <div className="panel-head">Monthly Active Return Distribution</div>
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

      <div className="text-[10px] dim mt-4" style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
        Out-of-sample 2005–2023. {isLS ? 'Market-neutral: benchmark = cash, so a position’s weight IS its active bet.' : 'Active weight = portfolio − cap-weighted benchmark, per name and per sector.'} Factor attribution decomposes the {isLS ? 'book P&L' : 'active return'} against the Phase-3 risk model (24 factors + specific); factor + specific reconciles to the realized {isLS ? 'P&L' : 'active return'} to machine precision each month. Config label: <span className="mono">{label}</span>
      </div>
    </Back>
  );
}

function Back({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="animate-in">
      <Link href="/research/portfolios" className="text-[11px] teal font-semibold">← Back to Portfolios</Link>
      <div className="mt-2">{children}</div>
    </div>
  );
}
