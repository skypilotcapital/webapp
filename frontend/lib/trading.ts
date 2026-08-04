// Trading — the operational surface ([10-RBAL] phase 1).
//
// Read-only. Every write in the design (approval, halt, run requests) lands in a later phase
// behind its own narrow DB role; nothing here posts.

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// The five states the ledger renders. FOUR of them are the §3.7 rule-(b) set — "not due yet"
// must not look like "ok", and neither may look like "failed" — plus two the build added because
// the honest answer was neither: `unbuilt` (nothing will ever write this until [10-P4] lands) and
// `no_record` (it demonstrably ran, before its telemetry existed).
export type StepState =
  | 'ok' | 'warn' | 'failed' | 'running' | 'awaiting' | 'not_due' | 'no_record' | 'unbuilt';

export interface ScheduledJob {
  unit: string; kind: 'systemd' | 'cron'; schedule: string;
  enabled: boolean; next_run: string | null; last_run: string | null; collected_at: string;
}

export interface LedgerStep {
  step: string; label: string; act: string; ord: number;
  mode: 'scheduled' | 'manual' | 'chained';
  manual_only: boolean;
  scheduled: ScheduledJob[] | null;
  chained: boolean;
  state: StepState;
  ran_at: string | null;
  detail: string | null;
  notes: string | null;
}

export interface LedgerRebalance {
  rebalance_id: number; strategy: string; signal_date: string; status: string;
  proposed_at: string | null; approved_by: string | null; approved_at: string | null;
  submitted_at: string | null;
}

export interface Ledger {
  env: string;
  rebalance: LedgerRebalance | null;
  steps: LedgerStep[];
  schedule_collected_at: string | null;
}

export interface RebalanceRow {
  rebalance_id: number; strategy: string; signal_date: string; status: string;
  sized_equity: number | null; proposed_at: string | null; approved_by: string | null;
  approved_at: string | null; submitted_at: string | null; closed_at: string | null;
  label: string | null; n_names: number; is_open: boolean;
}

export interface ReviewCheck {
  name: string; state: 'ok' | 'warn' | 'fail'; headline: string; detail: string[];
}

export interface Review {
  review_id: number; computed_at: string; computed_by: string | null;
  worst_state: 'ok' | 'warn' | 'fail';
  n_trades: number | null; gross_notional: number | null; pct_margin: number | null;
  checks: ReviewCheck[]; summary: string | null;
  is_stale: boolean; age_seconds: number;
}

export interface RebalanceDetail {
  env: string;
  header: {
    rebalance_id: number; strategy: string; signal_date: string; status: string;
    sized_equity: number | null; source: Record<string, unknown> | null; notes: string | null;
    proposed_at: string | null; approved_by: string | null; approved_at: string | null;
    submitted_at: string | null; closed_at: string | null;
  };
  events: { at: string; kind: string; from_status: string | null; to_status: string | null;
            actor: string | null; detail: string | null }[];
  orders: Record<string, number>;
}

export interface PlanRow {
  ticker: string; conid: number; weight: number; current_qty: number | null;
  target_qty: number | null; delta: number | null; side: string | null;
  planned_qty: number | null; ref_price: number | null; price: number | null;
  price_src: string | null; est_notional: number | null; dust_filtered: boolean;
  note: string | null; planned_at: string;
}

export interface PlanResponse {
  kind: 'preview' | 'final';
  plan: PlanRow[];
  summary: { n_rows: number; n_trades: number; n_buy: number; n_sell: number;
             n_dust: number; gross_notional: number };
}

export const fetchLedger = (env: string, rebalanceId?: number) =>
  get<Ledger>(`/api/v1/trading/${env}/ledger` +
    (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

export const fetchRebalances = (env: string) =>
  get<{ rebalances: RebalanceRow[] }>(`/api/v1/trading/${env}/rebalances`);

export const fetchRebalance = (env: string, id: number) =>
  get<RebalanceDetail>(`/api/v1/trading/${env}/rebalances/${id}`);

export const fetchReview = (env: string, id: number) =>
  get<{ review: Review | null }>(`/api/v1/trading/${env}/rebalances/${id}/review`);

// `kind` is explicit on purpose: preview (a rehearsal) and final (the contract the executor
// submits) are different objects, and a page that silently showed whichever existed would let an
// operator read rehearsal share counts as the ones about to be sent.
export const fetchPlan = (env: string, id: number, kind: 'preview' | 'final' = 'preview') =>
  get<PlanResponse>(`/api/v1/trading/${env}/rebalances/${id}/plan?kind=${kind}`);
