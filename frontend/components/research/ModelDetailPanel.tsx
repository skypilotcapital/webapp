'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { fetchModelICSeries, fetchModelQuintiles, fetchModelSignalStability, fetchModelFeatureImportance, fetchModelSectorSummary, fetchModelFeatureImportanceBySector } from '@/lib/api';
import type { ModelScorecardRow, ModelSignalStability, ModelFeatureImportance, ModelFeatureImportanceBySector, ModelICPoint, ModelSectorSummary } from '@/types/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ModelRollingICChart } from './ModelRollingICChart';
import { ModelQuintileChart } from './ModelQuintileChart';
import { ModelSpreadChart } from './ModelSpreadChart';

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
  fwd_1m_sector_rel: '1-Month Sector-Relative Return',
  fwd_1m_sector_rank: '1-Month Sector Rank-Normalized Return',
  fwd_1m_voladj_63d: '1-Month Volatility-Scaled Return',
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
    <div className={`rounded-lg p-2.5 border ${highlight ? 'bg-[rgba(45,212,191,0.10)] border-[var(--teal)]' : 'bg-[var(--bg2)] border-[var(--border-soft)]'}`}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--tx-dim)] font-bold mb-0.5">{label}</p>
      <p title={value ?? undefined} className={`text-lg font-black truncate ${color ?? 'text-[var(--tx)]'}`}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-[var(--tx-dim)] mt-0.5">{sub}</p>}
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
      <div className="border-t border-[var(--border-soft)] my-5" />
      <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold mb-2.5">Signal Stability (Universe)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Rank Autocorr"
          value={rank_autocorr?.toFixed(3) ?? null}
          sub="score_t vs score_{t+1}"
          highlight={(rank_autocorr ?? 0) > 0.6}
          color={(rank_autocorr ?? 0) > 0.5 ? 'text-[var(--pos)]' : 'text-[var(--amber)]'}
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
          color={(q5_persistence ?? 0) > 0.35 ? 'text-[var(--pos)]' : 'text-[var(--amber)]'}
        />
        <StatCard
          label="Q1 Persistence"
          value={pct(q1_persistence)}
          sub="bottom quintile stays bottom"
          color={(q1_persistence ?? 0) > 0.35 ? 'text-[var(--pos)]' : 'text-[var(--amber)]'}
        />
      </div>
      {n_pairs != null && (
        <p className="text-xs text-[var(--tx-dim)] mt-2">
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
      <div className="border-t border-[var(--border-soft)] my-5" />
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold">IC Dispersion by Sector</h3>
        <p className="text-xs text-[var(--tx-dim)]">Mean IC · Std IC · ICIR = mean/std · t-stat · Hit Rate</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-[var(--border-soft)]">
              <th className="text-left py-1.5 pr-4 text-[var(--tx-dim)] font-semibold uppercase tracking-wider w-36">Sector</th>
              <th className="text-right py-1.5 px-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">N</th>
              <th className="text-right py-1.5 px-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">Mean IC</th>
              <th className="text-right py-1.5 px-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">Std IC</th>
              <th className="text-right py-1.5 px-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">ICIR</th>
              <th className="text-right py-1.5 px-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">t-stat</th>
              <th className="text-right py-1.5 pl-3 text-[var(--tx-dim)] font-semibold uppercase tracking-wider">Hit%</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => {
              const tAbs = Math.abs(s.tstat ?? 0);
              const tColor = tAbs >= 2 ? 'text-[var(--pos)] font-bold' : tAbs >= 1 ? 'text-[var(--amber)]' : 'text-[var(--tx-dim)]';
              const icColor = (s.mean_ic ?? 0) >= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]';
              const icirColor = (s.icir ?? 0) >= 0.5 ? 'text-[var(--pos)]' : (s.icir ?? 0) >= 0 ? 'text-[var(--tx-mut)]' : 'text-[var(--neg)]';
              return (
                <tr key={s.sector} className="border-b border-[var(--border-soft)] hover:bg-[rgba(45,212,191,0.06)]">
                  <td className="py-1.5 pr-4 text-[var(--tx-mut)] font-sans">{s.sector}</td>
                  <td className="py-1.5 px-3 text-right text-[var(--tx-dim)]">{s.n_months ?? '—'}</td>
                  <td className={`py-1.5 px-3 text-right ${icColor}`}>
                    {s.mean_ic != null ? `${s.mean_ic >= 0 ? '+' : ''}${s.mean_ic.toFixed(4)}` : '—'}
                  </td>
                  <td className="py-1.5 px-3 text-right text-[var(--tx-mut)]">
                    {s.std_ic != null ? s.std_ic.toFixed(4) : '—'}
                  </td>
                  <td className={`py-1.5 px-3 text-right ${icirColor}`}>
                    {s.icir != null ? `${s.icir >= 0 ? '+' : ''}${s.icir.toFixed(2)}` : '—'}
                  </td>
                  <td className={`py-1.5 px-3 text-right ${tColor}`}>
                    {s.tstat != null ? `${s.tstat >= 0 ? '+' : ''}${s.tstat.toFixed(2)}` : '—'}
                  </td>
                  <td className="py-1.5 pl-3 text-right text-[var(--tx-mut)]">
                    {s.hit_rate != null ? `${(s.hit_rate * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--tx-dim)] mt-2">
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
      <div className="border-t border-[var(--border-soft)] my-5" />
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold">
          Feature Importance (Top 20) — {sectorLabel}
        </h3>
        <p className="text-xs text-[var(--tx-dim)]">Mean |SHAP| · bar = relative contribution</p>
      </div>
      <div className="mb-2.5 rounded-lg border border-[var(--border-soft)] bg-[var(--bg2)] px-4 py-3 text-xs text-[var(--tx-mut)] space-y-2">
        <p>
          <strong className="text-[var(--tx)]">Mean |SHAP|</strong> (teal bar) — average absolute SHAP value across all stocks and
          months. Measures how much each feature shifts the model&apos;s predicted return on average. Higher = more influential.
          SHAP accounts for feature interactions and is the most reliable importance metric.
        </p>
        <p>
          <strong className="text-[var(--tx)]">Gini / MDI</strong> (grey bar, relative) — Mean Decrease in Impurity: how often
          this feature is used to split trees in the Random Forest, weighted by impurity reduction. Faster to compute but
          biased toward high-cardinality features. When SHAP and Gini agree on a feature&apos;s rank, confidence is higher
          that the feature is genuinely important.
        </p>
        <p className="text-[var(--tx-dim)] italic">
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
              <span className="w-6 text-right text-[var(--tx-dim)] font-mono shrink-0">{f.shap_rank}</span>
              <span className="w-40 truncate text-[var(--tx-mut)] font-mono shrink-0">{f.feature}</span>
              <div className="flex-1 relative h-5 bg-[var(--bg2)] rounded overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-[rgba(45,212,191,0.7)] rounded"
                  style={{ width: `${shapPct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-[rgba(143,166,190,0.35)] rounded"
                  style={{ width: `${giniPct * 0.3}%` }}
                />
              </div>
              <span className="w-16 text-right font-mono text-[var(--tx-mut)] shrink-0">
                {f.mean_shap?.toExponential(2) ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-[var(--tx-dim)]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded bg-[rgba(45,212,191,0.7)]" />
          <span>Mean |SHAP|</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-3 rounded bg-[rgba(143,166,190,0.35)]" />
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

  const sectorMeanIC = isAllSector
    ? (row.sector_mean_ic_monthly ?? row.sector_mean_ic)
    : (liveSectorStats?.mean ?? null);
  const sectorTstat = isAllSector
    ? (row.sector_ic_tstat_monthly ?? row.sector_ic_tstat)
    : (liveSectorStats?.tstat ?? null);
  const sectorHitRate = isAllSector
    ? (row.sector_ic_hit_rate_monthly ?? row.sector_ic_hit_rate)
    : (liveSectorStats?.hitRate ?? null);
  const sectorPanelTstat = isAllSector ? row.sector_ic_tstat_panel : null;

  return (
    <Card className="border-[var(--teal)] bg-[var(--panel)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-base font-black text-[var(--teal)] bg-[rgba(45,212,191,0.13)] px-2.5 py-0.5 rounded-md">
                {row.model_id}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[var(--bg2)] text-[var(--tx-mut)] text-xs font-semibold">
                {row.model_type}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[rgba(56,189,248,0.13)] text-[var(--cyan)] text-xs font-semibold">
                {TARGET_LABEL[row.target] ?? row.target}
              </span>
            </div>
            <p className="text-[12px] text-[var(--tx-mut)] mt-1.5 font-medium">{row.description}</p>
            <p className="text-xs text-[var(--tx-dim)] mt-1">
              {row.n_months} months · {row.backtest_start} → {row.backtest_end}
              {row.feature_count != null && ` · ${row.feature_count} features (${row.feature_set})`}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Sector selector — sticky so it stays visible when scrolling through charts */}
        <div
          className="sticky z-30 -mx-5 px-5 py-2 bg-[var(--panel)] border-b border-[var(--border-soft)]"
          style={{ top: `${sectorStickyTop ?? 0}px` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold">Sector View</h3>
            <div className="flex flex-wrap gap-1">
              {SECTORS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSector(s.key)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                    sector === s.key
                      ? 'bg-[var(--teal)] text-[var(--bg)] shadow-sm'
                      : 'bg-[var(--bg2)] text-[var(--tx-mut)] hover:bg-[rgba(45,212,191,0.10)]'
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
          <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--tx-dim)] font-bold mb-2.5">Backtest Performance</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Full Universe — always fixed */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--teal)] shrink-0" />
                <span className="text-sm font-bold text-[var(--teal)] uppercase tracking-wider">Full Universe</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmt(row.univ_mean_ic, 4)}
                  sub={`t = ${row.univ_ic_tstat?.toFixed(2) ?? '—'}`}
                  highlight={(row.univ_ic_tstat ?? 0) > 2}
                  color={(row.univ_mean_ic ?? 0) > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}
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
                  color={(row.q5_minus_q1_ann ?? 0) > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}
                />
              </div>
            </div>

            {/* Sector IC — responds to sector selector */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--cyan)] shrink-0" />
                <span className="text-sm font-bold text-[var(--cyan)] uppercase tracking-wider">
                  {isAllSector ? 'Sector IC — monthly avg across all sectors' : `Sector IC — ${sectorLabel}`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard
                  label="Mean IC"
                  value={fmt(sectorMeanIC, 4)}
                  sub={
                    sectorTstat != null
                      ? isAllSector && sectorPanelTstat != null
                        ? `monthly t = ${sectorTstat.toFixed(2)} · panel t = ${sectorPanelTstat.toFixed(2)}`
                        : `t = ${sectorTstat.toFixed(2)}`
                      : undefined
                  }
                  highlight={(sectorTstat ?? 0) > 2}
                  color={(sectorMeanIC ?? 0) > 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}
                />
                <StatCard
                  label={isAllSector ? 'Monthly t-Stat' : 't-Statistic'}
                  value={sectorTstat?.toFixed(2) ?? null}
                  highlight={(sectorTstat ?? 0) > 2}
                  sub={isAllSector && sectorPanelTstat != null ? `panel = ${sectorPanelTstat.toFixed(2)}` : undefined}
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

        <div className="border-t border-[var(--border-soft)]" />

        {/* Charts */}
        <div>
          {isLoading && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--panel)] p-12 text-center">
              <p className="text-sm text-[var(--tx-dim)]">Loading {row.model_id} · {sectorLabel}…</p>
            </div>
          )}
          {hasError && !isLoading && (
            <div className="rounded-2xl border border-[var(--border-soft)] bg-[rgba(248,113,113,0.10)] p-6 text-center">
              <p className="text-sm text-[var(--neg)]">Failed to load model data. Run compute_research_tables.py first.</p>
            </div>
          )}
          {icData && !icLoading && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--tx-dim)] mb-3">Rolling 12-Month IC</p>
                <ModelRollingICChart data={icData} sector={sector} />
              </div>
            </div>
          )}
        </div>

        {qData && !qLoading && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--tx-dim)] mb-3">Quintile Cumulative Returns</p>
              <ModelQuintileChart data={qData} sector={sector} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--tx-dim)] mb-1">Rolling 24-Month Q5−Q1 Spread</p>
              <p className="text-xs text-[var(--tx-dim)] mb-3">
                How much the model&apos;s top vs. bottom quintile gap has varied over time — regime shifts visible as sustained positive or negative periods
              </p>
              <ModelSpreadChart data={qData} sector={sector} />
            </div>
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
