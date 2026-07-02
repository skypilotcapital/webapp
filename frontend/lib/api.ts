// Typed fetch functions for all Panel 1 endpoints.
//
// In production (Vercel), requests go to /api-proxy/... which Next.js rewrites
// to the droplet via server-side proxy — avoids mixed content (HTTPS→HTTP) issues.
//
// In local dev, NEXT_PUBLIC_API_BASE defaults to empty string so requests go to
// /api-proxy/... and are proxied via next.config.ts rewrites to localhost:8000.

import type {
  TableStatus,
  RunLogEntry,
  TableGap,
  FactorCoverage,
  P01ScorecardRow,
  P01FactorDetail,
  ModelScorecardRow,
  ModelICPoint,
  ModelQuintilePoint,
  ModelSignalStability,
  ModelFeatureImportance,
  ModelSectorSummary,
  ModelFeatureImportanceBySector,
  ModelICCorrelationEntry,
  BacktestSummary,
  BacktestMonthlyReturn,
} from '@/types/api';
import type {
  LatestState,
  TimelinePoint,
  ComponentHistoryPoint,
  EpisodeRow,
  StatRow,
  DialSim,
  MacroBetaHealthV2,
} from '@/types/macroBeta';

const API_BASE = '/api-proxy';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const fetchTableStatus   = () => apiFetch<TableStatus[]>('/api/v1/data-monitor/table-status');
export const fetchRunLog        = () => apiFetch<RunLogEntry[]>('/api/v1/data-monitor/run-log');
export const fetchGapDetection  = () => apiFetch<TableGap[]>('/api/v1/data-monitor/gap-detection');
export const fetchFactorCoverage = () => apiFetch<FactorCoverage>('/api/v1/data-monitor/factor-coverage');
// Macro Beta Signal v1.5 (two-state defense/normal)
export const fetchMacroBetaLatest = () => apiFetch<LatestState>('/api/v1/macro-beta/latest');
export const fetchMacroBetaTimeline = () => apiFetch<TimelinePoint[]>('/api/v1/macro-beta/timeline');
export const fetchMacroBetaComponentsHistory = (months = 24) =>
  apiFetch<ComponentHistoryPoint[]>(`/api/v1/macro-beta/components-history?months=${months}`);
export const fetchMacroBetaEpisodes = () => apiFetch<EpisodeRow[]>('/api/v1/macro-beta/episodes');
export const fetchMacroBetaStats = () => apiFetch<StatRow[]>('/api/v1/macro-beta/stats');
export const fetchMacroBetaDialSim = () => apiFetch<DialSim[]>('/api/v1/macro-beta/dial-sim');
export const fetchMacroBetaHealth = () => apiFetch<MacroBetaHealthV2>('/api/v1/macro-beta/health');

// P01 Factor Quintile Analysis
export const fetchP01Scorecard = (universe = 'sp500') =>
  apiFetch<P01ScorecardRow[]>(`/api/v1/research/p01/scorecard?universe=${encodeURIComponent(universe)}`);
export const fetchP01FactorDetail = (factor: string, universe = 'sp500') =>
  apiFetch<P01FactorDetail>(`/api/v1/research/p01/factor/${encodeURIComponent(factor)}/detail?universe=${encodeURIComponent(universe)}`);

// Alpha Model Results
export const fetchModelScorecard = (universe = 'sp500') =>
  apiFetch<ModelScorecardRow[]>(`/api/v1/research/models/scorecard?universe=${encodeURIComponent(universe)}`);
export const fetchModelICSeries = (modelId: string, sector = 'ALL') =>
  apiFetch<ModelICPoint[]>(`/api/v1/research/models/${modelId}/ic?sector=${encodeURIComponent(sector)}`);
export const fetchModelQuintiles = (modelId: string, sector = 'ALL') =>
  apiFetch<ModelQuintilePoint[]>(`/api/v1/research/models/${modelId}/quintiles?sector=${encodeURIComponent(sector)}`);
export const fetchModelSignalStability = (modelId: string) =>
  apiFetch<ModelSignalStability[]>(`/api/v1/research/models/${modelId}/stability`);
export const fetchModelFeatureImportance = (modelId: string) =>
  apiFetch<ModelFeatureImportance[]>(`/api/v1/research/models/${modelId}/feature-importance`);
export const fetchModelSectorSummary = (modelId: string) =>
  apiFetch<ModelSectorSummary[]>(`/api/v1/research/models/${modelId}/sector-summary`);
export const fetchModelFeatureImportanceBySector = (modelId: string, sector: string) =>
  apiFetch<ModelFeatureImportanceBySector[]>(
    `/api/v1/research/models/${modelId}/feature-importance-by-sector?sector=${encodeURIComponent(sector)}`
  );

export const fetchModelICCorrelation = () =>
  apiFetch<ModelICCorrelationEntry[]>('/api/v1/research/models/ic-correlation');

// Reports library
export const fetchReports = () => apiFetch<unknown[]>('/api/v1/reports');

// Portfolio Backtests
export const fetchBacktestSummaries = () =>
  apiFetch<BacktestSummary[]>('/api/v1/portfolio/backtests');
export const fetchBacktestReturns = (label: string) =>
  apiFetch<BacktestMonthlyReturn[]>(`/api/v1/portfolio/backtests/${encodeURIComponent(label)}/returns`);
