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

// Returns growth index rebased to 100 at start (log-scale friendly)
function cumulativeIndex(monthly: (number | null)[]): (number | null)[] {
  let prod = 1;
  return monthly.map((r) => {
    if (r == null) return null;
    prod *= 1 + r;
    return prod * 100;
  });
}

// Generate human-readable tick values that span [min, max] on a log scale
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

  // Compute cumulative growth index (rebased to 100) for each quintile
  const cumSeries = keys.map((k) => cumulativeIndex(data.map((d) => d[k])));

  // Y-axis domain (log scale — values are always > 0)
  const allVals = cumSeries.flat().filter((v): v is number => v != null && v > 0);
  if (allVals.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No valid returns to chart.</p>;
  }
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const logMin = Math.log(rawMin * 0.92);
  const logMax = Math.log(rawMax * 1.08);

  function xCoord(i: number) {
    return pad.left + (i / Math.max(data.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((Math.log(v) - logMin) / (logMax - logMin)) * ih;
  }
  const baselineY = yCoord(100); // where index = 100 (starting value)

  // Y-axis ticks — log-spaced human-readable values
  const yTicks = logScaleTicks(rawMin * 0.92, rawMax * 1.08);

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
        {/* Baseline at index 100 */}
        {baselineY >= pad.top && baselineY <= pad.top + ih && (
          <line
            x1={pad.left} y1={baselineY}
            x2={pad.left + iw} y2={baselineY}
            stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 3"
          />
        )}

        {/* Grid + y-axis tick labels */}
        {yTicks.map((v) => {
          const y = yCoord(v);
          if (y < pad.top || y > pad.top + ih) return null;
          const label = v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${v}`;
          return (
            <g key={v}>
              <line x1={pad.left} y1={y} x2={pad.left + iw} y2={y} stroke="#f1f5f9" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={v === 100 ? '#64748b' : '#94a3b8'} fontWeight={v === 100 ? '600' : 'normal'}>
                {label}
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
          Growth Index (log, start = 100)
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
