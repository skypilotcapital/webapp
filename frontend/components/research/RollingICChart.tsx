'use client';

import type { P01ICPoint } from '@/types/api';

// ---------------------------------------------------------------------------
// Rolling IC Chart
//
// Renders a custom SVG line chart of rolling 24-month IC over time.
// Two lines: Full Universe (indigo) and Within Sector (sky).
// Includes a zero reference line and shaded positive/negative bands.
// ---------------------------------------------------------------------------

const WINDOW = 24; // rolling months

function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    const valid = slice.filter((v): v is number => v != null && !isNaN(v));
    return valid.length === window ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildPath(
  points: Array<{ x: number; y: number } | null>,
): string {
  const segments: string[] = [];
  let penUp = true;
  for (const p of points) {
    if (p == null) { penUp = true; continue; }
    segments.push(`${penUp ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    penUp = false;
  }
  return segments.join(' ');
}

interface RollingICChartProps {
  data: P01ICPoint[];
  /** direction=1: expect positive IC as "good"; direction=-1: expect negative IC */
  direction: 1 | -1;
}

export function RollingICChart({ data, direction }: RollingICChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No IC data available.</p>;
  }

  const width = 860;
  const height = 300;
  const pad = { top: 20, right: 24, bottom: 48, left: 52 };
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;

  const fullRaw = data.map((d) => d.ic_full);
  const wsRaw = data.map((d) => d.ic_within);

  const fullRolling = rollingMean(fullRaw, WINDOW);
  const wsRolling = rollingMean(wsRaw, WINDOW);

  // Y-axis domain — symmetric around zero, min ±0.06
  const allVals = [...fullRolling, ...wsRolling].filter((v): v is number => v != null);
  const maxAbs = Math.max(0.06, ...allVals.map(Math.abs));
  const yMin = -maxAbs * 1.15;
  const yMax = maxAbs * 1.15;
  const ySpan = yMax - yMin;

  function xCoord(i: number) {
    return pad.left + (i / Math.max(data.length - 1, 1)) * iw;
  }
  function yCoord(v: number) {
    return pad.top + ih - ((v - yMin) / ySpan) * ih;
  }
  const zeroY = yCoord(0);

  const fullPts = fullRolling.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null));
  const wsPts = wsRolling.map((v, i) => (v != null ? { x: xCoord(i), y: yCoord(v) } : null));

  // X-axis ticks: ~5 evenly spaced labels
  const tickCount = Math.min(5, data.length);
  const xTickIdxs = Array.from({ length: tickCount }, (_, k) =>
    Math.round((k / (tickCount - 1)) * (data.length - 1))
  );

  // Y-axis ticks
  const yTicks = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  // Shaded "good IC" region — above zero for direction=1, below for direction=-1
  const goodTop = direction === 1 ? pad.top : zeroY;
  const goodHeight = direction === 1 ? zeroY - pad.top : ih - (zeroY - pad.top);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Good IC shaded band */}
        <rect
          x={pad.left}
          y={goodTop}
          width={iw}
          height={Math.max(goodHeight, 0)}
          fill="#4F46E5"
          opacity="0.04"
        />

        {/* Grid lines */}
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

        {/* Within-sector line (behind) */}
        <path
          d={buildPath(wsPts)}
          fill="none"
          stroke="#0ea5e9"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Full-universe line (front) */}
        <path
          d={buildPath(fullPts)}
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
          Rolling {WINDOW}M IC
        </text>
      </svg>

      {/* Legend + caption */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-5 text-xs text-slate-500">
          {[
            { label: `Full Universe`, color: '#4F46E5', weight: 2.5 },
            { label: `Within Sector`, color: '#0ea5e9', weight: 2 },
          ].map(({ label, color, weight }) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className="inline-block rounded-sm"
                style={{ width: 20, height: weight, backgroundColor: color }}
              />
              <span>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#4F46E5', opacity: 0.15 }} />
            <span>{direction === 1 ? 'Positive IC region (expected)' : 'Negative IC region (expected)'}</span>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Monthly raw IC smoothed over {WINDOW}-month rolling window
        </p>
      </div>
    </div>
  );
}
