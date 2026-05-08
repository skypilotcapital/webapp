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
  LatestSignal,
  SignalHistoryPoint,
  ChartPoint,
  LatestInputs,
  RegimeRow,
  RegimeStats,
  MacroBetaHealth,
  MacroBetaComponents,
  P01ScorecardRow,
  P01FactorDetail,
  ModelScorecardRow,
  ModelICPoint,
  ModelQuintilePoint,
  ModelSignalStability,
  ModelFeatureImportance,
  ModelSectorSummary,
  ModelFeatureImportanceBySector,
} from '@/types/api';

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
export const fetchLatestMacroBetaSignal = () => apiFetch<LatestSignal>('/api/v1/macro-beta/latest-signal');
export const fetchMacroBetaHistory = () => apiFetch<SignalHistoryPoint[]>('/api/v1/macro-beta/history');
export const fetchMacroBetaChart = () => apiFetch<ChartPoint[]>('/api/v1/macro-beta/chart');
export const fetchMacroBetaLatestInputs = () => apiFetch<LatestInputs>('/api/v1/macro-beta/latest-inputs');
export const fetchMacroBetaRegimes = () => apiFetch<RegimeRow[]>('/api/v1/macro-beta/regimes');
export const fetchMacroBetaRegimeStats = () => apiFetch<RegimeStats[]>('/api/v1/macro-beta/regime-stats');
export const fetchMacroBetaHealth = () => apiFetch<MacroBetaHealth>('/api/v1/macro-beta/health');
export const fetchMacroBetaComponents = () => apiFetch<MacroBetaComponents>('/api/v1/macro-beta/components');

// P01 Factor Quintile Analysis
export const fetchP01Scorecard = () => apiFetch<P01ScorecardRow[]>('/api/v1/research/p01/scorecard');
export const fetchP01FactorDetail = (factor: string) =>
  apiFetch<P01FactorDetail>(`/api/v1/research/p01/factor/${encodeURIComponent(factor)}/detail`);

// Alpha Model Results
export const fetchModelScorecard = () => apiFetch<ModelScorecardRow[]>('/api/v1/research/models/scorecard');
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

// Reports library
export const fetchReports = () => apiFetch<unknown[]>('/api/v1/reports');
