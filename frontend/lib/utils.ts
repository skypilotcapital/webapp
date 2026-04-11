// Shared helpers: formatting and color-coding logic for the data monitor.

// Tables that update only at month-end — a 30+ day lag is normal for these.
const MONTH_END_TABLES = new Set(['scores', 'forward_returns']);

// ── Color helpers ────────────────────────────────────────────────────────────

/**
 * Tailwind text color class for a table's lag_days value.
 * Month-end tables are not color-coded (lag is expected to be 30+ days).
 */
export function lagColor(lagDays: number | null, tableName: string): string {
  if (lagDays === null) return 'text-gray-400';
  if (MONTH_END_TABLES.has(tableName)) return 'text-gray-600';
  if (lagDays <= 3)  return 'text-green-600';
  if (lagDays <= 7)  return 'text-amber-500';
  return 'text-red-600';
}

/**
 * Tailwind classes for a run log status badge.
 */
export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'complete': return 'bg-green-100 text-green-800';
    case 'running':  return 'bg-amber-100 text-amber-800';
    case 'error':    return 'bg-red-100 text-red-800';
    default:         return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Tailwind text color class for a factor coverage percentage.
 */
export function coverageColor(pct: number | null): string {
  if (pct === null) return 'text-gray-400';
  if (pct >= 95) return 'text-green-600';
  if (pct >= 90) return 'text-amber-500';
  return 'text-red-600';
}

// ── Formatters ───────────────────────────────────────────────────────────────

/** Format a large row count: 46200000 → "46.2M", 498 → "498" */
export function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

/** Format an ISO datetime string to a readable local time: "2026-04-10T23:00:00Z" → "Apr 10, 23:00 UTC" */
export function formatDatetime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

/** Duration between two ISO timestamps in a human-readable form: "2m 34s" */
export function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const secs = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

/** Seconds since a Date object: "42s ago" */
export function secondsAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
