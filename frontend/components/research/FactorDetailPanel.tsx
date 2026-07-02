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

function StatInline({ label, value, sub, color }: StatCardProps) {
  return (
    <div className="flex flex-col items-start min-w-[56px]">
      <span className="text-[9px] uppercase tracking-[0.1em] text-[var(--tx-dim)] font-semibold">{label}</span>
      <span className={`text-sm font-bold tabular-nums leading-tight ${color ?? 'text-[var(--tx)]'}`}>{value ?? '—'}</span>
      {sub && <span className="text-[9px] text-[var(--tx-dim)]">{sub}</span>}
    </div>
  );
}

const QUALITY_BG: Record<string, string> = {
  Strong: 'bg-[rgba(52,211,153,0.14)] text-[var(--pos)]',
  Moderate: 'bg-[rgba(56,189,248,0.13)] text-[var(--cyan)]',
  Weak: 'bg-[rgba(251,191,36,0.13)] text-[var(--amber)]',
  Investigate: 'bg-[rgba(248,113,113,0.13)] text-[var(--neg)]',
};

function QBadge({ q }: { q: string | null }) {
  if (!q) return <span className="text-[var(--tx-dim)] text-xs">-</span>;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${QUALITY_BG[q] ?? 'bg-[var(--bg2)] text-[var(--tx-mut)]'}`}>
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
  universe?: string;
}

export function FactorDetailPanel({ row, universe = 'sp500' }: FactorDetailPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');

  const { data, error, isLoading } = useSWR(
    `p01-detail-${universe}-${row.factor}`,
    () => fetchP01FactorDetail(row.factor, universe),
    { revalidateOnFocus: false }
  );

  return (
    <Card className="border-[var(--border-soft)] bg-[var(--panel)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--tx)] tracking-tight">{row.factor_label}</h2>
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                  row.factor_family === 'Momentum'
                    ? 'bg-[rgba(167,139,250,0.14)] text-[#7c3aed]'
                    : row.factor_family === 'Technical'
                      ? 'bg-[rgba(192,132,252,0.14)] text-[#9333ea]'
                      : row.factor_family === 'Quality'
                        ? 'bg-[rgba(45,212,191,0.14)] text-[var(--teal)]'
                        : row.factor_family === 'Valuation'
                          ? 'bg-[rgba(56,189,248,0.14)] text-[var(--cyan)]'
                          : row.factor_family === 'Growth'
                            ? 'bg-[rgba(163,230,53,0.14)] text-[#4d7c0f]'
                            : row.factor_family === 'Macro'
                              ? 'bg-[rgba(45,212,191,0.13)] text-[var(--teal)]'
                              : 'bg-[rgba(251,146,60,0.14)] text-[#c2410c]'
                }`}
              >
                {row.factor_family}
              </span>
            </div>
            <p className="text-xs font-mono text-[var(--tx-dim)] mt-1">{row.factor}</p>
            <p className="text-xs text-[var(--tx-dim)] mt-1">
              {row.n_months} months · {row.date_from} {'->'} {row.date_to}
              {row.direction === -1 && <span className="ml-2 text-[var(--amber)] font-medium">↑ inverse factor (low = good)</span>}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div>
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold mb-2">Signal Statistics</h3>
          <div className="space-y-1.5">
            {/* Full Universe strip */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-[rgba(45,212,191,0.25)] bg-[rgba(45,212,191,0.06)] px-3 py-2">
              <div className="flex items-center gap-2 shrink-0 border-r border-[rgba(45,212,191,0.25)] pr-4 mr-1">
                <span className="w-2 h-2 rounded-full bg-[var(--teal)] shrink-0" />
                <span className="text-xs font-bold text-[var(--teal)] uppercase tracking-wider whitespace-nowrap">Full Universe</span>
                <QBadge q={row.full_signal_quality} />
              </div>
              <StatInline label="Mean IC" value={fmtIC(row.full_mean_ic)} color={(row.full_mean_ic ?? 0) * row.direction > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'} />
              <StatInline label="t-Stat" value={fmtTStat(row.full_ic_tstat)} sub={`p = ${row.full_ic_pvalue?.toFixed(3) ?? '-'}`} />
              <StatInline label="Q5−Q1" value={fmtSpread(row.full_q5q1_spread_ann)} sub="ann." color={(row.full_q5q1_spread_ann ?? 0) * row.direction > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'} />
              <StatInline label="Monoton." value={fmtMono(row.full_monotonicity)} sub="Q5 > Q1" />
            </div>
            {/* Within Sector strip */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-[rgba(56,189,248,0.25)] bg-[rgba(56,189,248,0.06)] px-3 py-2">
              <div className="flex items-center gap-2 shrink-0 border-r border-[rgba(56,189,248,0.25)] pr-4 mr-1">
                <span className="w-2 h-2 rounded-full bg-[var(--cyan)] shrink-0" />
                <span className="text-xs font-bold text-[var(--cyan)] uppercase tracking-wider whitespace-nowrap">Within Sector</span>
                <QBadge q={row.ws_signal_quality} />
              </div>
              <StatInline label="Mean IC" value={fmtIC(row.ws_mean_ic)} color={(row.ws_mean_ic ?? 0) * row.direction > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'} />
              <StatInline label="t-Stat" value={fmtTStat(row.ws_ic_tstat)} sub={`p = ${row.ws_ic_pvalue?.toFixed(3) ?? '-'}`} />
              <StatInline label="Q5−Q1" value={fmtSpread(row.ws_q5q1_spread_ann)} sub="ann." color={(row.ws_q5q1_spread_ann ?? 0) * row.direction > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'} />
              <StatInline label="Monoton." value={fmtMono(row.ws_monotonicity)} sub="Q5 > Q1" />
            </div>
          </div>

          {row.full_mean_ic != null && row.ws_mean_ic != null && (
            <div className="mt-2 rounded-lg bg-[var(--bg2)] border border-[var(--border-soft)] px-3 py-2">
              <p className="text-xs text-[var(--tx-mut)]">
                <span className="font-semibold text-[var(--tx)]">Sector normalisation: </span>
                Within-sector IC is{' '}
                {Math.abs(row.ws_mean_ic) > Math.abs(row.full_mean_ic) ? (
                  <span className="text-[var(--pos)] font-semibold">stronger</span>
                ) : (
                  <span className="text-[var(--amber)] font-semibold">weaker</span>
                )}{' '}
                than full-universe IC (Δ = {fmtIC(row.ws_mean_ic - row.full_mean_ic)}).{' '}
                {Math.abs(row.ws_mean_ic) > Math.abs(row.full_mean_ic)
                  ? "Amplified within-sector — good for the sector-by-sector RF model."
                  : 'Cross-sector dispersion is part of the signal.'}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-soft)]" />

        <div>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold">Quintile Cumulative Returns</h3>
            <div className="flex items-center rounded-xl border border-[var(--border-soft)] bg-[var(--bg2)] p-0.5 gap-0.5">
              {VIEW_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                    viewMode === key
                      ? 'bg-[var(--panel)] text-[var(--teal)] shadow-sm border border-[var(--border-soft)]'
                      : 'text-[var(--tx-dim)] hover:text-[var(--tx-mut)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-12 text-center">
              <p className="text-sm text-[var(--tx-dim)]">Loading factor data...</p>
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(248,113,113,0.10)] p-6 text-center">
              <p className="text-sm text-[var(--neg)]">Failed to load factor detail data.</p>
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

        <div className="border-t border-[var(--border-soft)]" />

        <div>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold">Rolling 24-Month IC</h3>
            <p className="text-xs text-[var(--tx-dim)]">
              Both universes overlaid — divergence reveals where sector normalisation adds or removes predictive power
            </p>
          </div>
          {isLoading && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-12 text-center">
              <p className="text-sm text-[var(--tx-dim)]">Loading IC series...</p>
            </div>
          )}
          {data && <RollingICChart data={data.ic_series} direction={row.direction} />}
        </div>
      </CardContent>
    </Card>
  );
}
