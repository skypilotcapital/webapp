'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchMacroBetaDialSim } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { Universe } from '@/types/macroBeta';

export function DialSimulator({ universe }: { universe: Universe }) {
  const { data, error, isLoading } = useSWR(['macro-beta-dial-sim', universe], () =>
    fetchMacroBetaDialSim(universe)
  );
  const [dial, setDial] = useState(0.5);

  const sim = useMemo(
    () => (data ?? []).find((d) => Math.abs(d.dial - dial) < 1e-9) ?? (data ?? [])[0],
    [data, dial]
  );

  const width = 920;
  const height = 320;
  const padding = { top: 16, right: 16, bottom: 36, left: 64 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const chart = useMemo(() => {
    if (!sim || sim.series.length < 2) return null;
    const logs = sim.series.flatMap((p) => [Math.log(p.port_level), Math.log(p.bench_level)]);
    const minL = Math.min(...logs);
    const maxL = Math.max(...logs);
    const span = maxL - minL || 1;
    const toPath = (sel: (p: (typeof sim.series)[number]) => number) =>
      sim.series
        .map((p, i) => {
          const x = padding.left + (i / (sim.series.length - 1)) * innerW;
          const y = padding.top + innerH - ((Math.log(sel(p)) - minL) / span) * innerH;
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');
    const firstYear = new Date(sim.series[0].date).getFullYear();
    const lastYear = new Date(sim.series[sim.series.length - 1].date).getFullYear();
    const step = Math.max(1, Math.ceil((lastYear - firstYear) / 8));
    const ticks: Array<{ x: number; label: string }> = [];
    for (let y = firstYear + step; y <= lastYear; y += step) {
      const idx = sim.series.findIndex((p) => new Date(p.date).getFullYear() >= y);
      if (idx >= 0)
        ticks.push({
          x: padding.left + (idx / (sim.series.length - 1)) * innerW,
          label: String(y),
        });
    }
    return { port: toPath((p) => p.port_level), bench: toPath((p) => p.bench_level), ticks };
  }, [sim, innerH, innerW, padding.left, padding.top]);

  const fmtPct = (v: number | null | undefined, dp = 1) =>
    v == null ? '—' : `${(v * 100).toFixed(dp)}%`;
  const fmtNum = (v: number | null | undefined, dp = 2) => (v == null ? '—' : v.toFixed(dp));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
              Dial Simulator <span className="text-sm font-bold text-amber-500 align-middle ml-2">HYPOTHETICAL</span>
            </h2>
            <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
              What a simple beta dial would have done since 1990: beta = 1.0 in normal,
              reduced to the selected dial during defense, with a one-day implementation lag
              and futures-overlay costs. Not a track record.
            </p>
          </div>
          <div className="flex gap-1">
            {(data ?? []).map((d) => (
              <button
                key={d.dial}
                onClick={() => setDial(d.dial)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  sim && d.dial === sim.dial
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-[var(--tx-mut,#64748b)] border-[var(--border-soft,#e2e8f0)] hover:border-[var(--tx-dim,#94a3b8)]'
                }`}
              >
                β {d.dial.toFixed(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading simulation…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load simulation.</p>}
        {sim && chart && (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
              {chart.ticks.map((t) => (
                <text key={t.label} x={t.x} y={height - 10} textAnchor="middle"
                      className="fill-slate-400 text-[11px]">
                  {t.label}
                </text>
              ))}
              <path d={chart.bench} fill="none" stroke="#94a3b8" strokeWidth={1.4} />
              <path d={chart.port} fill="none" stroke="#6366f1" strokeWidth={1.8} />
            </svg>
            <div className="flex gap-6 text-xs font-bold mt-1 mb-4">
              <span className="text-indigo-400">— Dialed portfolio</span>
              <span className="text-[var(--tx-dim,#94a3b8)]">— Buy &amp; hold</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-slate-400/10 border border-[var(--border-soft,#f1f5f9)] p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">CAGR</p>
                <p className="text-lg font-bold text-[var(--tx,#1e293b)]">
                  {fmtPct(sim.stats.cagr)}{' '}
                  <span className="text-xs text-[var(--tx-dim,#94a3b8)] font-semibold">
                    vs {fmtPct(sim.stats.bench_cagr)}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-slate-400/10 border border-[var(--border-soft,#f1f5f9)] p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">Sharpe</p>
                <p className="text-lg font-bold text-[var(--tx,#1e293b)]">
                  {fmtNum(sim.stats.sharpe)}{' '}
                  <span className="text-xs text-[var(--tx-dim,#94a3b8)] font-semibold">
                    vs {fmtNum(sim.stats.bench_sharpe)}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-slate-400/10 border border-[var(--border-soft,#f1f5f9)] p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">Max drawdown</p>
                <p className="text-lg font-bold text-[var(--tx,#1e293b)]">
                  {fmtPct(sim.stats.maxdd)}{' '}
                  <span className="text-xs text-[var(--tx-dim,#94a3b8)] font-semibold">
                    vs {fmtPct(sim.stats.bench_maxdd)}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-slate-400/10 border border-[var(--border-soft,#f1f5f9)] p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--tx-dim,#94a3b8)] font-bold">Active return (ann)</p>
                <p className="text-lg font-bold text-[var(--tx,#1e293b)]">{fmtPct(sim.stats.active_ann)}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
