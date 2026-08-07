// The frozen report archive ([08-WKLY], [08-MRPT]).
//
// Design: `08_website_and_tooling/performance_reporting_plan.md`.
//
// The one thing to understand before touching this: `rendered_md` is SERVED, not rebuilt. The
// archive's whole purpose is that "this is what we said on Aug 14" stays true, so the text is
// displayed exactly as it was published and no component here may recompute a number from
// `payload` and show it as part of the report. The payload is offered alongside as the
// machine-readable form — and as the closed contract `[08-CMTY]` narrates — never in place of it.

const API_BASE = '/api-proxy';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export type ReportType = 'daily' | 'weekly' | 'monthly';

export const REPORT_TYPES: { key: ReportType; label: string; note: string }[] = [
  { key: 'daily', label: 'Daily', note: 'did anything break' },
  { key: 'weekly', label: 'Weekly', note: 'is the book where it should be' },
  { key: 'monthly', label: 'Monthly', note: 'what happened and why' },
];

export interface ReportIndexItem {
  report_type: ReportType;
  period_key: string;
  revision: number;
  period_start: string;
  period_end: string;
  book_asof: string | null;
  status: string;
  degradations: string[];
  n_degradations: number;
  built_at: string;
  delivered_at: string | null;
  has_commentary: boolean;
  n_revisions: number;
  /** More than one revision exists — the period was restated after first publication. */
  restated: boolean;
}

export interface ReportIndex {
  strategy: string;
  type: ReportType | null;
  n: number;
  items: ReportIndexItem[];
}

export interface ReportRevision {
  revision: number;
  built_at: string;
  status: string;
  book_asof: string | null;
}

export interface Report {
  report_type: ReportType;
  period_key: string;
  strategy: string;
  revision: number;
  period_start: string;
  period_end: string;
  book_asof: string | null;
  status: string;
  degradations: string[];
  /** The closed contract the commentary agent narrates. Displayed as data, never re-rendered
   *  into the report body. */
  payload: Record<string, unknown>;
  /** Frozen at publication. This is the report. */
  rendered_md: string;
  commentary: string | null;
  built_at: string;
  delivered_at: string | null;
  revisions: ReportRevision[];
  is_latest: boolean;
  /** Set when viewing a superseded revision — the reader must be told, or the archive becomes a
   *  way to quote a number we have since corrected. */
  superseded_by: number | null;
}

export const fetchReportIndex = (strategy: string, type?: ReportType) =>
  get<ReportIndex>(`/api/v1/report-archive/${encodeURIComponent(strategy)}`
    + (type ? `?type=${type}` : ''));

export const fetchReport = (strategy: string, type: ReportType, period: string, revision?: number) =>
  get<Report>(`/api/v1/report-archive/${encodeURIComponent(strategy)}/${type}/`
    + `${encodeURIComponent(period)}` + (revision != null ? `?revision=${revision}` : ''));

/** `warn` is the ordinary state, not an alarm: a report is published degraded and labelled rather
 *  than withheld, so most reports carry it. Only `fail` is red. */
export const statusColor = (s: string) =>
  s === 'fail' ? 'var(--neg)' : s === 'warn' ? 'var(--tx-mut)' : 'var(--pos)';
