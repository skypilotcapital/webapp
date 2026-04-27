'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchP01FactorDetail } from '@/lib/api';
import type { P01ScorecardRow } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { RollingICChart } from './RollingICChart';
import { QuintileReturnChart } from './QuintileReturnChart';

type ViewMode = 'side-by-side' | 'full' | 'within';

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'side-by-side', label: 'Side by Side' },
  { key: 'full', label: 'Full Universe' },
  { key: 'within', label: 'Within Sector' },
];

interface StatCardProps {
  label: string;
  value: string | null;
  sub?: string;
  highlight?: boolean;
  color?: string;
}

function StatCard({ label, value, sub, highlight, color }: StatCardProps) {
  return (
    <div
      className={`rounded-xl p-3.5 border transition-all ${
        highlight ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'
      }`}
    >
      <p className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold mb-1">{label}</p>
      <p className={`text-xl font-black ${color ?? 'text-slate-800'}`}>{value ?? '-'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

const QUALITY_BG: Record<string, string> = {
  Strong: 'bg-emerald-100 text-emerald-800',
  Moderate: 'bg-blue-100 text-blue-800',
  Weak: 'bg-amber-100 text-amber-800',
  Investigate: 'bg-red-100 text-red-700',
};

function QBadge({ q }: { q: string | null }) {
  if (!q) return <span className="text-slate-300 text-sm">-</span>;
  return (
    <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-bold ${QUALITY_BG[q] ?? 'bg-slate-100 text-slate-600'}`}>
      {q}
    </span>
  );
}

function fmtIC(v: number | null) {
  if (v == null) return null;
  return `${v >= 0 ? '+' : ''}${v.toFixed(4)}`;
}

function fmtTStat(v: number | null) {
  if (v == null) return null;
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

function fmtSpread(v: number | null) {
  if (v == null) return null;
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
}

function fmtMono(v: number | null) {
  if (v == null) return null;
  return `${(v * 100).toFixed(0)}%`;
}

interface FactorDetailPanelProps {
  row: P01ScorecardRow;
}

export function FactorDetailPanel({ row }: FactorDetailPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const { data, error, isLoading } = useSWR(
    `p01-detail-${row.factor}`,
    () => fetchP01FactorDetail(row.factor),
    { revalidateOnFocus: false }
  );

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-[#0F172A] tracking-tight">{row.factor_label}</h2>
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold ${
                  row.factor_family === 'Momentum'
                    ? 'bg-violet-100 text-violet-700'
                    : row.factor_family === 'Technical'
                      ? 'bg-purple-100 text-purple-700'
                      : row.factor_family === 'Quality'
                        ? 'bg-teal-100 text-teal-700'
                        : row.factor_family === 'Valuation'
                          ? 'bg-sky-100 text-sky-700'
                          : row.factor_family === 'Growth'
                            ? 'bg-lime-100 text-lime-700'
                            : 'bg-orange-100 text-orange-700'
                }`}
              >
                {row.factor_family}
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">{row.factor}</p>
            <p className="text-xs text-slate-400 mt-1">
              {row.n_months} months · {row.date_from} {'->'} {row.date_to}
              {row.direction === -1 && <span className="ml-2 text-orange-500 font-medium">↑ inverse factor (low = good)</span>}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        <div>
          <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">Signal Statistics</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-sm font-bold text-indigo-700 uppercase tracking-wider">Full Universe</span>
                <QBadge q={row.full_signal_quality} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmtIC(row.full_mean_ic)}
                  sub={`t = ${fmtTStat(row.full_ic_tstat)}`}
                  highlight={(row.full_ic_tstat ?? 0) > 1.65}
                  color={(row.full_mean_ic ?? 0) * row.direction > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard
                  label="t-Statistic"
                  value={fmtTStat(row.full_ic_tstat)}
                  sub={`p = ${row.full_ic_pvalue?.toFixed(3) ?? '-'}`}
                  highlight={(row.full_ic_tstat ?? 0) > 1.65}
                />
                <StatCard
                  label="Q5-Q1 Spread"
                  value={fmtSpread(row.full_q5q1_spread_ann)}
                  sub="annualised"
                  color={(row.full_q5q1_spread_ann ?? 0) * row.direction > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard label="Monotonicity" value={fmtMono(row.full_monotonicity)} sub="% months Q5 > Q1" />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                <span className="text-sm font-bold text-sky-700 uppercase tracking-wider">Within Sector</span>
                <QBadge q={row.ws_signal_quality} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmtIC(row.ws_mean_ic)}
                  sub={`t = ${fmtTStat(row.ws_ic_tstat)}`}
                  highlight={(row.ws_ic_tstat ?? 0) > 1.65}
                  color={(row.ws_mean_ic ?? 0) * row.direction > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard
                  label="t-Statistic"
                  value={fmtTStat(row.ws_ic_tstat)}
                  sub={`p = ${row.ws_ic_pvalue?.toFixed(3) ?? '-'}`}
                  highlight={(row.ws_ic_tstat ?? 0) > 1.65}
                />
                <StatCard
                  label="Q5-Q1 Spread"
                  value={fmtSpread(row.ws_q5q1_spread_ann)}
                  sub="annualised"
                  color={(row.ws_q5q1_spread_ann ?? 0) * row.direction > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard label="Monotonicity" value={fmtMono(row.ws_monotonicity)} sub="% months Q5 > Q1" />
              </div>
            </div>
          </div>

          {row.full_mean_ic != null && row.ws_mean_ic != null && (
            <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Sector normalisation effect: </span>
                Within-sector IC is{' '}
                {Math.abs(row.ws_mean_ic) > Math.abs(row.full_mean_ic) ? (
                  <span className="text-emerald-600 font-semibold">stronger</span>
                ) : (
                  <span className="text-amber-600 font-semibold">weaker</span>
                )}{' '}
                than full-universe IC (Delta = {fmtIC(row.ws_mean_ic - row.full_mean_ic)}).{' '}
                {Math.abs(row.ws_mean_ic) > Math.abs(row.full_mean_ic)
                  ? "The factor's predictive power is amplified when controlled for sector effects — a good sign for the sector-by-sector RF model."
                  : 'The factor predicts better across sectors than within them — cross-sector dispersion is part of the signal.'}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100" />

        <div>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Quintile Cumulative Returns</h3>
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
              {VIEW_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === key
                      ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                      : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">Loading factor data...</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-500">Failed to load factor detail data.</p>
            </div>
          )}
          {data && (
            <>
              {viewMode === 'side-by-side' && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <QuintileReturnChart data={data.quintile_returns_full} title="Full Universe" />
                  <QuintileReturnChart data={data.quintile_returns_within} title="Within Sector" />
                </div>
              )}
              {viewMode === 'full' && <QuintileReturnChart data={data.quintile_returns_full} title="Full Universe" />}
              {viewMode === 'within' && <QuintileReturnChart data={data.quintile_returns_within} title="Within Sector" />}
            </>
          )}
        </div>

        <div className="border-t border-slate-100" />

        <div>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-5">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Rolling 24-Month IC</h3>
            <p className="text-xs text-slate-400">
              Both universes overlaid — divergence reveals where sector normalisation adds or removes predictive power
            </p>
          </div>
          {isLoading && (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">Loading IC series...</p>
            </div>
          )}
          {data && <RollingICChart data={data.ic_series} direction={row.direction} />}
        </div>
      </CardContent>
    </Card>
  );
}
