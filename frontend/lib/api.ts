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
  PortfolioBacktest,
  PortfolioDetail,
  PortfolioHolding,
  PortfolioSectorWeight,
  PortfolioAttribution,
  AttrCumPoint,
  CostAttribution,
  SourceAttribution,
  PortfolioNeutrality,
  PortfolioCreditedReturn,
  PortfolioDecomposition,
  PortfolioDeployment,
} from '@/types/api';
import type {
  LatestState,
  TimelinePoint,
  ComponentHistoryPoint,
  EpisodeRow,
  SpellRow,
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
// Macro Beta Signal (two-state defense/normal; universe = sp500 | smid)
export const fetchMacroBetaLatest = (universe = 'sp500') =>
  apiFetch<LatestState>(`/api/v1/macro-beta/latest?universe=${universe}`);
export const fetchMacroBetaTimeline = (universe = 'sp500') =>
  apiFetch<TimelinePoint[]>(`/api/v1/macro-beta/timeline?universe=${universe}`);
export const fetchMacroBetaComponentsHistory = (universe = 'sp500', months = 24) =>
  apiFetch<ComponentHistoryPoint[]>(
    `/api/v1/macro-beta/components-history?universe=${universe}&months=${months}`);
export const fetchMacroBetaEpisodes = (universe = 'sp500') =>
  apiFetch<EpisodeRow[]>(`/api/v1/macro-beta/episodes?universe=${universe}`);
export const fetchMacroBetaStats = (universe = 'sp500') =>
  apiFetch<StatRow[]>(`/api/v1/macro-beta/stats?universe=${universe}`);
export const fetchMacroBetaSpells = (universe = 'sp500') =>
  apiFetch<SpellRow[]>(`/api/v1/macro-beta/spells?universe=${universe}`);
export const fetchMacroBetaDialSim = (universe = 'sp500') =>
  apiFetch<DialSim[]>(`/api/v1/macro-beta/dial-sim?universe=${universe}`);
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

// Portfolio Backtests (LEGACY — old /backtests page; retired in the Research-Hub overhaul)
export const fetchBacktestSummaries = () =>
  apiFetch<BacktestSummary[]>('/api/v1/portfolio/backtests');
export const fetchBacktestReturns = (label: string) =>
  apiFetch<BacktestMonthlyReturn[]>(`/api/v1/portfolio/backtests/${encodeURIComponent(label)}/returns`);

// ---------------------------------------------------------------------------
// Portfolio (Layer-2) Research Hub — registry-backed
// ---------------------------------------------------------------------------
export interface PortfolioFilter {
  universe?: string; strategy?: string; variant?: string;
  experiment?: string; model?: string; includeLegacy?: boolean; production?: boolean;
}
export const fetchPortfolioBacktests = (f: PortfolioFilter = {}) => {
  const q = new URLSearchParams();
  if (f.universe) q.set('universe', f.universe);
  if (f.strategy) q.set('strategy', f.strategy);
  if (f.variant) q.set('variant', f.variant);
  if (f.experiment) q.set('experiment', f.experiment);
  if (f.model) q.set('model', f.model);
  if (f.includeLegacy) q.set('include_legacy', 'true');
  if (f.production) q.set('production', 'true');
  const qs = q.toString();
  return apiFetch<PortfolioBacktest[]>(`/api/v1/portfolio/backtests${qs ? `?${qs}` : ''}`);
};
export const fetchPortfolioDetail = (label: string) =>
  apiFetch<PortfolioDetail>(`/api/v1/portfolio/backtests/${encodeURIComponent(label)}`);
export const fetchPortfolioHoldings = (label: string, date?: string, limit = 600) =>
  apiFetch<PortfolioHolding[]>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/holdings?limit=${limit}${date ? `&date=${encodeURIComponent(date)}` : ''}`);
export const fetchPortfolioSectorAllocation = (label: string) =>
  apiFetch<PortfolioSectorWeight[]>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/sector-allocation`);
export const fetchPortfolioAttribution = (label: string) =>
  apiFetch<PortfolioAttribution>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/attribution`);
export const fetchPortfolioAttributionTimeseries = (label: string) =>
  apiFetch<AttrCumPoint[]>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/attribution/timeseries`);
export const fetchPortfolioCostAttribution = (label: string, aum = 5) =>
  apiFetch<CostAttribution>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/cost-attribution?aum=${aum}`);
export const fetchPortfolioSourceAttribution = (label: string) =>
  apiFetch<SourceAttribution>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/source-attribution`);
export const fetchPortfolioNeutrality = (label: string) =>
  apiFetch<PortfolioNeutrality>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/neutrality`);
export const fetchPortfolioCreditedReturn = (label: string, haircutBps = 50) =>
  apiFetch<PortfolioCreditedReturn>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/credited-return?haircut_bps=${haircutBps}`);
export const fetchPortfolioDecomposition = (label: string) =>
  apiFetch<PortfolioDecomposition>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/decomposition`);
export const fetchPortfolioDeployment = (label: string) =>
  apiFetch<PortfolioDeployment>(
    `/api/v1/portfolio/backtests/${encodeURIComponent(label)}/deployment`);
