'use client';

import type { ModelICPoint } from '@/types/api';

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildPath(points: Array<{ x: number; y: number } | null>): string {
  const segments: string[] = [];
  let penUp = true;
  for (const p of points) {
    if (p == null) { penUp = true; continue; }
    segments.push(`${penUp ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    penUp = false;
  }
  return segments.join(' ');
}

interface ModelRollingICChartProps {
  data: ModelICPoint[];
  sector: string;
}

export function ModelRollingICChart({ data, sector }: ModelRollingICChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No IC data available for this sector.</p>;
  }

  const width = 860;
  const height = 300;
  const pad = { top: 20, right: 24, bottom: 48, left: 52 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const rawIC = data.map((d) => d.ic);

  // Use precomputed rolling_12m_ic if available; otherwise compute client-side (min 6 months)
  const rolling = data.map((d, i) => {
    if (d.rolling_12m_ic != null) return d.rolling_12m_ic;
    const window = data
      .slice(Math.max(0, i - 11), i + 1)
      .map((p) => p.ic)
      .filter((v): v is number => v != null);
    return window.length >= 6 ? window.reduce((a, b) => a + b, 0) / window.length : null;
  });

  const allVals = [...rawIC, ...rolling].filter((v): v is number => v != null && !isNaN(v));
  const maxAbs = Math.max(0.06, ...allVals.map(Math.abs));
  const yMin = -maxAbs * 1.2;
  const yMax = maxAbs * 1.2;
  const ySpan = yMax - yMin;

  function xCoord(i: number) {
    return pad.left + (i / Math.max(data.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((v - yMin) / ySpan) * ih;
  }
  const zeroY = yCoord(0);

  const rawPts = rawIC.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null));
  const rollingPts = rolling.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null));

  const tickCount = Math.min(6, data.length);
  const xTickIdxs = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / Math.max(tickCount - 1, 1)) * (data.length - 1))
  );

  const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Positive IC shading */}
        <rect
          x={pad.left}
          y={pad.top}
          width={iw}
          height={Math.max(zeroY - pad.top, 0)}
          fill="#4F46E5"
          opacity="0.04"
        />

        {/* Grid + y-axis labels */}
        {yTicks.map((v) => {
          const y = yCoord(v);
          return (
            <g key={v}>
              <line
                x1={pad.left} y1={y} x2={pad.left + iw} y2={y}
                stroke={v === 0 ? '#94a3b8' : '#e2e8f0'}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : '3 3'}
              />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                {v === 0 ? '0' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />
        <line x1={pad.left} y1={pad.top + ih} x2={pad.left + iw} y2={pad.top + ih} stroke="#cbd5e1" strokeWidth="1" />

        {/* Raw monthly IC (faint) */}
        <path
          d={buildPath(rawPts)}
          fill="none"
          stroke="#4F46E5"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.2"
        />

        {/* Rolling 12M IC (bold) */}
        <path
          d={buildPath(rollingPts)}
          fill="none"
          stroke="#4F46E5"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

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
          IC
        </text>
      </svg>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-5 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="inline-block rounded-sm" style={{ width: 20, height: 2.5, backgroundColor: '#4F46E5' }} />
            <span>Rolling 12M IC</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block rounded-sm" style={{ width: 20, height: 1, backgroundColor: '#4F46E5', opacity: 0.3 }} />
            <span>Monthly IC</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Sector: <span className="font-semibold">{sector}</span> — Spearman rank correlation between alpha score and realised return
        </p>
      </div>
    </div>
  );
}
