// TypeScript interfaces — mirror the backend Pydantic response models exactly.
// If the backend shape changes, update here and TypeScript will flag every breakage.

export interface TableStatus {
  schema_name: string;
  table_name: string;
  description?: string;
  max_date: string | null;
  row_count: number;
  lag_days: number | null;
}

export interface RunLogEntry {
  flow: string;
  step: string;
  mode: string | null;
  status: 'running' | 'complete' | 'error';
  started_at: string;
  completed_at: string | null;
  rows_affected: number | null;
  error_msg: string | null;
}

export interface TableGap {
  schema_name: string;
  table_name: string;
  missing_dates: string[];
  gap_count: number;
}

export interface FactorCoverage {
  as_of_date: string | null;
  covered_count: number;
  universe_count: number;
  coverage_pct: number | null;
}

export interface LatestSignal {
  signal_date: string;
  final_beta_target: string;
  tier1_result: string | null;
  tier2_rsi: string | null;
  tier2_credit: string | null;
  sp500_50_200_spread_raw: number | null;
  sp500_50_200_spread_pct: number | null;
  pmi_3m12m_diff: number | null;
  cpi_mom_z3m60m: number | null;
  rsi_20: number | null;
  bbb_4_12_diff: number | null;
}

export interface SignalHistoryPoint {
  signal_date: string;
  final_beta_target: string;
  sp500_spot_date: string | null;
  sp500_spot_level: number | null;
  sp500_50_200_spread_pct: number | null;
  bbb_oas_bps: number | null;
}

export interface ChartPoint {
  signal_date: string;
  final_beta_target: string;
  sp500_spot_level: number | null;
  sp500_spot_ma50: number | null;
  sp500_spot_ma200: number | null;
}

export interface LatestInputs {
  signal_date: string;
  pmi_data_date: string | null;
  pmi_release_date: string | null;
  mfg_pmi: number | null;
  cpi_data_date: string | null;
  cpi_release_date: string | null;
  cpi_level: number | null;
  sp500_date: string | null;
  sp500_level: number | null;
  sp500_spot_date: string | null;
  sp500_spot_level: number | null;
  credit_date: string | null;
  bbb_oas_decimal: number | null;
  bbb_oas_bps: number | null;
}

export interface RegimeRow {
  final_beta_target: string;
  start_date: string;
  end_date: string;
  trading_days: number;
  sp500_total_return: number | null;
  sp500_annualized_return: number | null;
}

export interface RegimeStats {
  final_beta_target: string;
  regime_count: number;
  days_in_state: number;
  cumulative_return: number | null;
  annualized_return: number | null;
}

export interface HealthItem {
  label: string;
  max_date: string | null;
  lag_days: number | null;
  status: string;
}

export interface RunStatus {
  flow: string;
  step: string;
  status: 'running' | 'complete' | 'error' | string;
  started_at: string;
  completed_at: string | null;
  rows_affected: number | null;
  error_msg: string | null;
}

export interface MacroBetaHealth {
  freshness: HealthItem[];
  runs: RunStatus[];
}

export interface ComponentPoint {
  date: string;
  value: number | null;
}

export interface MacroBetaComponents {
  pmi: ComponentPoint[];
  cpi_yoy: ComponentPoint[];
  rsi: ComponentPoint[];
  bbb_oas_bps: ComponentPoint[];
}

// ---------------------------------------------------------------------------
// P01 Factor Quintile Analysis
// ---------------------------------------------------------------------------

export interface P01ScorecardRow {
  factor: string;
  factor_label: string;
  factor_family: 'Momentum' | 'Technical' | 'Quality' | 'Valuation' | 'Growth' | 'Risk' | 'Macro'
    | 'Ownership' | 'Insider' | 'ShortVol' | 'FTD' | 'Earnings';
  direction: 1 | -1;
  n_months: number;
  date_from: string | null;
  date_to: string | null;
  // Full-universe stats
  full_mean_ic: number | null;
  full_ic_std: number | null;
  full_ic_tstat: number | null;
  full_ic_pvalue: number | null;
  full_icir: number | null;
  full_q5q1_spread_ann: number | null;
  full_monotonicity: number | null;
  full_signal_quality: 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;
  full_q1_avg: number | null;
  full_q2_avg: number | null;
  full_q3_avg: number | null;
  full_q4_avg: number | null;
  full_q5_avg: number | null;
  // Within-sector stats
  ws_mean_ic: number | null;
  ws_ic_std: number | null;
  ws_ic_tstat: number | null;
  ws_ic_pvalue: number | null;
  ws_icir: number | null;
  ws_q5q1_spread_ann: number | null;
  ws_monotonicity: number | null;
  ws_signal_quality: 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;
  ws_q1_avg: number | null;
  ws_q2_avg: number | null;
  ws_q3_avg: number | null;
  ws_q4_avg: number | null;
  ws_q5_avg: number | null;
}

export interface P01ICPoint {
  date: string;
  ic_full: number | null;
  ic_within: number | null;
}

export interface P01QuintilePoint {
  date: string;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
  q5: number | null;
}

export interface P01FactorDetail {
  factor: string;
  ic_series: P01ICPoint[];
  quintile_returns_full: P01QuintilePoint[];
  quintile_returns_within: P01QuintilePoint[];
}

// ---------------------------------------------------------------------------
// Alpha Model Results
// ---------------------------------------------------------------------------

export interface ModelScorecardRow {
  model_id: string;
  description: string;
  target: string;
  feature_set: string;
  feature_count: number | null;
  model_type: string;
  backtest_start: string | null;
  backtest_end: string | null;
  n_months: number | null;
  sector_mean_ic: number | null;
  sector_ic_std: number | null;
  sector_ic_tstat: number | null;
  sector_ic_hit_rate: number | null;
  sector_mean_ic_monthly: number | null;
  sector_ic_std_monthly: number | null;
  sector_ic_tstat_monthly: number | null;
  sector_ic_hit_rate_monthly: number | null;
  sector_mean_ic_panel: number | null;
  sector_ic_std_panel: number | null;
  sector_ic_tstat_panel: number | null;
  sector_ic_hit_rate_panel: number | null;
  univ_mean_ic: number | null;
  univ_ic_std: number | null;
  univ_ic_tstat: number | null;
  univ_ic_hit_rate: number | null;
  q5_minus_q1_avg: number | null;
  q5_minus_q1_ann: number | null;
}

export interface ModelICPoint {
  date: string;
  sector: string;
  ic: number | null;
  rolling_12m_ic: number | null;
}

export interface ModelQuintilePoint {
  date: string;
  sector: string;
  quintile: number;
  fwd_return: number | null;
}

export interface ModelSignalStability {
  model_id: string;
  sector: string;
  rank_autocorr: number | null;
  q1_persistence: number | null;
  q5_persistence: number | null;
  avg_persistence: number | null;
  transition_matrix: number[][] | null;  // 5×5 nested array
  n_pairs: number | null;
}

export interface ModelFeatureImportance {
  model_id: string;
  feature: string;
  mean_gini: number | null;
  mean_shap: number | null;
  shap_rank: number | null;
}

export interface ModelSectorSummary {
  sector: string;
  n_months: number | null;
  mean_ic: number | null;
  std_ic: number | null;
  icir: number | null;
  tstat: number | null;
  hit_rate: number | null;
}

export interface ModelFeatureImportanceBySector {
  model_id: string;
  sector: string;
  feature: string;
  mean_gini: number | null;
  mean_shap: number | null;
  shap_rank: number | null;
}

export interface ModelICCorrelationEntry {
  model_a: string;
  model_b: string;
  ic_correlation: number | null;
  n_common_months: number | null;
}

// ---------------------------------------------------------------------------
// Portfolio Backtests
// ---------------------------------------------------------------------------

export interface BacktestSummary {
  label: string;
  period_start: string | null;
  period_end: string | null;
  n_months: number;
  ann_return_gross: number | null;
  ann_return_net: number | null;
  ann_return_benchmark: number | null;
  ann_excess_return: number | null;
  sharpe_gross: number | null;
  sharpe_net: number | null;
  information_ratio: number | null;
  tracking_error: number | null;
  max_drawdown: number | null;
  ann_volatility: number | null;
  hit_rate: number | null;
  avg_monthly_turnover: number | null;
  avg_tc_drag_bps: number | null;
  n_optimal: number;
  n_fallback: number;
}

export interface BacktestMonthlyReturn {
  date: string;
  portfolio_gross: number | null;
  portfolio_net: number | null;
  benchmark: number | null;
  active_return: number | null;
  turnover: number | null;
  tc_cost: number | null;
  n_stocks: number | null;
  optimizer_status: string | null;
  cum_portfolio: number | null;
  cum_benchmark: number | null;
}

// ---------------------------------------------------------------------------
// Portfolio (Layer-2) Research Hub — registry-backed (portfolio.backtest_meta + summary)
// ---------------------------------------------------------------------------

export type Universe = 'sp500' | 'r2500';
export type Strategy = 'long_only' | 'long_short';
export type Variant = 'bare' | 'base' | 'hard';

export interface PortfolioBacktest {
  model_label: string;
  signal_model_id: string | null;
  universe: string | null;
  strategy: string | null;
  experiment: string | null;   // prod | sweep | sector | te | phase5 | ls | legacy
  variant: string | null;      // bare | base | hard
  lambda_risk: number | null;
  te_target: number | null;
  sector_tol: number | null;
  turnover_cap: number | null;
  benchmark_report: string | null;
  is_hard: boolean | null;
  is_production: boolean | null;
  is_legacy: boolean | null;
  ab_twin: string | null;
  n_months: number | null;
  period_start: string | null;
  period_end: string | null;
  ann_active: number | null;
  ann_total_net: number | null;
  ir: number | null;
  sharpe_net: number | null;
  realized_te: number | null;
  pred_te: number | null;
  max_drawdown: number | null;
  avg_turnover: number | null;
  tc_drag_bps: number | null;
  avg_holdings: number | null;
  opt_pct: number | null;
  inacc_pct: number | null;
  held_pct: number | null;
  hit_rate: number | null;
  // collateral-credited convention (L/S only; null for long-only) — single source for grid + report
  avg_rf_ann: number | null;
  ann_credited: number | null;          // excess over cash, credited (the alpha)
  ann_total_credited: number | null;    // total return incl. cash on collateral
  ir_credited: number | null;
}

export interface PortfolioMonthlyPoint {
  date: string;
  portfolio_net: number | null;
  benchmark: number | null;
  active_return: number | null;
  turnover: number | null;
  tc_cost: number | null;
  n_stocks: number | null;
  optimizer_status: string | null;
  cum_portfolio: number | null;   // base 100, net
  cum_benchmark: number | null;   // base 100
  drawdown: number | null;
}

export interface PortfolioDetail {
  meta: PortfolioBacktest;
  monthly: PortfolioMonthlyPoint[];
}

export interface PortfolioHolding {
  isin: string;
  name: string | null;
  ticker: string | null;
  sector: string | null;
  weight: number | null;
  prev_weight: number | null;
  trade_pct: number | null;
  benchmark_weight: number | null;   // cap-weight in the universe (long-only)
  active_weight: number | null;       // weight - benchmark_weight
}

export interface PortfolioSectorWeight {
  sector: string | null;
  weight: number | null;
  benchmark_weight: number | null;    // cap-weighted benchmark sector weight (long-only)
  active_weight: number | null;        // weight - benchmark_weight (over/underweight)
}

// ---- Factor attribution ----
export interface AttrSummaryRow {
  factor: string;                       // FACTOR_NAMES | 'specific' | 'total'
  factor_group: string | null;          // Market | Sector | Style | Specific | Total
  avg_active_exposure: number | null;
  ann_ret_contrib: number | null;       // annualized realized return contribution
  pct_active_return: number | null;     // share of total active return
  contrib_tstat: number | null;
  pct_active_variance: number | null;   // avg share of active variance (ex-ante)
  n_months: number | null;
}

export interface AttrExposure {
  factor: string;
  factor_group: string | null;
  active_exposure: number | null;
}

export interface PortfolioAttribution {
  summary: AttrSummaryRow[];
  latest_date: string | null;
  latest_exposures: AttrExposure[];
}

export interface AttrCumPoint {
  date: string;
  specific: number | null;
  market: number | null;
  sector: number | null;
  style: number | null;
  total: number | null;
}

// Net-of-cost return bridge: gross active − spread − impact − commission − borrow = net active.
export interface CostBridgeSummary {
  aum_musd: number | null;
  n_months: number | null;
  ann_gross_active: number | null;
  ann_spread_drag: number | null;
  ann_impact_drag: number | null;
  ann_commission_drag: number | null;
  ann_borrow_drag: number | null;
  ann_total_cost: number | null;
  ann_net_active: number | null;
  ir_gross: number | null;
  ir_net: number | null;
  avg_spread_bps: number | null;
  avg_impact_bps: number | null;
  avg_commission_bps: number | null;
  avg_eff_bps: number | null;
  avg_turnover: number | null;
  pct_gross_kept: number | null;
  avg_rf_ann: number | null;     // avg RF on collateral, annualized (L/S waterfall → total return)
}
export interface CostBridgePoint {
  date: string;
  cum_gross: number | null;
  cum_net: number | null;
  cum_cost: number | null;
}
export interface CostAttribution {
  summary: CostBridgeSummary;
  monthly: CostBridgePoint[];
}

// L/S contribution-by-source: raw legs (long/short/collateral) + beta-adjusted selection. `cost` is a
// positive drag (subtract it). Both the raw legs and the selection split reconcile to credited_tot.
export interface SourceAttrPoint {
  date: string;
  long_leg: number | null; short_leg: number | null;
  long_sel: number | null; short_sel: number | null; market: number | null;
  collateral: number | null; cost: number | null;
  gross_long: number | null; gross_short: number | null;
  credited_tot: number | null;
}
export interface SourceAttrSummary {
  n_months: number;
  long_leg: number | null; short_leg: number | null;
  long_sel: number | null; short_sel: number | null; market: number | null;
  collateral: number | null; cost: number | null; credited_tot: number | null;
  gross_long_avg: number | null; gross_short_avg: number | null;
}
export interface SourceAttribution {
  summary: SourceAttrSummary;
  monthly: SourceAttrPoint[];
}

// F2 — long-short neutrality (net dollar & net beta over time).
export interface NeutralityPoint { date: string; net_dollar: number | null; net_beta: number | null; }
export interface NeutralitySummary {
  n_months: number | null;
  avg_net_dollar: number | null;
  avg_net_beta: number | null;
  max_abs_net_beta: number | null;
}
export interface PortfolioNeutrality { summary: NeutralitySummary; monthly: NeutralityPoint[]; }

// T9 — collateral-credited investor return (long-short).
export interface CreditedSummary {
  n_months: number | null;
  haircut_bps: number | null;
  ann_net_active: number | null;
  ir_net_active: number | null;
  ann_credited: number | null;
  ir_credited: number | null;
  avg_rf_ann: number | null;
}
export interface CreditedPoint { date: string; cum_net_active: number | null; cum_credited: number | null; }
export interface PortfolioCreditedReturn { summary: CreditedSummary; monthly: CreditedPoint[]; }
