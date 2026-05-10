'use client';

import type { ModelQuintilePoint } from '@/types/api';

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function pivotQuintiles(data: ModelQuintilePoint[]): {
  dates: string[];
  q1: (number | null)[];
  q5: (number | null)[];
} {
  const byDate = new Map<string, Map<number, number | null>>();
  for (const pt of data) {
    if (!byDate.has(pt.date)) byDate.set(pt.date, new Map());
    byDate.get(pt.date)!.set(pt.quintile, pt.fwd_return);
  }
  const dates = Array.from(byDate.keys()).sort();
  const q1 = dates.map((d) => byDate.get(d)?.get(1) ?? null);
  const q5 = dates.map((d) => byDate.get(d)?.get(5) ?? null);
  return { dates, q1, q5 };
}

function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  const MIN_VALID = Math.ceil(window / 2);
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    const valid = slice.filter((v): v is number => v != null && !isNaN(v));
    return valid.length >= MIN_VALID ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  });
}

function niceStep(extent: number): number {
  const candidates = [0.005, 0.01, 0.02, 0.025, 0.05, 0.10, 0.15, 0.20, 0.25];
  for (const s of candidates) {
    if ((2 * extent) / s <= 6) return s;
  }
  return 0.25;
}

interface ModelSpreadChartProps {
  data: ModelQuintilePoint[];
  sector: string;
}

export function ModelSpreadChart({ data, sector }: ModelSpreadChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No quintile data available.</p>;
  }

  const { dates, q1, q5 } = pivotQuintiles(data);

  // Monthly Q5 − Q1, annualized
  const monthlySpreadAnn = dates.map((_, i) => {
    const a = q5[i], b = q1[i];
    return a != null && b != null ? (a - b) * 12 : null;
  });

  const WINDOW = 24;
  const rollingAnn = rollingMean(monthlySpreadAnn, WINDOW);

  const rawVals = monthlySpreadAnn.filter((v): v is number => v != null);
  const rollingVals = rollingAnn.filter((v): v is number => v != null);
  if (rawVals.length === 0) return null;

  const overallMean = rawVals.reduce((a, b) => a + b, 0) / rawVals.length;

  const allVals = [...rawVals, ...rollingVals];
  const extent = Math.max(Math.abs(Math.min(...allVals)), Math.abs(Math.max(...allVals)));
  const step = niceStep(extent);
  const yMax = Math.ceil(extent / step) * step + step * 0.5;
  const yMin = -yMax;

  const width = 820;
  const height = 210;
  const pad = { top: 16, right: 24, bottom: 44, left: 58 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  function xCoord(i: number) {
    return pad.left + (i / Math.max(dates.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((v - yMin) / (yMax - yMin)) * ih;
  }
  const zeroY = yCoord(0);
  const meanY = yCoord(overallMean);

  // Y-axis ticks
  const yTicks: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax + step * 0.01; v += step) {
    const rounded = Math.round(v / step) * step;
    if (Math.abs(rounded) <= yMax + step * 0.01) yTicks.push(rounded);
  }

  // X-axis ticks
  const tickCount = Math.min(7, dates.length);
  const xTickIdxs = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(tickCount - 1, 1)) * (dates.length - 1))
  );

  const barW = Math.max(1.5, iw / dates.length - 0.8);

  // Rolling line path
  const rollingPath = (() => {
    const parts: string[] = [];
    let penUp = true;
    rollingAnn.forEach((v, i) => {
      if (v == null) { penUp = true; return; }
      parts.push(`${penUp ? 'M' : 'L'} ${xCoord(i).toFixed(2)} ${yCoord(v).toFixed(2)}`);
      penUp = false;
    });
    return parts.join(' ');
  })();

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Y-axis grid + labels */}
        {yTicks.map((v) => {
          const y = yCoord(v);
          if (y < pad.top - 2 || y > pad.top + ih + 2) return null;
          const isZero = Math.abs(v) < step * 0.01;
          return (
            <g key={v}>
              <line
                x1={pad.left} y1={y} x2={pad.left + iw} y2={y}
                stroke={isZero ? '#cbd5e1' : '#f1f5f9'}
                strokeWidth={isZero ? 1.5 : 1}
              />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize="10" fill={isZero ? '#64748b' : '#94a3b8'} fontWeight={isZero ? '600' : 'normal'}>
                {`${v > 0 ? '+' : v < 0 ? '' : ''}${(v * 100).toFixed(0)}%`}
              </text>
            </g>
          );
        })}

        {/* Full-period mean dashed line */}
        {meanY >= pad.top && meanY <= pad.top + ih && (
          <line
            x1={pad.left} y1={meanY} x2={pad.left + iw} y2={meanY}
            stroke="#6366f1" strokeWidth="1" strokeDasharray="5 4" opacity={0.45}
          />
        )}

        {/* Monthly bars */}
        {monthlySpreadAnn.map((v, i) => {
          if (v == null) return null;
          const x = xCoord(i) - barW / 2;
          const isPos = v >= 0;
          const barTop = isPos ? yCoord(v) : zeroY;
          const barH = Math.max(Math.abs(yCoord(v) - zeroY), 0.5);
          return (
            <rect
              key={i} x={x} y={barTop} width={barW} height={barH}
              fill={isPos ? '#22c55e' : '#ef4444'} opacity={0.22} rx="0.5"
            />
          );
        })}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top + ih} x2={pad.left + iw} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />

        {/* Rolling 24M line */}
        {rollingPath && (
          <path
            d={rollingPath} fill="none"
            stroke="#6366f1" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round"
          />
        )}

        {/* X-axis ticks + labels */}
        {xTickIdxs.map((idx) => {
          const x = xCoord(idx);
          return (
            <g key={idx}>
              <line x1={x} y1={pad.top + ih} x2={x} y2={pad.top + ih + 4} stroke="#cbd5e1" strokeWidth="1" />
              <text x={x} y={pad.top + ih + 16} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {formatDateShort(dates[idx])}
              </text>
            </g>
          );
        })}

        {/* Y-axis label */}
        <text
          x={13} y={pad.top + ih / 2} textAnchor="middle"
          transform={`rotate(-90 13 ${pad.top + ih / 2})`}
          fontSize="10" fill="#94a3b8"
        >
          Q5−Q1 Spread (ann.)
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-5 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-[2.5px] rounded bg-indigo-500" />
            <span>24-month rolling mean</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-3 rounded-sm bg-emerald-500 opacity-40" />
            <span>Monthly Q5−Q1</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="20" height="10" className="shrink-0">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
            </svg>
            <span>
              Full-period mean ({overallMean >= 0 ? '+' : ''}{(overallMean * 100).toFixed(1)}%/yr)
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Sector: <span className="font-semibold">{sector}</span>
        </p>
      </div>
    </div>
  );
}
