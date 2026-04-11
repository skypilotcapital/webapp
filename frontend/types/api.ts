// TypeScript interfaces — mirror the backend Pydantic response models exactly.
// If the backend shape changes, update here and TypeScript will flag every breakage.

export interface TableStatus {
  schema_name: string;
  table_name: string;
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
