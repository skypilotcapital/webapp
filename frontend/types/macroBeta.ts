// Types for the Macro Beta Signal v1.5 API (two-state defense/normal model).

export interface ComponentReading {
  key: string;
  label: string;
  group: 'cycle' | 'fast';
  value: number | null;
  threshold: number | null;
  direction: 'bearish_above' | 'bearish_below';
  firing: boolean | null;
  detail?: string | null;
}

export interface LatestState {
  signal_date: string;
  final_state: 'defense' | 'normal';
  state_since: string | null;
  days_in_state: number | null;
  month_end_state: 'defense' | 'normal' | null;
  month_end_date: string | null;
  defense_reasons: string | null;
  cycle_result: string | null;
  trend_vote: string | null;
  labor_vote: string | null;
  inflation_vote: string | null;
  credit_latch_on: boolean;
  vol_gate_on: boolean;
  credit_force: boolean;
  correction_channel: boolean;
  components: ComponentReading[];
  model_version: string;
}

export interface TimelinePoint {
  date: string;
  state: 'defense' | 'normal';
  tr_level: number | null;
}

export type Universe = 'sp500' | 'smid';

export interface ComponentHistoryPoint {
  date: string;
  state: 'defense' | 'normal';
  trend_50_200_pct: number | null;
  trend_10m_pct: number | null;
  rv21_pct10y: number | null;
  credit_4_12_diff: number | null;
  claims_ratio_12m_low: number | null;
  sahm_gap: number | null;
  u3_vs_12mma: number | null;
  cpi_mom_z3m60m: number | null;
}

export interface EpisodeRow {
  peak_date: string;
  trough_date: string;
  recovered_date: string | null;
  depth: number;
  dd_days: number;
  defense_share: number | null;
  days_to_first_defense: number | null;
  recovery_days: number | null;
  recovery_defense_share: number | null;
  dd_threshold: number | null;
}

export interface SpellRow {
  start_date: string;
  end_date: string;
  days: number;
  ongoing: boolean;
  episode_overlap: number;
  verdict: 'episode' | 'partial' | 'false_alarm';
  mkt_return_during: number | null;
  mkt_xs_pp: number | null;
  entry_trigger: string | null;
}

export interface StatRow {
  window: string;
  metric: string;
  value: number | null;
}

export interface DialPoint {
  date: string;
  port_level: number;
  bench_level: number;
}

export interface DialSim {
  dial: number;
  stats: Record<string, number | null>;
  series: DialPoint[];
}

export interface HealthItemV2 {
  label: string;
  max_date: string | null;
  lag_days: number | null;
  status: string;
}

export interface RunStatusV2 {
  flow: string;
  step: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  rows_affected: number | null;
  error_msg: string | null;
}

export interface MacroBetaHealthV2 {
  freshness: HealthItemV2[];
  runs: RunStatusV2[];
}
