'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelICSeries, fetchModelQuintiles, fetchModelSignalStability, fetchModelFeatureImportance, fetchModelSectorSummary, fetchModelFeatureImportanceBySector } from '@/lib/api';
import type { ModelScorecardRow, ModelSignalStability, ModelFeatureImportance, ModelFeatureImportanceBySector, ModelICPoint, ModelSectorSummary } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ModelRollingICChart } from './ModelRollingICChart';
import { ModelQuintileChart } from './ModelQuintileChart';

// key = exact sector name stored in DB; label = display name on button
const SECTORS: { key: string; label: string }[] = [
  { key: 'ALL',                    label: 'ALL' },
  { key: 'Technology',             label: 'Technology' },
  { key: 'Financial Services',     label: 'Financials' },
  { key: 'Healthcare',             label: 'Health Care' },
  { key: 'Industrials',            label: 'Industrials' },
  { key: 'Consumer Cyclical',      label: 'Consumer Disc.' },
  { key: 'Consumer Defensive',     label: 'Consumer Staples' },
  { key: 'Energy',                 label: 'Energy' },
  { key: 'Basic Materials',        label: 'Materials' },
  { key: 'Communication Services', label: 'Comm. Services' },
  { key: 'Real Estate',            label: 'Real Estate' },
  { key: 'Utilities',              label: 'Utilities' },
];

const TARGET_LABEL: Record<string, string> = {
  fwd_1w: '1-Week Forward Return',
  fwd_1m: '1-Month Forward Return',
  fwd_2m: '2-Month Forward Return',
  fwd_3m: '3-Month Forward Return',
};

interface StatCardProps {
  label: string;
  value: string | null;
  sub?: string;
  highlight?: boolean;
  color?: string;
}

function StatCard({ label, value, sub, highlight, color }: StatCardProps) {
  return (
    <div className={`rounded-xl p-3.5 border ${highlight ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
      <p className="text-xs uppercase tracking-[0.15em] text-slate-400 font-bold mb-1">{label}</p>
      <p className={`text-xl font-black ${color ?? 'text-slate-800'}`}>{value ?? '—'}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmt(v: number | null, decimals = 4, pct = false): string | null {
  if (v == null) return null;
  const val = pct ? v * 100 : v;
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${val.toFixed(decimals)}${pct ? '%' : ''}`;
}

interface ModelDetailPanelProps {
  row: ModelScorecardRow;
  sectorStickyTop?: number;
}

function pct(v: number | null, decimals = 1) {
  return v != null ? `${(v * 100).toFixed(decimals)}%` : '—';
}

function StabilitySection({ stability }: { stability: ModelSignalStability | undefined }) {
  if (!stability) return null;
  const { rank_autocorr, q1_persistence, q5_persistence, avg_persistence, n_pairs } = stability;
  return (
    <div>
      <div className="border-t border-slate-100 my-8" />
      <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">Signal Stability (Universe)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Rank Autocorr"
          value={rank_autocorr?.toFixed(3) ?? null}
          sub="score_t vs score_{t+1}"
          highlight={(rank_autocorr ?? 0) > 0.6}
          color={(rank_autocorr ?? 0) > 0.5 ? 'text-emerald-700' : 'text-amber-600'}
        />
        <StatCard
          label="Avg Quintile Persistence"
          value={pct(avg_persistence)}
          sub="P(same quintile next month)"
          highlight={(avg_persistence ?? 0) > 0.35}
        />
        <StatCard
          label="Q5 Persistence"
          value={pct(q5_persistence)}
          sub="top quintile stays top"
          color={(q5_persistence ?? 0) > 0.35 ? 'text-emerald-700' : 'text-amber-600'}
        />
        <StatCard
          label="Q1 Persistence"
          value={pct(q1_persistence)}
          sub="bottom quintile stays bottom"
          color={(q1_persistence ?? 0) > 0.35 ? 'text-emerald-700' : 'text-amber-600'}
        />
      </div>
      {n_pairs != null && (
        <p className="text-xs text-slate-400 mt-2">
          Based on {n_pairs.toLocaleString()} consecutive-month stock pairs.
          Random walk baseline: avg persistence ≈ 20%, rank autocorr ≈ 0.
        </p>
      )}
    </div>
  );
}

function SectorBreakdownTable({ sectors }: { sectors: ModelSectorSummary[] }) {
  if (sectors.length === 0) return null;
  return (
    <div>
      <div className="border-t border-slate-100 my-8" />
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">IC Dispersion by Sector</h3>
        <p className="text-xs text-slate-400">Mean IC · Std IC · ICIR = mean/std · t-stat · Hit Rate</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-1.5 pr-4 text-slate-400 font-semibold uppercase tracking-wider w-36">Sector</th>
              <th className="text-right py-1.5 px-3 text-slate-400 font-semibold uppercase tracking-wider">N</th>
              <th className="text-right py-1.5 px-3 text-slate-400 font-semibold uppercase tracking-wider">Mean IC</th>
              <th className="text-right py-1.5 px-3 text-slate-400 font-semibold uppercase tracking-wider">Std IC</th>
              <th className="text-right py-1.5 px-3 text-slate-400 font-semibold uppercase tracking-wider">ICIR</th>
              <th className="text-right py-1.5 px-3 text-slate-400 font-semibold uppercase tracking-wider">t-stat</th>
              <th className="text-right py-1.5 pl-3 text-slate-400 font-semibold uppercase tracking-wider">Hit%</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const tAbs = Math.abs(s.tstat ?? 0);
              const tColor = tAbs >= 2 ? 'text-emerald-700 font-bold' : tAbs >= 1 ? 'text-amber-600' : 'text-slate-400';
              const icColor = (s.mean_ic ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-500';
              const icirColor = (s.icir ?? 0) >= 0.5 ? 'text-emerald-600' : (s.icir ?? 0) >= 0 ? 'text-slate-600' : 'text-red-500';
              return (
                <tr key={s.sector} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="py-1.5 pr-4 text-slate-600 font-sans">{s.sector}</td>
                  <td className="py-1.5 px-3 text-right text-slate-400">{s.n_months ?? '—'}</td>
                  <td className={`py-1.5 px-3 text-right ${icColor}`}>
                    {s.mean_ic != null ? `${s.mean_ic >= 0 ? '+' : ''}${s.mean_ic.toFixed(4)}` : '—'}
                  </td>
                  <td className="py-1.5 px-3 text-right text-slate-500">
                    {s.std_ic != null ? s.std_ic.toFixed(4) : '—'}
                  </td>
                  <td className={`py-1.5 px-3 text-right ${icirColor}`}>
                    {s.icir != null ? `${s.icir >= 0 ? '+' : ''}${s.icir.toFixed(2)}` : '—'}
                  </td>
                  <td className={`py-1.5 px-3 text-right ${tColor}`}>
                    {s.tstat != null ? `${s.tstat >= 0 ? '+' : ''}${s.tstat.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-slate-500">
                    {s.hit_rate != null ? `${(s.hit_rate * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2">
        Rows sorted by t-stat (descending). Green t-stat = |t| ≥ 2. ICIR = mean IC ÷ std IC (Sharpe of IC stream).
        Low ICIR despite positive mean IC indicates high within-sector IC volatility — a signal that GICS grouping may be adding noise.
      </p>
    </div>
  );
}

function FeatureImportanceSection({
  features,
  sectorLabel,
}: {
  features: ModelFeatureImportance[] | ModelFeatureImportanceBySector[];
  sectorLabel: string;
}) {
  if (features.length === 0) return null;
  const top20 = features.slice(0, 20);
  const maxShap = Math.max(...top20.map((f) => f.mean_shap ?? 0));
  return (
    <div>
      <div className="border-t border-slate-100 my-8" />
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">
          Feature Importance (Top 20) — {sectorLabel}
        </h3>
        <p className="text-xs text-slate-400">Mean |SHAP| · bar = relative contribution</p>
      </div>
      <div className="mb-4 rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-xs text-slate-500 space-y-2">
        <p>
          <strong className="text-slate-700">Mean |SHAP|</strong> (indigo bar) — average absolute SHAP value across all stocks and
          months. Measures how much each feature shifts the model&apos;s predicted return on average. Higher = more influential.
          SHAP accounts for feature interactions and is the most reliable importance metric.
        </p>
        <p>
          <strong className="text-slate-700">Gini / MDI</strong> (grey bar, relative) — Mean Decrease in Impurity: how often
          this feature is used to split trees in the Random Forest, weighted by impurity reduction. Faster to compute but
          biased toward high-cardinality features. When SHAP and Gini agree on a feature&apos;s rank, confidence is higher
          that the feature is genuinely important.
        </p>
        <p className="text-slate-400 italic">
          Selecting a sector above updates this chart to show importance for the sector-specific sub-model trained on
          that sector only.
        </p>
      </div>
      <div className="space-y-1.5">
        {top20.map((f) => {
          const shapPct = maxShap > 0 ? ((f.mean_shap ?? 0) / maxShap) * 100 : 0;
          const giniPct = maxShap > 0 ? ((f.mean_gini ?? 0) / (top20[0].mean_gini ?? 1)) * 100 : 0;
          return (
            <div key={f.feature} className="flex items-center gap-3 text-xs">
              <span className="w-6 text-right text-slate-400 font-mono shrink-0">{f.shap_rank}</span>
              <span className="w-40 truncate text-slate-600 font-mono shrink-0">{f.feature}</span>
              <div className="flex-1 relative h-5 bg-slate-50 rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-indigo-400/70 rounded"
                  style={{ width: `${shapPct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-slate-300/50 rounded"
                  style={{ width: `${giniPct * 0.3}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono text-slate-500 shrink-0">
                {f.mean_shap?.toExponential(2) ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-6 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded bg-indigo-400/70" />
          <span>Mean |SHAP|</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded bg-slate-300/50" />
          <span>Gini (MDI, relative)</span>
        </div>
      </div>
    </div>
  );
}

function computeSectorStats(points: ModelICPoint[]) {
  const ics = points.map((p) => p.ic).filter((v): v is number => v != null && !isNaN(v));
  if (ics.length < 2) return null;
  const n = ics.length;
  const mean = ics.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(ics.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const tstat = std > 0 ? mean / (std / Math.sqrt(n)) : 0;
  const hitRate = ics.filter((v) => v > 0).length / n;
  return { mean, tstat, hitRate, n };
}

export function ModelDetailPanel({ row, sectorStickyTop }: ModelDetailPanelProps) {
  const [sector, setSector] = useState('ALL'); // DB key, not display label

  const { data: icData, error: icError, isLoading: icLoading } = useSWR(
    `model-ic-${row.model_id}-${sector}`,
    () => fetchModelICSeries(row.model_id, sector),
    { revalidateOnFocus: false }
  );

  const { data: qData, error: qError, isLoading: qLoading } = useSWR(
    `model-quintiles-${row.model_id}-${sector}`,
    () => fetchModelQuintiles(row.model_id, sector),
    { revalidateOnFocus: false }
  );

  const { data: stabilityData } = useSWR(
    `model-stability-${row.model_id}`,
    () => fetchModelSignalStability(row.model_id),
    { revalidateOnFocus: false }
  );

  const { data: importanceData } = useSWR(
    `model-importance-${row.model_id}`,
    () => fetchModelFeatureImportance(row.model_id),
    { revalidateOnFocus: false }
  );

  const { data: sectorSummaryData } = useSWR(
    `model-sector-summary-${row.model_id}`,
    () => fetchModelSectorSummary(row.model_id),
    { revalidateOnFocus: false }
  );

  const { data: sectorImportanceData } = useSWR(
    sector !== 'ALL' ? `model-importance-by-sector-${row.model_id}-${sector}` : null,
    () => fetchModelFeatureImportanceBySector(row.model_id, sector),
    { revalidateOnFocus: false }
  );

  const allStability = stabilityData?.find((s) => s.sector === 'ALL');
  const isLoading = icLoading || qLoading;
  const hasError = icError || qError;

  // Sector stats: precomputed aggregate when ALL, computed from icData when specific sector
  const isAllSector = sector === 'ALL';
  const sectorLabel = SECTORS.find((s) => s.key === sector)?.label ?? sector;
  const liveSectorStats = !isAllSector && icData ? computeSectorStats(icData) : null;

  const sectorMeanIC    = isAllSector ? row.sector_mean_ic    : (liveSectorStats?.mean ?? null);
  const sectorTstat     = isAllSector ? row.sector_ic_tstat   : (liveSectorStats?.tstat ?? null);
  const sectorHitRate   = isAllSector ? row.sector_ic_hit_rate : (liveSectorStats?.hitRate ?? null);

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-lg font-black text-indigo-700 bg-indigo-100 px-3 py-1 rounded-lg">
                {row.model_id}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">
                {row.model_type}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold">
                {TARGET_LABEL[row.target] ?? row.target}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-2 font-medium">{row.description}</p>
            <p className="text-xs text-slate-400 mt-1">
              {row.n_months} months · {row.backtest_start} → {row.backtest_end}
              {row.feature_count != null && ` · ${row.feature_count} features (${row.feature_set})`}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* Sector selector — sticky so it stays visible when scrolling through charts */}
        <div
          className="sticky z-30 -mx-6 px-6 py-3 bg-white/95 backdrop-blur-sm border-b border-slate-100"
          style={{ top: `${sectorStickyTop ?? 92}px` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Sector View</h3>
            <div className="flex flex-wrap gap-1">
              {SECTORS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSector(s.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    sector === s.key
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Stats — Full Universe fixed, Sector IC responds to selection */}
        <div>
          <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold mb-4">Backtest Performance</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Full Universe — always fixed */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                <span className="text-sm font-bold text-indigo-700 uppercase tracking-wider">Full Universe</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmt(row.univ_mean_ic, 4)}
                  sub={`t = ${row.univ_ic_tstat?.toFixed(2) ?? '—'}`}
                  highlight={(row.univ_ic_tstat ?? 0) > 2}
                  color={(row.univ_mean_ic ?? 0) > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard
                  label="t-Statistic"
                  value={row.univ_ic_tstat?.toFixed(2) ?? null}
                  highlight={(row.univ_ic_tstat ?? 0) > 2}
                />
                <StatCard
                  label="Hit Rate"
                  value={row.univ_ic_hit_rate != null ? `${(row.univ_ic_hit_rate * 100).toFixed(1)}%` : null}
                  sub="months IC > 0"
                />
                <StatCard
                  label="Q5−Q1 Ann."
                  value={fmt(row.q5_minus_q1_ann, 1, true)}
                  sub="annualised spread"
                  color={(row.q5_minus_q1_ann ?? 0) > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
              </div>
            </div>

            {/* Sector IC — responds to sector selector */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                <span className="text-sm font-bold text-sky-700 uppercase tracking-wider">
                  {isAllSector ? 'Sector IC — avg across all sectors' : `Sector IC — ${sectorLabel}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmt(sectorMeanIC, 4)}
                  sub={sectorTstat != null ? `t = ${sectorTstat.toFixed(2)}` : undefined}
                  highlight={(sectorTstat ?? 0) > 2}
                  color={(sectorMeanIC ?? 0) > 0 ? 'text-emerald-700' : 'text-red-600'}
                />
                <StatCard
                  label="t-Statistic"
                  value={sectorTstat?.toFixed(2) ?? null}
                  highlight={(sectorTstat ?? 0) > 2}
                />
                <StatCard
                  label="Hit Rate"
                  value={sectorHitRate != null ? `${(sectorHitRate * 100).toFixed(1)}%` : null}
                  sub="months IC > 0"
                />
                <StatCard label="Feature Set" value={row.feature_set} sub={`${row.feature_count ?? '?'} features`} />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* Charts */}
        <div>
          {isLoading && (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center">
              <p className="text-sm text-slate-400">Loading {row.model_id} · {sectorLabel}…</p>
            </div>
          )}
          {hasError && !isLoading && (
            <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
              <p className="text-sm text-red-500">Failed to load model data. Run compute_research_tables.py first.</p>
            </div>
          )}
          {icData && !icLoading && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Rolling 12-Month IC</p>
                <ModelRollingICChart data={icData} sector={sector} />
              </div>
            </div>
          )}
        </div>

        {qData && !qLoading && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 mb-3">Quintile Cumulative Returns</p>
            <ModelQuintileChart data={qData} sector={sector} />
          </div>
        )}

        <StabilitySection stability={allStability} />

        {sectorSummaryData && sectorSummaryData.length > 0 && (
          <SectorBreakdownTable sectors={sectorSummaryData} />
        )}

        {(() => {
          const displayFeatures = sector !== 'ALL' && sectorImportanceData && sectorImportanceData.length > 0
            ? sectorImportanceData
            : importanceData;
          const label = sector !== 'ALL' ? sectorLabel : 'All Sectors';
          return displayFeatures && displayFeatures.length > 0
            ? <FeatureImportanceSection features={displayFeatures} sectorLabel={label} />
            : null;
        })()}
      </CardContent>
    </Card>
  );
}
