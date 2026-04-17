'use client';

import useSWR from 'swr';
import { fetchMacroBetaChart } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

const COLORS: Record<string, string> = {
  low_beta: '#ebd0d0',
  market_beta: '#efe4c9',
  high_beta: '#d7e8da',
};

function buildPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) return '';
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

export function BenchmarkRegimeChart() {
  const { data, error, isLoading } = useSWR('macro-beta-chart', fetchMacroBetaChart, { refreshInterval: 120_000 });

  const chartData = (data ?? []).filter((point) => point.sp500_spot_level != null);

  const width = 920;
  const height = 320;
  const padding = { top: 16, right: 18, bottom: 28, left: 18 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  let linePath = '';
  let minLevel = 0;
  let maxLevel = 0;

  if (chartData.length > 0) {
    minLevel = Math.min(...chartData.map((point) => point.sp500_spot_level as number));
    maxLevel = Math.max(...chartData.map((point) => point.sp500_spot_level as number));
    const span = maxLevel - minLevel || 1;
    const points = chartData.map((point, index) => {
      const x = padding.left + (index / Math.max(chartData.length - 1, 1)) * innerWidth;
      const y = padding.top + innerHeight - (((point.sp500_spot_level as number) - minLevel) / span) * innerHeight;
      return { x, y };
    });
    linePath = buildPath(points);
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">S&amp;P 500 Regime Chart</h2>
        <p className="text-sm text-slate-500 mt-2">Spot S&amp;P 500 path with background regime shading over the recent daily signal window.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading chart...</p>}
        {error && <p className="text-sm text-red-500">Failed to load chart.</p>}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-slate-100 bg-white p-4">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
              {chartData.map((point, index) => {
                const nextX = padding.left + ((index + 1) / Math.max(chartData.length, 1)) * innerWidth;
                const x = padding.left + (index / Math.max(chartData.length, 1)) * innerWidth;
                return (
                  <rect
                    key={`${point.signal_date}-${point.final_beta_target}`}
                    x={x}
                    y={padding.top}
                    width={Math.max(nextX - x, 1)}
                    height={innerHeight}
                    fill={COLORS[point.final_beta_target] ?? '#e2e8f0'}
                  />
                );
              })}
              <line x1={padding.left} y1={padding.top + innerHeight} x2={padding.left + innerWidth} y2={padding.top + innerHeight} stroke="#cbd5e1" strokeWidth="1" />
              <path d={linePath} fill="none" stroke="#1e293b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span>Range: {minLevel.toFixed(0)} to {maxLevel.toFixed(0)}</span>
              <span>Start: {chartData[0]?.signal_date}</span>
              <span>End: {chartData[chartData.length - 1]?.signal_date}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              {Object.entries(COLORS).map(([state, color]) => (
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
