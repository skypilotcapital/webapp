'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetchMacroBetaTimeline } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const WINDOWS = [
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
  { label: '20Y', years: 20 },
  { label: 'All', years: 100 },
];

export function RegimeTimeline() {
  const { data, error, isLoading } = useSWR('macro-beta-timeline', fetchMacroBetaTimeline, {
    refreshInterval: 300_000,
  });
  const [years, setYears] = useState(100);

  const points = useMemo(() => {
    const all = (data ?? []).filter((p) => p.tr_level != null);
    if (!all.length) return [];
    const cutoff = new Date(all[all.length - 1].date);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return all.filter((p) => new Date(p.date) >= cutoff);
  }, [data, years]);

  const width = 920;
  const height = 380;
  const padding = { top: 16, right: 16, bottom: 40, left: 64 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const logs = points.map((p) => Math.log(p.tr_level as number));
    const minL = Math.min(...logs);
    const maxL = Math.max(...logs);
    const span = maxL - minL || 1;
    const xy = points.map((p, i) => ({
      x: padding.left + (i / (points.length - 1)) * innerW,
      y: padding.top + innerH - ((Math.log(p.tr_level as number) - minL) / span) * innerH,
      state: p.state,
      date: p.date,
    }));
    const path = xy
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');

    // contiguous defense bands
    const bands: Array<{ x0: number; x1: number; from: string; to: string }> = [];
    let start: number | null = null;
    for (let i = 0; i < xy.length; i += 1) {
      const def = xy[i].state === 'defense';
      if (def && start === null) start = i;
      if ((!def || i === xy.length - 1) && start !== null) {
        const end = def ? i : i - 1;
        bands.push({
          x0: xy[start].x,
          x1: xy[end].x,
          from: xy[start].date,
          to: xy[end].date,
        });
        start = null;
      }
    }

    // year gridlines/labels (up to ~8)
    const firstYear = new Date(points[0].date).getFullYear();
    const lastYear = new Date(points[points.length - 1].date).getFullYear();
    const step = Math.max(1, Math.ceil((lastYear - firstYear) / 8));
    const yearTicks: Array<{ x: number; label: string }> = [];
    for (let y = firstYear + 1; y <= lastYear; y += step) {
      const idx = points.findIndex((p) => new Date(p.date).getFullYear() >= y);
      if (idx >= 0) yearTicks.push({ x: xy[idx].x, label: String(y) });
    }

    // log-level labels
    const levelTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const lv = Math.exp(minL + f * span);
      return { y: padding.top + innerH - f * innerH, label: lv >= 1000 ? `${(lv / 1000).toFixed(1)}k` : lv.toFixed(0) };
    });

    return { path, bands, yearTicks, levelTicks };
  }, [points, innerH, innerW, padding.left, padding.top]);

  const defenseShare = points.length
    ? points.filter((p) => p.state === 'defense').length / points.length
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-[var(--tx,#0F172A)] tracking-tight">
              Regime Timeline — the honest record
            </h2>
            <p className="text-sm text-[var(--tx-mut,#64748b)] mt-2">
              Defense periods (shaded) over the S&amp;P 500 total-return index (log scale).
              Both the covered bears and the false alarms are visible by design.
              Pre-1990 market history uses a total-market splice.
            </p>
          </div>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w.label}
                onClick={() => setYears(w.years)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
                  years === w.years
                    ? 'bg-indigo-500 text-white border-indigo-500'
                    : 'bg-white text-[var(--tx-mut,#64748b)] border-[var(--border-soft,#e2e8f0)] hover:border-[var(--tx-dim,#94a3b8)]'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-[var(--tx-mut,#64748b)]">Loading timeline…</p>}
        {error && <p className="text-sm text-rose-500">Failed to load timeline.</p>}
        {chart && (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
              {chart.bands.map((b) => (
                <rect
                  key={`${b.from}-${b.to}`}
                  x={b.x0}
                  y={padding.top}
                  width={Math.max(b.x1 - b.x0, 1.5)}
                  height={innerH}
                  fill="#fda4af"
                  opacity={0.35}
                />
              ))}
              {chart.levelTicks.map((t) => (
                <g key={t.y}>
                  <line x1={padding.left} x2={width - padding.right} y1={t.y} y2={t.y}
                        stroke="var(--border-soft,#e2e8f0)" strokeWidth={1} />
                  <text x={padding.left - 8} y={t.y + 4} textAnchor="end"
                        className="fill-slate-400 text-[11px]">
                    {t.label}
                  </text>
                </g>
              ))}
              {chart.yearTicks.map((t) => (
                <text key={t.label} x={t.x} y={height - 14} textAnchor="middle"
                      className="fill-slate-400 text-[11px]">
                  {t.label}
                </text>
              ))}
              <path d={chart.path} fill="none" stroke="var(--tx,#0f172a)" strokeWidth={1.6} />
            </svg>
            <p className="text-xs text-[var(--tx-mut,#64748b)] mt-2">
              Time in defense over this window: <b>{(defenseShare * 100).toFixed(0)}%</b> of
              weeks.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
