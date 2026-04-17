'use client';

import useSWR from 'swr';
import { fetchMacroBetaComponents } from '@/lib/api';
import type { ComponentPoint } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

type SeriesCardProps = {
  title: string;
  subtitle: string;
  series: ComponentPoint[];
  color: string;
  formatter?: (value: number) => string;
  referenceLines?: number[];
};

function buildPath(
  series: ComponentPoint[],
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number }
) {
  const points = series.filter((point) => point.value != null);
  if (!points.length) {
    return { path: '', min: 0, max: 1 };
  }

  const values = points.map((point) => point.value as number);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const mapped = points.map((point, index) => {
    const x = padding.left + (index / Math.max(points.length - 1, 1)) * innerWidth;
    const y = padding.top + innerHeight - (((point.value as number) - min) / span) * innerHeight;
    return { x, y };
  });

  const path = mapped.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  return { path, min, max };
}

function formatDateLabel(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

function latestPoint(series: ComponentPoint[]) {
  const valid = [...series].reverse().find((point) => point.value != null);
  return valid ?? null;
}

function SeriesCard({ title, subtitle, series, color, formatter = (value) => value.toFixed(2), referenceLines = [] }: SeriesCardProps) {
  const width = 420;
  const height = 210;
  const padding = { top: 12, right: 14, bottom: 42, left: 14 };
  const { path, min, max } = buildPath(series, width, height, padding);
  const innerHeight = height - padding.top - padding.bottom;
  const latest = latestPoint(series);
  const validSeries = series.filter((point) => point.value != null);
  const xTickIndexes =
    validSeries.length <= 1
      ? [0]
      : validSeries.length <= 2
        ? [0, validSeries.length - 1]
        : [0, Math.floor((validSeries.length - 1) / 2), validSeries.length - 1];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-slate-800">{latest?.value != null ? formatter(latest.value) : '-'}</p>
          <p className="text-xs text-slate-500">{latest?.date ?? 'No recent data'}</p>
        </div>
      </div>

      <div className="mt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {referenceLines.map((line) => {
            const span = max - min || 1;
            const y = padding.top + innerHeight - ((line - min) / span) * innerHeight;
            return <line key={line} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1" />;
          })}
          <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {xTickIndexes.map((index) => {
            const point = validSeries[index];
            if (!point) return null;
            const x = padding.left + (index / Math.max(validSeries.length - 1, 1)) * (width - padding.left - padding.right);
            return (
              <g key={`${title}-${point.date}`}>
                <line x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 6} stroke="#94a3b8" strokeWidth="1" />
                <text x={x} y={height - 8} textAnchor="middle" fontSize="11" fill="#64748b">
                  {formatDateLabel(point.date)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function ComponentChartsSection() {
  const { data, error, isLoading } = useSWR('macro-beta-components', fetchMacroBetaComponents, { refreshInterval: 120_000 });

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-[#0F172A] tracking-tight">Component Charts</h2>
        <p className="text-sm text-slate-500 mt-2">Recent component history for the major macro beta inputs, with the latest data point called out on each chart.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading component charts...</p>}
        {error && <p className="text-sm text-red-500">Failed to load component charts.</p>}
        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SeriesCard title="PMI Level" subtitle="Recent monthly ISM manufacturing PMI readings." series={data.pmi} color="#1d4ed8" formatter={(v) => v.toFixed(1)} referenceLines={[50]} />
            <SeriesCard title="CPI YoY" subtitle="Year-over-year CPI change using the patched display series." series={data.cpi_yoy} color="#7c3aed" formatter={(v) => `${v.toFixed(2)}%`} />
            <SeriesCard title="RSI" subtitle="20-day RSI from the benchmark trend series used by the model." series={data.rsi} color="#0f766e" formatter={(v) => v.toFixed(1)} referenceLines={[30, 70]} />
            <SeriesCard title="BBB OAS" subtitle="Daily BBB option-adjusted spread in basis points." series={data.bbb_oas_bps} color="#b45309" formatter={(v) => `${v.toFixed(0)} bps`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
