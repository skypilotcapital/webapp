'use client';

import { useState, useMemo, Suspense, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetchPortfolioBacktests, fetchPortfolioDetail, fetchModelScorecard } from '@/lib/api';
import {
  buildSweeps, buildABPairs, buildCompareConfigs, defaultCompareConfig,
  rollingIR, rollingBatting, rollingExcess,
  pct, pctSign, num, fmtSector, fmtTurn, realizedMonth,
} from '@/lib/portfolio';
import { FrontierChart, CumulativeChart, MultiLineChart, ScatterChart } from '@/components/portfolio/charts';
import type { PortfolioBacktest } from '@/types/api';

const TABS = [
  { key: 'sweep', label: 'Sweep Explorer', k: '01' },
  { key: 'browse', label: 'Browse', k: '02' },
  { key: 'compare', label: 'Compare Models', k: '03' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// per-model colours for the compare overlay
const CMP_COLORS = ['#0e7c6f', '#1d4ed8', '#c2410c', '#7c3aed', '#be185d', '#0e7490', '#4d7c0f'];

// L/S rows are shown in the collateral-credited convention (matches the per-backtest report):
// IR on the credited excess over cash, and the credited excess as the "active return". Long-only
// keeps the stored net-vs-index numbers. The API serves the credited fields (single source).
const dispIR = (r: PortfolioBacktest) => r.strategy === 'long_short' ? (r.ir_credited ?? r.ir) : r.ir;
const dispAnn = (r: PortfolioBacktest) => r.strategy === 'long_short' ? (r.ann_credited ?? r.ann_active) : r.ann_active;

// selectable scatter axes (model metrics at the standard config)
const SCATTER_AXES = {
  ann_active:   { label: 'Active return (ann.)', get: (r: PortfolioBacktest) => dispAnn(r),      fmt: (v: number) => pctSign(v, 1) },
  ir:           { label: 'Information ratio',    get: (r: PortfolioBacktest) => dispIR(r),       fmt: (v: number) => num(v) },
  sharpe_net:   { label: 'Sharpe (net)',         get: (r: PortfolioBacktest) => r.sharpe_net,    fmt: (v: number) => num(v) },
  realized_te:  { label: 'Tracking error',       get: (r: PortfolioBacktest) => r.realized_te,   fmt: (v: number) => pct(v, 1) },
  max_drawdown: { label: 'Max drawdown',         get: (r: PortfolioBacktest) => r.max_drawdown,  fmt: (v: number) => pct(v, 0) },
  avg_turnover: { label: 'Turnover @ cap',       get: (r: PortfolioBacktest) => r.avg_turnover,  fmt: (v: number) => pct(v, 0) },
  nat_turnover: { label: 'Turnover (uncapped)',  get: (r: PortfolioBacktest) => (r as { nat_turnover?: number | null }).nat_turnover ?? null, fmt: (v: number) => pct(v, 0) },
  hit_rate:     { label: 'Hit rate',             get: (r: PortfolioBacktest) => r.hit_rate,      fmt: (v: number) => pct(v, 0) },
} as const;
type AxisKey = keyof typeof SCATTER_AXES;

function shortDesc(r: PortfolioBacktest): string {
  const parts = [r.experiment, r.te_target != null ? `te${(r.te_target * 100).toFixed(0)}` : null,
    r.sector_tol != null ? `sec${fmtSector(r.sector_tol).replace('±', '').replace('%', '')}` : null,
    r.turnover_cap != null ? `to${fmtTurn(r.turnover_cap)}` : null];
  return parts.filter(Boolean).join(' · ');
}

function FilterSelect({ v, set, opts, label }: { v: string; set: (s: string) => void; opts: string[]; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] muted">
      {label}
      <select value={v} onChange={(e) => set(e.target.value)}
        className="mono text-[11px] rounded px-2 py-1" style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', color: 'var(--tx)' }}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function PortfoliosInner() {
  const universe = useSearchParams().get('u') === 'r2500' ? 'r2500' : 'sp500';
  const [tab, setTab] = useState<Tab>('sweep');
  const { data, error, isLoading } = useSWR(['pf', universe],
    () => fetchPortfolioBacktests({ universe }), { revalidateOnFocus: false });

  return (
    <div>
      <div className="mb-3">
        <div className="flex items-baseline gap-2.5 mb-1 flex-wrap">
          <h1 className="text-base font-bold tracking-tight" style={{ color: 'var(--tx)' }}>Layer-2 Portfolios</h1>
          <span className="pill pill-teal">L2 · PORTFOLIOS</span>
          <span className="text-[10px] font-medium uppercase tracking-wider dim">
            {universe === 'sp500' ? 'S&P 500' : 'Russell 2500'} · Optimized backtests · Out-of-sample 2005–2023
          </span>
        </div>
        <p className="text-[11px] muted max-w-3xl leading-relaxed">
          Mean-variance optimized portfolios on the calibrated risk model. Use the <b className="teal">Sweep Explorer</b> to
          see how each optimizer parameter moves the result, <b className="teal">Browse</b> every config, <b className="teal">Compare</b> the
          carried-forward models head-to-head, and drill any backtest → its alpha model (P02) → factors (P01).
        </p>
      </div>

      <div className="flex gap-1 mb-4" style={{ borderBottom: '1px solid var(--border-soft)' }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="px-3.5 py-2 text-[12px] font-bold flex items-center gap-2 transition-colors"
            style={tab === t.key
              ? { color: 'var(--tx)', borderBottom: '2px solid var(--teal)', marginBottom: -1 }
              : { color: 'var(--tx-mut)' }}>
            <span className="text-[9px] font-extrabold px-1.5 rounded" style={{ background: 'rgba(45,212,191,0.14)', color: 'var(--teal)' }}>{t.k}</span>
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="panel p-16 text-center muted text-sm">Loading backtests…</div>}
      {error && <div className="panel p-8 text-center text-sm" style={{ color: 'var(--neg)' }}>Failed to load. Is the API running?</div>}
      {data && tab === 'sweep' && <SweepExplorer rows={data} universe={universe} />}
      {data && tab === 'browse' && <Browse rows={data} />}
      {data && tab === 'compare' && <Compare rows={data} universe={universe} />}
    </div>
  );
}

export default function PortfoliosPage() {
  return (
    <Suspense fallback={<div className="panel p-16 text-center muted text-sm">Loading…</div>}>
      <PortfoliosInner />
    </Suspense>
  );
}

// --------------------------------------------------------------- Sweep Explorer
function SweepExplorer({ rows, universe }: { rows: PortfolioBacktest[]; universe: string }) {
  const sweeps = useMemo(() => buildSweeps(rows, universe), [rows, universe]);
  const ab = useMemo(() => buildABPairs(rows).filter((p) => p.experiment === 'prod' || p.experiment === 'sweep').slice(0, 6), [rows]);
  const prod = rows.find((r) => r.is_production);
  const ls = rows.find((r) => r.experiment === 'ls' && r.variant === 'hard');

  return (
    <div className="space-y-4">
      {prod && (
        <div className="panel p-4 flex items-center gap-6 flex-wrap" style={{ borderColor: 'var(--teal)' }}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider dim">Production pick</div>
            <div className="text-[15px] font-bold" style={{ color: 'var(--tx)' }}>{prod.signal_model_id} · {shortDesc(prod)}</div>
          </div>
          {[['IR', num(dispIR(prod))], ['Realized TE', pct(prod.realized_te)], ['vs target', pct(prod.te_target)],
            ['Sharpe', num(prod.sharpe_net)], ['Max DD', pct(prod.max_drawdown)], ['Optimal', pct(prod.opt_pct, 0)]].map(([l, v]) => (
            <div key={l}><div className="text-[9.5px] uppercase tracking-wider dim font-bold">{l}</div><div className="mono text-[15px]" style={{ color: 'var(--tx)' }}>{v}</div></div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sweeps.map((s) => (
          <div key={s.key} className="panel p-4">
            <div className="panel-head">{s.title}</div>
            <div className="panel-sub mb-1">{s.xTitle}</div>
            <FrontierChart points={s.points.map((p) => ({ xLabel: p.xLabel, y: p.ir, highlight: p.is_production }))} />
            <div className="takeaway" dangerouslySetInnerHTML={{ __html: s.takeaway }} />
          </div>
        ))}

        {/* Hardening A/B */}
        <div className="panel p-4">
          <div className="panel-head">Hardening · base ▷ hard</div>
          <div className="panel-sub mb-2">solver honesty — IR &amp; optimal% before/after</div>
          <table className="dtable">
            <thead><tr><th>Config</th><th>base IR</th><th>hard IR</th><th>opt% b→h</th></tr></thead>
            <tbody>
              {ab.map((p) => (
                <tr key={p.label}><td>{p.model} {p.experiment}</td>
                  <td className="dim">{num(p.base_ir)}</td><td className="teal">{num(p.hard_ir)}</td>
                  <td className="mono">{pct(p.base_opt, 0)}→{pct(p.hard_opt, 0)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="takeaway">Hard is the <b>trustworthy</b> book; the base numbers were partly inflated by low-confidence solves. We decide on hard.</div>
        </div>

        {/* LO vs L/S */}
        {ls && (
          <div className="panel p-4">
            <div className="panel-head">Long-only vs Long-short</div>
            <div className="panel-sub mb-2">market-neutral alternative (R2500)</div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              {[['L/S Sharpe', num(ls.sharpe_net)], ['L/S IR', num(dispIR(ls))], ['L/S vol', pct(ls.realized_te)], ['L/S maxDD', pct(ls.max_drawdown)]].map(([l, v]) => (
                <div key={l}><div className="text-[9.5px] uppercase tracking-wider dim font-bold">{l}</div><div className="mono text-[14px]" style={{ color: 'var(--tx)' }}>{v}</div></div>
              ))}
            </div>
            <div className="takeaway">Market-neutral: shallow drawdown &amp; positive in 2008, but built for R2500 only. See Browse → strategy = long-short.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Browse (sortable, columnar)
type SortState = { col: string; dir: 1 | -1 };

interface BrowseCol {
  key: string; label: string; kind: 'num' | 'str';
  get: (r: PortfolioBacktest) => number | string;
  cell: (r: PortfolioBacktest) => ReactNode;
}

const BROWSE_COLS: BrowseCol[] = [
  { key: 'signal_model_id', label: 'Model', kind: 'str', get: (r) => r.signal_model_id ?? '',
    cell: (r) => <><span className="teal">{r.signal_model_id}</span>{r.is_production && <span className="pill pill-ok" style={{ fontSize: 8, marginLeft: 4 }}>★</span>}</> },
  { key: 'strategy', label: 'Str', kind: 'str', get: (r) => r.strategy ?? '', cell: (r) => <span className="dim">{r.strategy === 'long_short' ? 'L/S' : 'LO'}</span> },
  { key: 'variant', label: 'Var', kind: 'str', get: (r) => r.variant ?? '', cell: (r) => <span className="dim">{r.variant}</span> },
  { key: 'experiment', label: 'Exp', kind: 'str', get: (r) => r.experiment ?? '', cell: (r) => <span className="dim">{r.experiment}</span> },
  { key: 'te_target', label: 'TE', kind: 'num', get: (r) => r.te_target ?? Infinity, cell: (r) => r.te_target != null ? pct(r.te_target, 0) : <span className="dim">off</span> },
  { key: 'sector_tol', label: 'Sec', kind: 'num', get: (r) => r.sector_tol ?? Infinity, cell: (r) => fmtSector(r.sector_tol) },
  { key: 'turnover_cap', label: 'TO', kind: 'num', get: (r) => r.turnover_cap ?? Infinity, cell: (r) => fmtTurn(r.turnover_cap) },
  { key: 'lambda_risk', label: 'λ', kind: 'num', get: (r) => r.lambda_risk ?? -Infinity, cell: (r) => <span className="dim">{r.lambda_risk ?? '—'}</span> },
  { key: 'ir', label: 'IR', kind: 'num', get: (r) => dispIR(r) ?? -Infinity, cell: (r) => <span style={{ color: (dispIR(r) ?? 0) >= 0.5 ? 'var(--pos)' : 'var(--tx)' }}>{num(dispIR(r))}</span> },
  { key: 'sharpe_net', label: 'Sharpe', kind: 'num', get: (r) => r.sharpe_net ?? -Infinity, cell: (r) => num(r.sharpe_net) },
  { key: 'realized_te', label: 'real TE', kind: 'num', get: (r) => r.realized_te ?? Infinity, cell: (r) => pct(r.realized_te) },
  { key: 'max_drawdown', label: 'Max DD', kind: 'num', get: (r) => r.max_drawdown ?? -Infinity, cell: (r) => <span className="neg">{pct(r.max_drawdown, 0)}</span> },
  { key: 'avg_turnover', label: 'Turn', kind: 'num', get: (r) => r.avg_turnover ?? Infinity, cell: (r) => <span className="dim">{pct(r.avg_turnover, 0)}</span> },
  { key: 'avg_holdings', label: 'Hold', kind: 'num', get: (r) => r.avg_holdings ?? Infinity, cell: (r) => <span className="dim">{r.avg_holdings?.toFixed(0) ?? '—'}</span> },
  { key: 'opt_pct', label: 'opt%', kind: 'num', get: (r) => r.opt_pct ?? -Infinity, cell: (r) => <span style={{ color: (r.opt_pct ?? 0) >= 0.98 ? 'var(--pos)' : 'var(--amber)' }}>{pct(r.opt_pct, 0)}</span> },
];

function Browse({ rows }: { rows: PortfolioBacktest[] }) {
  const router = useRouter();
  const [variant, setVariant] = useState('hard');
  const [experiment, setExperiment] = useState('all');
  const models = useMemo(() => Array.from(new Set(rows.map((r) => r.signal_model_id).filter(Boolean))) as string[], [rows]);
  const [model, setModel] = useState('all');
  const [sort, setSort] = useState<SortState>({ col: 'ir', dir: -1 });

  const filtered = useMemo(() => {
    const col = BROWSE_COLS.find((c) => c.key === sort.col) ?? BROWSE_COLS[8];
    return rows
      .filter((r) =>
        (variant === 'all' || r.variant === variant) &&
        (experiment === 'all' || r.experiment === experiment) &&
        (model === 'all' || r.signal_model_id === model))
      .sort((a, b) => {
        const av = col.get(a), bv = col.get(b);
        const cmp = col.kind === 'num' ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
        return cmp * sort.dir;
      });
  }, [rows, variant, experiment, model, sort]);

  const toggleSort = (c: BrowseCol) =>
    setSort((s) => s.col === c.key ? { col: c.key, dir: (s.dir === 1 ? -1 : 1) } : { col: c.key, dir: c.kind === 'num' ? -1 : 1 });

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <FilterSelect label="Variant" v={variant} set={setVariant} opts={['hard', 'base', 'bare', 'all']} />
        <FilterSelect label="Experiment" v={experiment} set={setExperiment} opts={['all', 'prod', 'sweep', 'sector', 'te', 'phase5', 'ls']} />
        <FilterSelect label="Model" v={model} set={setModel} opts={['all', ...models]} />
        <span className="ml-auto text-[11px] dim">{filtered.length} configs · click a header to sort · click a row for the full report</span>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
        <table className="dtable">
          <thead>
            <tr>
              {BROWSE_COLS.map((c) => (
                <th key={c.key} onClick={() => toggleSort(c)}
                  style={{ cursor: 'pointer', userSelect: 'none', color: sort.col === c.key ? 'var(--teal)' : undefined }}>
                  {c.label}{sort.col === c.key ? (sort.dir < 0 ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.model_label} className="clickable" title={r.model_label}
                onClick={() => router.push(`/research/portfolios/${encodeURIComponent(r.model_label)}`)}>
                {BROWSE_COLS.map((c) => <td key={c.key}>{c.cell(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Compare models (one standard config)

function Compare({ rows, universe }: { rows: PortfolioBacktest[]; universe: string }) {
  const router = useRouter();
  const configs = useMemo(() => buildCompareConfigs(rows), [rows]);
  const stdKey = useMemo(() => defaultCompareConfig(configs, universe), [configs, universe]);
  const cfg = configs.find((c) => c.key === stdKey) ?? configs[0];
  const modelRows = cfg?.rows ?? [];
  const labels = modelRows.map((r) => r.model_label);
  const colorOf = (label: string) => CMP_COLORS[Math.max(0, modelRows.findIndex((r) => r.model_label === label)) % CMP_COLORS.length];
  // natural (uncapped) turnover per model = its turnover=none run in the same config family
  const natTurn = (label: string): number | null => {
    const r = modelRows.find((m) => m.model_label === label);
    if (!r) return null;
    const unc = rows.find((x) => x.signal_model_id === r.signal_model_id && x.strategy === r.strategy
      && x.variant === r.variant && x.te_target === r.te_target && x.sector_tol === r.sector_tol
      && x.turnover_cap == null);
    return unc?.avg_turnover ?? null;
  };

  const { data: series, isLoading } = useSWR(
    labels.length ? ['cmp', ...labels] : null,
    () => Promise.all(modelRows.map((r) =>
      fetchPortfolioDetail(r.model_label).then((d) => ({ label: r.model_label, model: r.signal_model_id ?? r.model_label, monthly: d.monthly })))),
    { revalidateOnFocus: false },
  );

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [win, setWin] = useState(12);
  const [metric, setMetric] = useState<'excess' | 'ir' | 'batting'>('ir');
  const [yAxis, setYAxis] = useState<AxisKey>('ann_active');
  const [xAxis, setXAxis] = useState<AxisKey>('realized_te');
  const uniParam = universe === 'r2500' ? 'russell2500' : 'sp500';
  const { data: scorecard } = useSWR(['cmp-scorecard', uniParam], () => fetchModelScorecard(uniParam), { revalidateOnFocus: false });
  const descMap = new Map((scorecard ?? []).map((r) => [r.model_id, r.description]));
  const isVis = (label: string) => !hidden.has(label);
  const toggle = (label: string) => setHidden((h) => { const n = new Set(h); if (n.has(label)) n.delete(label); else n.add(label); return n; });

  if (!configs.length) {
    return <div className="panel p-10 text-center muted text-sm">No shared configs available to compare models on this universe.</div>;
  }

  const bestIR = Math.max(...modelRows.map((r) => dispIR(r) ?? -9));
  const bestSharpe = Math.max(...modelRows.map((r) => r.sharpe_net ?? -9));
  const bestAnn = Math.max(...modelRows.map((r) => dispAnn(r) ?? -9));

  const dates = series?.[0]?.monthly.map((p) => realizedMonth(p.date)) ?? [];
  const visSeries = (series ?? []).filter((s) => isVis(s.label));
  const cumSeries = [
    ...visSeries.map((s) => ({ label: s.model, color: colorOf(s.label), values: s.monthly.map((p) => p.cum_portfolio) })),
    { label: 'Benchmark', color: 'var(--bench)', values: series?.[0]?.monthly.map((p) => p.cum_benchmark) ?? [], dash: true },
  ];
  const rollFn = metric === 'ir' ? rollingIR : metric === 'batting' ? rollingBatting : rollingExcess;
  const rollSeries = visSeries.map((s) => ({ label: s.model, color: colorOf(s.label), values: rollFn(s.monthly.map((p) => p.active_return), win) }));
  const rollMeta = metric === 'ir'
    ? { title: `Rolling ${win}-month information ratio`, sub: 'annualized active return ÷ tracking error over the trailing window · above 0 beats the benchmark', refY: 0, refLabel: '0', yFmt: (v: number) => v.toFixed(1), yDomain: undefined as [number, number] | undefined }
    : metric === 'batting'
      ? { title: `Rolling ${win}-month batting average`, sub: 'share of the trailing months that beat the benchmark · above 50% = more hits than misses', refY: 0.5, refLabel: '50%', yFmt: (v: number) => `${(v * 100).toFixed(0)}%`, yDomain: [0, 1] as [number, number] | undefined }
      : { title: `Rolling ${win}-month excess return (annualized)`, sub: 'compounded active return over the trailing window, annualized · above 0 beats the benchmark', refY: 0, refLabel: '0%', yFmt: (v: number) => `${(v * 100).toFixed(0)}%`, yDomain: undefined as [number, number] | undefined };

  const augRows = modelRows.map((r) => ({ ...r, nat_turnover: natTurn(r.model_label) }));
  const scatterPts = augRows
    .filter((r) => isVis(r.model_label) && SCATTER_AXES[xAxis].get(r) != null && SCATTER_AXES[yAxis].get(r) != null)
    .map((r) => ({ label: r.signal_model_id ?? '', color: colorOf(r.model_label), x: SCATTER_AXES[xAxis].get(r) as number, y: SCATTER_AXES[yAxis].get(r) as number, highlight: !!r.is_production }));

  const segStyle = (on: boolean) => on
    ? { background: 'var(--panel)', color: 'var(--teal)', border: '1px solid var(--border-soft)' }
    : { color: 'var(--tx-mut)', border: '1px solid transparent' };

  return (
    <div className="space-y-4">
      {/* standard-config banner */}
      <div className="panel p-4 flex items-center gap-3 flex-wrap" style={{ borderColor: 'var(--teal)' }}>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider dim">Compared at standard config</div>
          <div className="text-[13px] font-bold" style={{ color: 'var(--tx)' }}>{cfg?.label}</div>
        </div>
        <span className="ml-auto text-[11px] dim">{modelRows.length} models · {universe === 'sp500' ? 'S&P 500' : 'Russell 2500'} · same settings across all → the spread is pure model alpha</span>
      </div>

      {/* models key — what each model actually is (no need to hop to the Alpha Models page) */}
      <div className="panel p-4">
        <div className="panel-head mb-2">Models compared</div>
        <div className="space-y-1.5">
          {modelRows.map((r) => (
            <div key={r.model_label} className="flex items-start gap-2 text-[11.5px] leading-snug">
              <span style={{ width: 9, height: 9, borderRadius: 2, background: colorOf(r.model_label), marginTop: 3, flex: 'none' }} />
              <span className="mono font-bold" style={{ color: 'var(--tx)', width: 44, flex: 'none' }}>{r.signal_model_id}</span>
              <span className="muted">
                {descMap.get(r.signal_model_id ?? '') ?? '—'}
                {r.is_production && <span className="pill pill-ok" style={{ fontSize: 8, marginLeft: 6 }}>production pick</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* metrics table */}
      <div className="panel p-4">
        <div className="panel-head mb-2">Model metrics</div>
        <div className="overflow-x-auto">
          <table className="dtable">
            <thead><tr>
              <th>Model</th><th>IR</th><th>Sharpe</th><th>Ann Active</th><th>Real TE</th><th>Max DD</th><th>Turn</th><th>Nat. turn</th><th>Hold</th><th>opt%</th>
            </tr></thead>
            <tbody>
              {modelRows.map((r) => (
                <tr key={r.model_label} className="clickable" title={r.model_label}
                  onClick={() => router.push(`/research/portfolios/${encodeURIComponent(r.model_label)}`)}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: colorOf(r.model_label) }} />
                      <span className="teal">{r.signal_model_id}</span>
                      {r.is_production && <span className="pill pill-ok" style={{ fontSize: 8 }}>★</span>}
                    </span>
                  </td>
                  <td style={{ color: (dispIR(r) ?? -9) === bestIR ? 'var(--pos)' : 'var(--tx)', fontWeight: (dispIR(r) ?? -9) === bestIR ? 700 : 400 }}>{num(dispIR(r))}</td>
                  <td style={{ fontWeight: (r.sharpe_net ?? -9) === bestSharpe ? 700 : 400 }}>{num(r.sharpe_net)}</td>
                  <td style={{ color: (dispAnn(r) ?? -9) === bestAnn ? 'var(--pos)' : 'var(--tx)' }}>{pctSign(dispAnn(r))}</td>
                  <td>{pct(r.realized_te)}</td>
                  <td className="neg">{pct(r.max_drawdown, 0)}</td>
                  <td className="dim">{pct(r.avg_turnover, 0)}</td>
                  <td>{natTurn(r.model_label) != null ? pct(natTurn(r.model_label), 0) : <span className="dim">—</span>}</td>
                  <td className="dim">{r.avg_holdings?.toFixed(0) ?? '—'}</td>
                  <td style={{ color: (r.opt_pct ?? 0) >= 0.98 ? 'var(--pos)' : 'var(--amber)' }}>{pct(r.opt_pct, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel-sub mt-2">Best per metric in <span className="pos">green</span> · click a row for its full report. <b>Turn</b> = realized at the config&apos;s cap (binds for every model here, so it&apos;s not a differentiator); <b>Nat. turn</b> = uncapped natural rate — 3-month-blended models trade less.</div>
      </div>

      {/* interactive charts (shared model selector drives all three) */}
      <div className="panel p-4">
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[10px] font-bold uppercase tracking-wider dim mr-0.5">Show</span>
          {modelRows.map((r) => {
            const on = isVis(r.model_label);
            return (
              <button key={r.model_label} onClick={() => toggle(r.model_label)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold transition-all"
                style={{ border: `1px solid ${on ? colorOf(r.model_label) : 'var(--border-soft)'}`, background: on ? 'var(--panel2)' : 'transparent', color: on ? 'var(--tx)' : 'var(--tx-dim)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? colorOf(r.model_label) : 'var(--tx-dim)' }} />
                {r.signal_model_id}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {/* scatter — model positioning (from backtest metrics, so it renders without the series) */}
          <div>
            <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
              <div>
                <div className="panel-head">Risk / return scatter</div>
                <div className="panel-sub">each model at the standard config · pick either axis</div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] muted">Y
                  <select value={yAxis} onChange={(e) => setYAxis(e.target.value as AxisKey)} className="mono text-[11px] rounded px-1.5 py-1" style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)', color: 'var(--tx)' }}>
                    {Object.entries(SCATTER_AXES).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-[11px] muted">X
                  <select value={xAxis} onChange={(e) => setXAxis(e.target.value as AxisKey)} className="mono text-[11px] rounded px-1.5 py-1" style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)', color: 'var(--tx)' }}>
                    {Object.entries(SCATTER_AXES).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <ScatterChart points={scatterPts} xLabel={SCATTER_AXES[xAxis].label} yLabel={SCATTER_AXES[yAxis].label} xFmt={SCATTER_AXES[xAxis].fmt} yFmt={SCATTER_AXES[yAxis].fmt} />
          </div>

          {/* rolling metric — the decision-useful time view */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
              <div>
                <div className="panel-head">{rollMeta.title}</div>
                <div className="panel-sub">{rollMeta.sub}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-md p-0.5" style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)' }}>
                  {([['excess', 'Excess'], ['ir', 'Info ratio'], ['batting', 'Batting']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setMetric(v)} className="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors" style={segStyle(metric === v)}>{l}</button>
                  ))}
                </div>
                <div className="flex rounded-md p-0.5" style={{ background: 'var(--panel2)', border: '1px solid var(--border-soft)' }}>
                  {[12, 24, 36].map((w) => (
                    <button key={w} onClick={() => setWin(w)} className="px-2.5 py-1 rounded text-[11px] font-semibold transition-colors" style={segStyle(win === w)}>{w}M</button>
                  ))}
                </div>
              </div>
            </div>
            {isLoading && <div className="p-8 text-center muted text-sm">Loading return series…</div>}
            {!isLoading && (visSeries.length === 0 || dates.length <= 1)
              ? (!isLoading && <div className="p-6 text-center dim text-[11px]">Select at least one model.</div>)
              : !isLoading && <MultiLineChart dates={dates} series={rollSeries} refY={rollMeta.refY} refLabel={rollMeta.refLabel} yFmt={rollMeta.yFmt} yDomain={rollMeta.yDomain} height={210} />}
          </div>

          {/* cumulative reference */}
          <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <div className="panel-head">Cumulative net return</div>
            <div className="panel-sub mb-1">growth of 100, net of cost · full-history reference — mostly market beta, so the rolling views above separate the models better</div>
            {!isLoading && visSeries.length > 0 && dates.length > 1
              ? <CumulativeChart dates={dates} series={cumSeries} height={200} />
              : <div className="p-6 text-center dim text-[11px]">{isLoading ? 'Loading…' : 'Select at least one model.'}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
