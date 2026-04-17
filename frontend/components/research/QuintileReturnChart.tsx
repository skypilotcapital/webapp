'use client';

import type { P01QuintilePoint } from '@/types/api';

// ---------------------------------------------------------------------------
// Quintile Cumulative Return Chart
//
// Renders a custom SVG chart of cumulative returns for Q1–Q5.
// Monthly returns are chained: cumRet[i] = ∏(1 + r_j) - 1 for j=0..i
// Rebased to 100 at the start.
//
// Color convention:
//   Q1 (bottom quintile) = red
//   Q2                   = orange
//   Q3 (middle)          = slate gray
//   Q4                   = teal
//   Q5 (top quintile)    = green
//
// For direction=-1 factors (e.g. vol_21d), Q1 (lowest vol) is expected best —
// the chart shows this naturally: Q1 line should be highest.
// ---------------------------------------------------------------------------

const Q_COLORS = ['#ef4444', '#f97316', '#94a3b8', '#14b8a6', '#22c55e'];
const Q_LABELS = ['Q1 (bottom)', 'Q2', 'Q3 (mid)', 'Q4', 'Q5 (top)'];

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function cumulativeReturns(monthly: (number | null)[]): (number | null)[] {
  let prod = 1;
  let started = false;
  return monthly.map((r) => {
    if (r == null) return null;
    if (!started) started = true;
    prod *= 1 + r;
    return (prod - 1) * 100; // percent
  });
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

interface QuintileReturnChartProps {
  data: P01QuintilePoint[];
  title: string;
}

export function QuintileReturnChart({ data, title }: QuintileReturnChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No quintile data available.</p>;
  }

  const width = 820;
  const height = 320;
  const pad = { top: 24, right: 24, bottom: 48, left: 64 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const keys = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;

  // Compute cumulative returns for each quintile
  const cumSeries = keys.map((k) => cumulativeReturns(data.map((d) => d[k])));

  // Y-axis domain
  const allVals = cumSeries.flat().filter((v): v is number => v != null);
  if (allVals.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No valid returns to chart.</p>;
  }
  const yMin = Math.min(...allVals) * 1.05;
  const yMax = Math.max(...allVals) * 1.05;
  const ySpan = yMax - yMin || 1;

  function xCoord(i: number) {
    return pad.left + (i / Math.max(data.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((v - yMin) / ySpan) * ih;
  }
  const zeroY = yCoord(0);

  // Y-axis ticks (5 steps)
  const yTickCount = 5;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    return yMin + (i / (yTickCount - 1)) * (yMax - yMin);
  });

  // X-axis ticks
  const tickCount = Math.min(6, data.length);
  const xTickIdxs = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(tickCount - 1, 1)) * (data.length - 1))
  );

  // Build SVG paths for each quintile
  const paths = cumSeries.map((series) =>
    buildPath(
      series.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null))
    )
  );

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      {title && (
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">{title}</p>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Zero line (only if in range) */}
        {zeroY >= pad.top && zeroY <= pad.top + ih && (
          <line
            x1={pad.left} y1={zeroY}
            x2={pad.left + iw} y2={zeroY}
            stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3"
          />
        )}

        {/* Grid */}
        {yTicks.map((v) => {
          const y = yCoord(v);
          if (y < pad.top || y > pad.top + ih) return null;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={pad.left + iw} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                {v > 0 ? `+${v.toFixed(0)}%` : `${v.toFixed(0)}%`}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top + ih} x2={pad.left + iw} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />

        {/* Quintile lines — render Q3 first (behind), then Q1/Q5 last (front) */}
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

        {/* X-axis labels */}
        {xTickIdxs.map((idx) => {
          const x = xCoord(idx);
          return (
            <g key={idx}>
              <line x1={x} y1={pad.top + ih} x2={x} y2={pad.top + ih + 4} stroke="#cbd5e1" strokeWidth="1" />
              <text x={x} y={pad.top + ih + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {formatDateShort(data[idx].date)}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text
          x={14}
          y={pad.top + ih / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${pad.top + ih / 2})`}
          fontSize="10"
          fill="#94a3b8"
        >
          Cumulative Return (%)
        </text>
      </svg>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
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
    </div>
  );
}
