'use client';

import type { ModelQuintilePoint } from '@/types/api';

// Q1 = bottom (model says weakest) → red; Q5 = top (model says strongest) → green
const Q_COLORS = ['#dc2626', '#ea580c', '#64748b', '#0d9488', '#16a34a'];
const Q_LABELS = ['Q1 (weakest alpha)', 'Q2', 'Q3 (mid)', 'Q4', 'Q5 (strongest alpha)'];

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function cumulativeIndex(monthly: (number | null)[]): (number | null)[] {
  let prod = 1;
  return monthly.map((r) => {
    if (r == null) return null;
    prod *= 1 + r;
    return prod * 100;
  });
}

function logScaleTicks(min: number, max: number): number[] {
  const candidates = [
    5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80,
    100, 125, 150, 175, 200, 250, 300, 400, 500,
    600, 700, 800, 1000, 1250, 1500, 2000, 2500, 3000,
    4000, 5000, 7500, 10000,
  ];
  return candidates.filter((v) => v >= min * 0.85 && v <= max * 1.18);
}

function buildPath(points: Array<{ x: number; y: number } | null>): string {
  const parts: string[] = [];
  let penUp = true;
  for (const p of points) {
    if (p == null) { penUp = true; continue; }
    parts.push(`${penUp ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    penUp = false;
  }
  return parts.join(' ');
}

// Pivot long-format ModelQuintilePoint[] into per-date arrays of [q1..q5]
function pivotQuintiles(data: ModelQuintilePoint[]): {
  dates: string[];
  series: (number | null)[][];
} {
  const byDate = new Map<string, Map<number, number | null>>();
  for (const pt of data) {
    if (!byDate.has(pt.date)) byDate.set(pt.date, new Map());
    byDate.get(pt.date)!.set(pt.quintile, pt.fwd_return);
  }
  const dates = Array.from(byDate.keys()).sort();
  const series: (number | null)[][] = [1, 2, 3, 4, 5].map((q) =>
    dates.map((d) => byDate.get(d)?.get(q) ?? null)
  );
  return { dates, series };
}

interface ModelQuintileChartProps {
  data: ModelQuintilePoint[];
  sector: string;
}

export function ModelQuintileChart({ data, sector }: ModelQuintileChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[var(--tx-dim)] text-center py-12">No quintile data available for this sector.</p>;
  }

  const { dates, series } = pivotQuintiles(data);
  const cumSeries = series.map((s) => cumulativeIndex(s));

  const width = 820;
  const height = 250;
  const pad = { top: 24, right: 24, bottom: 48, left: 64 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const allVals = cumSeries.flat().filter((v): v is number => v != null && v > 0);
  if (allVals.length === 0) {
    return <p className="text-sm text-[var(--tx-dim)] text-center py-12">No valid returns to chart.</p>;
  }
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const logMin = Math.log(rawMin * 0.92);
  const logMax = Math.log(rawMax * 1.08);

  function xCoord(i: number) {
    return pad.left + (i / Math.max(dates.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((Math.log(v) - logMin) / (logMax - logMin)) * ih;
  }
  const baselineY = yCoord(100);

  const yTicks = logScaleTicks(rawMin * 0.92, rawMax * 1.08);

  const tickCount = Math.min(6, dates.length);
  const xTickIdxs = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(tickCount - 1, 1)) * (dates.length - 1))
  );

  const paths = cumSeries.map((s) =>
    buildPath(s.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null)))
  );

  return (
    <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {baselineY >= pad.top && baselineY <= pad.top + ih && (
          <line
            x1={pad.left} y1={baselineY}
            x2={pad.left + iw} y2={baselineY}
            stroke="var(--tx-dim)" strokeWidth="1.2" strokeDasharray="4 3"
          />
        )}

        {yTicks.map((v) => {
          const y = yCoord(v);
          if (y < pad.top || y > pad.top + ih) return null;
          const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${v}`;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={pad.left + iw} y2={y} stroke="var(--border-soft)" strokeWidth="1" />
              <text
                x={pad.left - 8} y={y + 4}
                textAnchor="end" fontSize="10"
                fill={v === 100 ? 'var(--tx-mut)' : 'var(--tx-dim)'}
                fontWeight={v === 100 ? '600' : 'normal'}
              >
                {label}
              </text>
            </g>
          );
        })}

        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ih} stroke="var(--border-soft)" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top + ih} x2={pad.left + iw} y2={pad.top + ih} stroke="var(--border-soft)" strokeWidth="1" />

        {[2, 1, 3, 0, 4].map((qi) => (
          <path
            key={qi}
            d={paths[qi]}
            fill="none"
            stroke={Q_COLORS[qi]}
            strokeWidth={qi === 0 || qi === 4 ? 2.5 : qi === 2 ? 1.5 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={qi === 2 ? 0.6 : 1}
          />
        ))}

        {xTickIdxs.map((idx) => {
          const x = xCoord(idx);
          return (
            <g key={idx}>
              <line x1={x} y1={pad.top + ih} x2={x} y2={pad.top + ih + 4} stroke="var(--border-soft)" strokeWidth="1" />
              <text x={x} y={pad.top + ih + 16} textAnchor="middle" fontSize="10" fill="var(--tx-dim)">
                {formatDateShort(dates[idx])}
              </text>
            </g>
          );
        })}

        <text
          x={14} y={pad.top + ih / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${pad.top + ih / 2})`}
          fontSize="10" fill="var(--tx-dim)"
        >
          Growth Index (log, start = 100)
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-xs text-[var(--tx-mut)]">
          {Q_LABELS.map((label, qi) => (
            <div key={qi} className="flex items-center gap-2">
              <span
                className="inline-block rounded-sm"
                style={{
                  width: 20,
                  height: qi === 0 || qi === 4 ? 3 : 2,
                  backgroundColor: Q_COLORS[qi],
                  opacity: qi === 2 ? 0.6 : 1,
                }}
              />
              <span className={qi === 0 || qi === 4 ? 'font-semibold' : ''}>{label}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-[var(--tx-dim)]">Sector: <span className="font-semibold">{sector}</span></p>
      </div>
    </div>
  );
}
