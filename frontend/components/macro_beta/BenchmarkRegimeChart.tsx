'use client';

import useSWR from 'swr';
import { fetchMacroBetaChart } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const REGIME_COLORS: Record<string, string> = {
  low_beta: '#ebd0d0',
  market_beta: '#efe4c9',
  high_beta: '#d7e8da',
};

const LINE_COLORS = {
  spot: '#0f172a',
  ma50: '#2563eb',
  ma200: '#b45309',
};

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

export function BenchmarkRegimeChart() {
  const { data, error, isLoading } = useSWR('macro-beta-chart', fetchMacroBetaChart, { refreshInterval: 120_000 });
  const chartData = (data ?? []).filter((point) => point.sp500_spot_level != null);

  const width = 920;
  const height = 360;
  const padding = { top: 20, right: 18, bottom: 52, left: 64 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const allLevels = chartData.flatMap((point) =>
    [point.sp500_spot_level, point.sp500_spot_ma50, point.sp500_spot_ma200].filter((value): value is number => value != null)
  );

  const minLevel = allLevels.length ? Math.min(...allLevels) : 0;
  const maxLevel = allLevels.length ? Math.max(...allLevels) : 1;
  const span = maxLevel - minLevel || 1;

  const buildSeries = (selector: (point: (typeof chartData)[number]) => number | null | undefined) =>
    chartData.flatMap((point, index) => {
      const value = selector(point);
      if (value == null) return [];
      const x = padding.left + (index / Math.max(chartData.length - 1, 1)) * innerWidth;
      const y = padding.top + innerHeight - ((value - minLevel) / span) * innerHeight;
      return [{ x, y }];
    });

  const spotPath = buildPath(buildSeries((point) => point.sp500_spot_level));
  const ma50Path = buildPath(buildSeries((point) => point.sp500_spot_ma50));
  const ma200Path = buildPath(buildSeries((point) => point.sp500_spot_ma200));

  const yTicks = Array.from({ length: 5 }, (_, index) => {
    const value = minLevel + (span * index) / 4;
    const y = padding.top + innerHeight - (innerHeight * index) / 4;
    return { value, y };
  });

  const xTickIndexes = chartData.length > 2 ? [0, Math.floor((chartData.length - 1) / 2), chartData.length - 1] : chartData.map((_, index) => index);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">S&amp;P 500 Regime Chart</h2>
        <p className="text-sm text-slate-500 mt-2">
          Trailing 1Y spot S&amp;P 500 path with display-only 50d and 200d moving averages, plus background regime shading.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading chart...</p>}
        {error && <p className="text-sm text-red-500">Failed to load chart.</p>}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
              {chartData.map((point, index) => {
                const currentX = padding.left + (index / Math.max(chartData.length, 1)) * innerWidth;
                const nextX = padding.left + ((index + 1) / Math.max(chartData.length, 1)) * innerWidth;
                return (
                  <rect
                    key={`${point.signal_date}-${point.final_beta_target}`}
                    x={currentX}
                    y={padding.top}
                    width={Math.max(nextX - currentX, 1)}
                    height={innerHeight}
                    fill={REGIME_COLORS[point.final_beta_target] ?? '#e2e8f0'}
                  />
                );
              })}

              {yTicks.map((tick) => (
                <g key={tick.y}>
                  <line x1={padding.left} y1={tick.y} x2={padding.left + innerWidth} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={padding.left - 10} y={tick.y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                    {tick.value.toFixed(0)}
                  </text>
                </g>
              ))}

              <line x1={padding.left} y1={padding.top + innerHeight} x2={padding.left + innerWidth} y2={padding.top + innerHeight} stroke="#94a3b8" strokeWidth="1.25" />
              <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerHeight} stroke="#94a3b8" strokeWidth="1.25" />

              <path d={ma200Path} fill="none" stroke={LINE_COLORS.ma200} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={ma50Path} fill="none" stroke={LINE_COLORS.ma50} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              <path d={spotPath} fill="none" stroke={LINE_COLORS.spot} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />

              {xTickIndexes.map((index) => {
                const point = chartData[index];
                const x = padding.left + (index / Math.max(chartData.length - 1, 1)) * innerWidth;
                return (
                  <g key={point.signal_date}>
                    <line x1={x} y1={padding.top + innerHeight} x2={x} y2={padding.top + innerHeight + 6} stroke="#94a3b8" strokeWidth="1" />
                    <text x={x} y={padding.top + innerHeight + 20} textAnchor="middle" fontSize="11" fill="#64748b">
                      {formatDateLabel(point.signal_date)}
                    </text>
                  </g>
                );
              })}

              <text x={padding.left + innerWidth / 2} y={height - 10} textAnchor="middle" fontSize="12" fill="#475569">
                Date
              </text>
              <text
                x={18}
                y={padding.top + innerHeight / 2}
                textAnchor="middle"
                transform={`rotate(-90 18 ${padding.top + innerHeight / 2})`}
                fontSize="12"
                fill="#475569"
              >
                S&amp;P 500 Index Level
              </text>
            </svg>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span>Window: trailing ~1Y</span>
              <span>Range: {minLevel.toFixed(0)} to {maxLevel.toFixed(0)}</span>
              <span>Start: {chartData[0]?.signal_date}</span>
              <span>End: {chartData[chartData.length - 1]?.signal_date}</span>
            </div>

            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              {[
                ['Spot Index', LINE_COLORS.spot],
                ['50D MA', LINE_COLORS.ma50],
                ['200D MA', LINE_COLORS.ma200],
              ].map(([label, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="inline-block h-[2px] w-5 rounded-sm" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
              {Object.entries(REGIME_COLORS).map(([state, color]) => (
                <div key={state} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ backgroundColor: color }} />
                  <span>{state.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase())}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
