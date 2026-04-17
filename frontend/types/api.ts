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
  factor_family: 'Momentum' | 'Quality' | 'Valuation' | 'Growth' | 'Risk';
  direction: 1 | -1;
  n_months: number;
  date_from: string | null;
  date_to: string | null;
  // Full-universe stats
  full_mean_ic: number | null;
  full_ic_std: number | null;
  full_ic_tstat: number | null;
  full_ic_pvalue: number | null;
  full_q5q1_spread_ann: number | null;
  full_monotonicity: number | null;
  full_signal_quality: 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;
  // Within-sector stats
  ws_mean_ic: number | null;
  ws_ic_std: number | null;
  ws_ic_tstat: number | null;
  ws_ic_pvalue: number | null;
  ws_q5q1_spread_ann: number | null;
  ws_monotonicity: number | null;
  ws_signal_quality: 'Strong' | 'Moderate' | 'Weak' | 'Investigate' | null;
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
