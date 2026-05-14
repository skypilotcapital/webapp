'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchBacktestSummaries, fetchBacktestReturns } from '@/lib/api';
import type { BacktestSummary, BacktestMonthlyReturn } from '@/types/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(v: number | null, decimals = 1): string {
  if (v == null || isNaN(v)) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}
function pctSign(v: number | null, decimals = 1): string {
  if (v == null || isNaN(v)) return '—';
  const s = (v * 100).toFixed(decimals);
  return v >= 0 ? `+${s}%` : `${s}%`;
}
function num(v: number | null, decimals = 2): string {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(decimals);
}
function bps(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(1)} bps`;
}

const MODEL_LABELS: Record<string, string> = {
  'm001_te5': 'M001 · RF Baseline',
  'm009_te5': 'M009 · 1M+3M Ensemble',
  'm013_te5': 'M013 · Vol-Adj 1M',
  'm019_te5': 'M019 · Vol-Adj 1M+3M',
};

const MODEL_COLORS: Record<string, string> = {
  'm001_te5': '#6366f1',
  'm009_te5': '#f59e0b',
  'm013_te5': '#10b981',
  'm019_te5': '#3b82f6',
};

const BENCHMARK_COLOR = '#94a3b8';

// ---------------------------------------------------------------------------
// Summary comparison table
// ---------------------------------------------------------------------------

function SummaryTable({ rows, selected, onSelect }: {
  rows: BacktestSummary[];
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  const cols = [
    { key: 'label',               label: 'Config',               fmt: (r: BacktestSummary) => MODEL_LABELS[r.label] ?? r.label },
    { key: 'ann_return_net',      label: 'Ann Return (Net)',      fmt: (r: BacktestSummary) => pctSign(r.ann_return_net) },
    { key: 'ann_return_benchmark',label: 'Benchmark',             fmt: (r: BacktestSummary) => pctSign(r.ann_return_benchmark) },
    { key: 'ann_excess_return',   label: 'Excess (Net)',          fmt: (r: BacktestSummary) => pctSign(r.ann_excess_return) },
    { key: 'sharpe_net',          label: 'Sharpe',                fmt: (r: BacktestSummary) => num(r.sharpe_net, 3) },
    { key: 'information_ratio',   label: 'IR',                    fmt: (r: BacktestSummary) => num(r.information_ratio, 3) },
    { key: 'tracking_error',      label: 'Track. Error',          fmt: (r: BacktestSummary) => pct(r.tracking_error) },
    { key: 'max_drawdown',        label: 'Max Drawdown',          fmt: (r: BacktestSummary) => pct(r.max_drawdown) },
    { key: 'hit_rate',            label: 'Hit Rate',              fmt: (r: BacktestSummary) => pct(r.hit_rate) },
    { key: 'avg_monthly_turnover',label: 'Avg Turnover/Mo',       fmt: (r: BacktestSummary) => pct(r.avg_monthly_turnover) },
    { key: 'avg_tc_drag_bps',     label: 'TC Drag',               fmt: (r: BacktestSummary) => bps(r.avg_tc_drag_bps) },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {cols.map(c => (
              <th key={c.key} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const color = MODEL_COLORS[r.label] ?? '#64748b';
            const isSelected = r.label === selected;
            return (
              <tr
                key={r.label}
                onClick={() => onSelect(r.label)}
                className={`border-b border-slate-100 cursor-pointer transition-colors ${
                  isSelected ? 'bg-indigo-50/60' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100/60'
                }`}
              >
                {cols.map((c, ci) => (
                  <td key={c.key} className={`px-3 py-2.5 font-mono whitespace-nowrap ${ci === 0 ? 'font-semibold' : ''}`}>
                    {ci === 0 ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: color }} />
                        {c.fmt(r)}
                      </span>
                    ) : (
                      <span className={
                        c.key === 'ann_excess_return' || c.key === 'information_ratio'
                          ? (parseFloat(c.fmt(r)) >= 0 ? 'text-emerald-600' : 'text-red-500')
                          : c.key === 'max_drawdown'
                          ? 'text-red-500'
                          : 'text-slate-700'
                      }>
                        {c.fmt(r)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-period breakdown
// ---------------------------------------------------------------------------

const SUBPERIODS = [
  { label: '2010–2014',         start: '2010-01-01', end: '2014-12-31' },
  { label: '2015–2019',         start: '2015-01-01', end: '2019-12-31' },
  { label: '2020–2021 (COVID)', start: '2020-01-01', end: '2021-12-31' },
  { label: '2022–2023 (rates)', start: '2022-01-01', end: '2023-12-31' },
];

function annualise(monthly: BacktestMonthlyReturn[], key: 'portfolio_net' | 'benchmark'): number | null {
  const vals = monthly.map(m => m[key]).filter((v): v is number => v != null);
  if (vals.length < 3) return null;
  const cum = vals.reduce((acc, v) => acc * (1 + v), 1);
  return cum ** (12 / vals.length) - 1;
}

function computeIR(monthly: BacktestMonthlyReturn[]): number | null {
  const excess = monthly
    .filter(m => m.portfolio_net != null && m.benchmark != null)
    .map(m => m.portfolio_net! - m.benchmark!);
  if (excess.length < 3) return null;
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const std = Math.sqrt(excess.reduce((a, b) => a + (b - mean) ** 2, 0) / (excess.length - 1));
  if (std === 0) return null;
  const annExcess = mean * 12 - ((annualise(monthly, 'benchmark') ?? 0));
  return (annualise(monthly, 'portfolio_net')! - (annualise(monthly, 'benchmark') ?? 0)) / (std * Math.sqrt(12));
}

function SubperiodTable({ monthly }: { monthly: BacktestMonthlyReturn[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80">
            {['Period', 'Months', 'Portfolio (net)', 'Benchmark', 'Excess', 'IR'].map(h => (
              <th key={h} className="px-3 py-2.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SUBPERIODS.map((p, i) => {
            const sub = monthly.filter(m => m.date >= p.start && m.date <= p.end);
            if (sub.length < 3) return null;
            const ap = annualise(sub, 'portfolio_net');
            const ab = annualise(sub, 'benchmark');
            const exc = ap != null && ab != null ? ap - ab : null;
            const ir = computeIR(sub);
            return (
              <tr key={p.label} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{p.label}</td>
                <td className="px-3 py-2 font-mono text-slate-500">{sub.length}</td>
                <td className="px-3 py-2 font-mono text-slate-700">{pctSign(ap)}</td>
                <td className="px-3 py-2 font-mono text-slate-500">{pctSign(ab)}</td>
                <td className={`px-3 py-2 font-mono ${exc != null && exc >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pctSign(exc)}</td>
                <td className={`px-3 py-2 font-mono ${ir != null && ir >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(ir, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cumulative return chart — pure SVG
// ---------------------------------------------------------------------------

function CumReturnChart({ allReturns }: { allReturns: Map<string, BacktestMonthlyReturn[]> }) {
  const W = 900, H = 320, PL = 52, PR = 16, PT = 16, PB = 36;
  const cw = W - PL - PR, ch = H - PT - PB;

  if (allReturns.size === 0) return null;

  // Collect all date strings
  const allDates = Array.from(
    new Set(Array.from(allReturns.values()).flatMap(arr => arr.map(m => m.date)))
  ).sort();
  if (allDates.length === 0) return null;

  const xScale = (i: number) => PL + (i / (allDates.length - 1)) * cw;

  // Build series: portfolio lines per label + one benchmark line
  type Series = { label: string; color: string; points: (number | null)[] };
  const series: Series[] = [];

  let benchPoints: (number | null)[] | null = null;
  const dateIndex = new Map(allDates.map((d, i) => [d, i]));

  for (const [label, monthly] of allReturns.entries()) {
    const pts: (number | null)[] = new Array(allDates.length).fill(null);
    for (const m of monthly) {
      const i = dateIndex.get(m.date);
      if (i != null) pts[i] = m.cum_portfolio;
    }
    series.push({ label, color: MODEL_COLORS[label] ?? '#64748b', points: pts });

    if (!benchPoints) {
      benchPoints = new Array(allDates.length).fill(null);
      for (const m of monthly) {
        const i = dateIndex.get(m.date);
        if (i != null) benchPoints[i] = m.cum_benchmark;
      }
    }
  }

  if (benchPoints) {
    series.push({ label: '__bench__', color: BENCHMARK_COLOR, points: benchPoints });
  }

  const allVals = series.flatMap(s => s.points).filter((v): v is number => v != null);
  const minV = Math.min(...allVals) * 0.97;
  const maxV = Math.max(...allVals) * 1.03;

  const yScale = (v: number) => PT + ch - ((v - minV) / (maxV - minV)) * ch;

  function buildPath(pts: (number | null)[]): string {
    const parts: string[] = [];
    let penUp = true;
    pts.forEach((v, i) => {
      if (v == null) { penUp = true; return; }
      const x = xScale(i).toFixed(1);
      const y = yScale(v).toFixed(1);
      parts.push(`${penUp ? 'M' : 'L'}${x} ${y}`);
      penUp = false;
    });
    return parts.join(' ');
  }

  // Y-axis ticks
  const yTicks = Array.from({ length: 6 }, (_, i) => minV + (i / 5) * (maxV - minV));

  // X-axis year labels
  const yearLabels: { i: number; year: string }[] = [];
  let lastYear = '';
  allDates.forEach((d, i) => {
    const y = d.slice(0, 4);
    if (y !== lastYear) { yearLabels.push({ i, year: y }); lastYear = y; }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PL} y1={yScale(v).toFixed(1)} x2={W - PR} y2={yScale(v).toFixed(1)}
                stroke="#e2e8f0" strokeWidth="1" />
          <text x={PL - 4} y={yScale(v)} textAnchor="end" dominantBaseline="middle"
                fontSize="9" fill="#94a3b8">{v.toFixed(0)}</text>
        </g>
      ))}
      {/* Base 100 line */}
      <line x1={PL} y1={yScale(100).toFixed(1)} x2={W - PR} y2={yScale(100).toFixed(1)}
            stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 2" />
      {/* Series */}
      {series.map(s => (
        <path key={s.label} d={buildPath(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.label === '__bench__' ? 1.5 : 2}
              strokeDasharray={s.label === '__bench__' ? '5 3' : undefined}
              opacity={s.label === '__bench__' ? 0.7 : 1} />
      ))}
      {/* X axis labels */}
      {yearLabels.map(({ i, year }) => (
        <text key={year} x={xScale(i).toFixed(1)} y={H - 6}
              textAnchor="middle" fontSize="9" fill="#94a3b8">{year}</text>
      ))}
      {/* Legend */}
      {series.map((s, idx) => (
        <g key={s.label} transform={`translate(${PL + idx * 130}, ${H - PB + 18})`}>
          <line x1="0" y1="5" x2="16" y2="5" stroke={s.color} strokeWidth="2"
                strokeDasharray={s.label === '__bench__' ? '5 3' : undefined} />
          <text x="20" y="9" fontSize="9" fill="#64748b">
            {s.label === '__bench__' ? 'S&P 500' : (MODEL_LABELS[s.label] ?? s.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Turnover / active return monthly bar chart
// ---------------------------------------------------------------------------

function TurnoverChart({ monthly }: { monthly: BacktestMonthlyReturn[] }) {
  const W = 900, H = 160, PL = 44, PR = 16, PT = 12, PB = 28;
  const cw = W - PL - PR, ch = H - PT - PB;
  const n = monthly.length;
  if (n === 0) return null;
  const maxTo = Math.max(...monthly.map(m => m.turnover ?? 0));
  const barW = Math.max(1, (cw / n) - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0.25, 0.5, 0.75, 1.0].map(v => {
        const y = PT + ch - (v / (maxTo || 1)) * ch;
        return (
          <g key={v}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={PL - 4} y={y} textAnchor="end" dominantBaseline="middle"
                  fontSize="8" fill="#94a3b8">{(v * 100).toFixed(0)}%</text>
          </g>
        );
      })}
      {monthly.map((m, i) => {
        const to = m.turnover ?? 0;
        const h = (to / (maxTo || 1)) * ch;
        const x = PL + (i / n) * cw;
        return (
          <rect key={i} x={x} y={PT + ch - h} width={barW} height={h}
                fill="#6366f1" opacity="0.5" />
        );
      })}
      {(() => {
        const yearLabels: { x: number; year: string }[] = [];
        let last = '';
        monthly.forEach((m, i) => {
          const y = m.date.slice(0, 4);
          if (y !== last) { yearLabels.push({ x: PL + (i / n) * cw, year: y }); last = y; }
        });
        return yearLabels.map(({ x, year }) => (
          <text key={year} x={x} y={H - 6} fontSize="8" fill="#94a3b8">{year}</text>
        ));
      })()}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Detail panel — for a selected backtest
// ---------------------------------------------------------------------------

function BacktestDetail({ label }: { label: string }) {
  const { data: monthly, error } = useSWR(
    label ? ['backtest-returns', label] : null,
    ([, l]) => fetchBacktestReturns(l),
  );

  if (error) return <p className="text-xs text-red-500 px-4">Failed to load returns.</p>;
  if (!monthly) return <p className="text-xs text-slate-400 px-4 py-8 text-center">Loading monthly returns…</p>;

  const displayLabel = MODEL_LABELS[label] ?? label;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          Sub-period Breakdown — {displayLabel}
        </h3>
        <SubperiodTable monthly={monthly} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2">
          Monthly Turnover — {displayLabel}
        </h3>
        <div className="rounded-xl border border-slate-200 p-4 bg-white">
          <TurnoverChart monthly={monthly} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BacktestsPage() {
  const { data: summaries, error } = useSWR('backtest-summaries', fetchBacktestSummaries);
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch all return series for the cumulative chart
  const { data: allMonthly } = useSWR(
    summaries ? 'backtest-all-returns' : null,
    async () => {
      const entries = await Promise.all(
        (summaries ?? []).map(async s => [s.label, await fetchBacktestReturns(s.label)] as const)
      );
      return new Map(entries);
    },
  );

  const handleSelect = (label: string) =>
    setSelected(prev => (prev === label ? null : label));

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Portfolio Backtests</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-2xl">
          Layer 2 mean-variance optimised portfolios. Alpha scores from the selected model are
          converted to long-only S&P 500 weights subject to a 5% tracking error budget,
          3% per-stock cap, and ±5% active sector deviation. TC assumed 7.5bps one-way.
          Period: 2010–2023 (in-sample calibration).
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load backtest results. The backtests may still be running — check back shortly.
        </div>
      )}

      {/* Loading state */}
      {!error && !summaries && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-400">
          Loading backtest results…
        </div>
      )}

      {/* Empty state */}
      {summaries && summaries.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-600">No backtest results yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Run: <code className="bg-slate-100 px-1 rounded">conda run -n skypilot-alpha python -m scripts.run_layer2_backtest --config m019_te5</code>
          </p>
        </div>
      )}

      {/* Summary table */}
      {summaries && summaries.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-800">Performance Summary</h2>
            <span className="text-xs text-slate-400">Click a row for sub-period breakdown</span>
          </div>
          <SummaryTable rows={summaries} selected={selected} onSelect={handleSelect} />
        </div>
      )}

      {/* Cumulative return chart */}
      {allMonthly && allMonthly.size > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-800 mb-3">
            Cumulative Return vs S&P 500 (Net of TC, base 100)
          </h2>
          <div className="rounded-xl border border-slate-200 p-4 bg-white">
            <CumReturnChart allReturns={allMonthly} />
          </div>
        </div>
      )}

      {/* Sub-period detail for selected backtest */}
      {selected && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-5">
          <BacktestDetail label={selected} />
        </div>
      )}
    </div>
  );
}
