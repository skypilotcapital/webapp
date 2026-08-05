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
  /** The CLI equivalent, with {id} already resolved. For execution this is not a fallback —
   *  it is the only way to run it (§3.10 auth boundary). */
  manual_cmd: string | null;
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

/** True when the deployment has approval credentials. False disables the control rather than
 *  letting a click fail — the same posture as the halt button. */
export interface ReviewResponse { review: Review | null; can_approve: boolean }

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
  get<ReviewResponse>(`/api/v1/trading/${env}/rebalances/${id}/review`);

// `kind` is explicit on purpose: preview (a rehearsal) and final (the contract the executor
// submits) are different objects, and a page that silently showed whichever existed would let an
// operator read rehearsal share counts as the ones about to be sent.
export const fetchPlan = (env: string, id: number, kind: 'preview' | 'final' = 'preview') =>
  get<PlanResponse>(`/api/v1/trading/${env}/rebalances/${id}/plan?kind=${kind}`);

export interface BlotterRow {
  ticker: string; conid: number; side: string; planned: number; plan_price: number | null;
  est_notional: number | null; coid: string | null; status: string | null;
  ibkr_order_id: string | null; submitted_qty: number | null; submitted_at: string | null;
  filled: number; avg_price: number | null; commission: number; n_fills: number;
  first_fill: string | null; last_fill: string | null;
  residual: number;
  /** Signed so POSITIVE always means worse for us. null where nothing filled — an avg price of
   *  0 is "no data", and running it through the formula prints a confident −10,000 bps. */
  slip_bps: number | null;
}

export interface Blotter {
  rows: BlotterRow[];
  rollup: {
    planned: number; submitted: number; filled: number; unfilled: number; partial: number;
    rejected: number; commission: number; est_cost: number; avg_slip_bps: number | null;
  };
  unexplained_fills: { coid: string; status: string; conid: number }[];
}

export const fetchBlotter = (env: string, id: number) =>
  get<Blotter>(`/api/v1/trading/${env}/rebalances/${id}/blotter`);

export interface HaltState {
  halted: boolean;
  active: { halt_id: number; rebalance_id: number | null; set_at: string; set_by: string;
            source: string; reason: string | null } | null;
  history: { halt_id: number; set_at: string; set_by: string; source: string;
             reason: string | null; cleared_at: string | null; cleared_by: string | null }[];
  /** False when the deployment has no halter credentials — the button disables rather than
   *  silently writing through the read role. */
  can_write: boolean;
  /** Always true: the file half of the switch lives on the droplet's disk and this API may be the
   *  very thing that is broken, so "not halted" here is never the whole truth. */
  file_flag_not_visible_here: boolean;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const fetchHaltState = (env: string, rebalanceId?: number) =>
  get<HaltState>(`/api/v1/trading/${env}/halt` +
    (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

export const postHalt = (env: string, by: string, reason: string, rebalanceId?: number) =>
  post(`/api/v1/trading/${env}/halt`, { by, reason, rebalance_id: rebalanceId ?? null });

export const clearHalt = (env: string, by: string, rebalanceId?: number) =>
  post(`/api/v1/trading/${env}/halt/clear`,
       { by, reason: 'cleared from the operations page', rebalance_id: rebalanceId ?? null });

export const approveRebalance = (env: string, id: number, by: string, reviewId: number) =>
  post(`/api/v1/trading/${env}/rebalances/${id}/approve`, { by, review_id: reviewId });

export interface RunRequestRow {
  request_id: number; rebalance_id: number | null; step: string; source: string;
  requested_by: string; requested_at: string;
  status: 'queued' | 'running' | 'ok' | 'warn' | 'failed' | 'cancelled';
  started_at: string | null; finished_at: string | null; result: string | null;
}

export const fetchRunRequests = (env: string, rebalanceId?: number) =>
  get<{ requests: RunRequestRow[]; can_request: boolean; can_execute: boolean;
        triggerable: string[] }>(
    `/api/v1/trading/${env}/run-requests` + (rebalanceId ? `?rebalance_id=${rebalanceId}` : ''));

// The website REQUESTS a step; it never runs one. Returns as soon as the intent is recorded.
export const requestRun = (env: string, step: string, by: string, rebalanceId?: number) =>
  post<{ request_id: number }>(`/api/v1/trading/${env}/run-requests`,
                               { step, by, rebalance_id: rebalanceId ?? null });

export interface ReadinessCheck {
  name: string; what: string; rows: number | null;
  /** true / false / null — null means the check could not RUN, which is neither present nor
   *  missing. Reporting an unreadable artifact as missing cries wolf; as present is the failure
   *  the panel exists to prevent. */
  present: boolean | null;
  landed_at: string | null; why: string; error: string | null;
}

export interface Readiness {
  signal_date: string; weekdays_since_month_end: number;
  checks: ReadinessCheck[]; n_missing: number; n_unknown: number;
  verdict: 'ready' | 'building' | 'at_risk' | 'late' | 'unknown';
  note: string;
}

export const fetchReadiness = (env: string) =>
  get<Readiness>(`/api/v1/trading/${env}/readiness`);

// Execution: two secrets, and neither is the real protection — the worker re-reads the database
// and refuses unless the book is approved and nothing is halted. The passcode is never returned
// by any endpoint, only posted.
export const executeRebalance = (
  env: string, id: number, by: string, phrase: string, passcode: string,
) => post<{ request_id: number }>(
  `/api/v1/trading/${env}/rebalances/${id}/execute`, { by, phrase, passcode });
