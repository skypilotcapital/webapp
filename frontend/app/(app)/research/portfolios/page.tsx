'use client';

import { useState, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fetchPortfolioBacktests } from '@/lib/api';
import { buildSweeps, buildABPairs, pct, pctSign, num, fmtSector, fmtTurn, PRIMARY_MODEL } from '@/lib/portfolio';
import { FrontierChart } from '@/components/portfolio/charts';
import type { PortfolioBacktest } from '@/types/api';

const TABS = [
  { key: 'sweep', label: 'Sweep Explorer', k: '01' },
  { key: 'browse', label: 'Browse', k: '02' },
  { key: 'decision', label: 'Decision', k: '03' },
] as const;
type Tab = (typeof TABS)[number]['key'];

function shortDesc(r: PortfolioBacktest): string {
  const parts = [r.experiment, r.te_target != null ? `te${(r.te_target * 100).toFixed(0)}` : null,
    r.sector_tol !== undefined ? `sec${fmtSector(r.sector_tol).replace('±', '').replace('%', '')}` : null,
    r.turnover_cap !== undefined ? `to${fmtTurn(r.turnover_cap)}` : null];
  return parts.filter(Boolean).join(' · ');
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
            {universe === 'sp500' ? 'S&P 500' : 'Russell 2500'} · Optimized backtests · In-sample 2005–2023
          </span>
        </div>
        <p className="text-[11px] muted max-w-3xl leading-relaxed">
          Mean-variance optimized portfolios on the calibrated risk model. Use the <b className="teal">Sweep Explorer</b> to
          see how each optimizer parameter moves the result, <b className="teal">Browse</b> every config, and
          drill any backtest → its alpha model (P02) → factors (P01).
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
      {data && tab === 'decision' && <Decision rows={data} universe={universe} />}
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
          {[['IR', num(prod.ir)], ['Realized TE', pct(prod.realized_te)], ['vs target', pct(prod.te_target)],
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
              {[['L/S Sharpe', num(ls.sharpe_net)], ['L/S IR', num(ls.ir)], ['L/S vol', pct(ls.realized_te)], ['L/S maxDD', pct(ls.max_drawdown)]].map(([l, v]) => (
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

// --------------------------------------------------------------- Browse
function Browse({ rows }: { rows: PortfolioBacktest[] }) {
  const router = useRouter();
  const [variant, setVariant] = useState('hard');
  const [experiment, setExperiment] = useState('all');
  const models = useMemo(() => Array.from(new Set(rows.map((r) => r.signal_model_id).filter(Boolean))) as string[], [rows]);
  const [model, setModel] = useState('all');

  const filtered = rows.filter((r) =>
    (variant === 'all' || r.variant === variant) &&
    (experiment === 'all' || r.experiment === experiment) &&
    (model === 'all' || r.signal_model_id === model)
  ).sort((a, b) => (b.ir ?? -9) - (a.ir ?? -9));

  const Sel = ({ v, set, opts, label }: { v: string; set: (s: string) => void; opts: string[]; label: string }) => (
    <label className="flex items-center gap-1.5 text-[11px] muted">
      {label}
      <select value={v} onChange={(e) => set(e.target.value)}
        className="mono text-[11px] rounded px-2 py-1" style={{ background: 'var(--panel)', border: '1px solid var(--border-soft)', color: 'var(--tx)' }}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <Sel label="Variant" v={variant} set={setVariant} opts={['hard', 'base', 'bare', 'all']} />
        <Sel label="Experiment" v={experiment} set={setExperiment} opts={['all', 'prod', 'sweep', 'sector', 'te', 'phase5', 'ls']} />
        <Sel label="Model" v={model} set={setModel} opts={['all', ...models]} />
        <span className="ml-auto text-[11px] dim">{filtered.length} configs · click a row for the full report</span>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: '65vh' }}>
        <table className="dtable">
          <thead>
            <tr><th>Config</th><th>Model</th><th>Str</th><th>IR</th><th>Sharpe</th><th>real TE</th><th>tgt</th><th>Max DD</th><th>Turn</th><th>Hold</th><th>opt%</th></tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.model_label} className="clickable"
                onClick={() => router.push(`/research/portfolios/${encodeURIComponent(r.model_label)}`)}>
                <td>{shortDesc(r)} {r.is_production && <span className="pill pill-ok" style={{ fontSize: 8 }}>★</span>}</td>
                <td className="teal">{r.signal_model_id}</td>
                <td className="dim">{r.strategy === 'long_short' ? 'L/S' : 'LO'}</td>
                <td style={{ color: (r.ir ?? 0) >= 0.5 ? 'var(--pos)' : 'var(--tx)' }}>{num(r.ir)}</td>
                <td>{num(r.sharpe_net)}</td>
                <td>{pct(r.realized_te)}</td>
                <td className="dim">{pct(r.te_target, 0)}</td>
                <td className="neg">{pct(r.max_drawdown, 0)}</td>
                <td className="dim">{pct(r.avg_turnover, 0)}</td>
                <td className="dim">{r.avg_holdings?.toFixed(0)}</td>
                <td style={{ color: (r.opt_pct ?? 0) >= 0.98 ? 'var(--pos)' : 'var(--amber)' }}>{pct(r.opt_pct, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- Decision (stub — Phase 5)
function Decision({ rows, universe }: { rows: PortfolioBacktest[]; universe: string }) {
  const finalists = rows.filter((r) => r.is_production || (r.experiment === 'ls' && r.variant === 'hard'));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {finalists.map((f) => (
          <div key={f.model_label} className="panel p-4" style={f.is_production ? { borderColor: 'var(--teal)' } : {}}>
            <div className="text-[14px] font-bold" style={{ color: 'var(--tx)' }}>{f.signal_model_id} · {f.strategy === 'long_short' ? 'L/S' : 'Long-only'}</div>
            <div className="panel-sub mb-3">{shortDesc(f)}</div>
            <div className="grid grid-cols-2 gap-2">
              {[['IR', num(f.ir)], ['Sharpe', num(f.sharpe_net)], ['Max DD', pct(f.max_drawdown, 0)], ['Turn', pct(f.avg_turnover, 0)]].map(([l, v]) => (
                <div key={l} className="flex justify-between"><span className="text-[10px] muted">{l}</span><span className="mono text-[12px]" style={{ color: 'var(--tx)' }}>{v}</span></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="panel p-4" style={{ border: '1px dashed rgba(251,191,36,0.4)' }}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔒</span>
          <div>
            <div className="font-bold" style={{ color: 'var(--amber)' }}>Out-of-Sample Verdict — 2024+ holdout (sealed)</div>
            <div className="text-[11px] dim mt-1 italic">Locked until ≤2 finalists are committed. One-shot reveal for the committed shortlist only — never a sweep. (Full Decision view + gated holdout arrive in Phase 5.)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
