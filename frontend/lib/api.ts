// Typed fetch functions for all Panel 1 endpoints.
//
// In production (Vercel), requests go to /api-proxy/... which Next.js rewrites
// to the droplet via server-side proxy — avoids mixed content (HTTPS→HTTP) issues.
//
// In local dev, NEXT_PUBLIC_API_BASE defaults to empty string so requests go to
// /api-proxy/... and are proxied via next.config.ts rewrites to localhost:8000.

import type { TableStatus, RunLogEntry, TableGap, FactorCoverage } from '@/types/api';

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
