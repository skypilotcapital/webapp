// Typed fetch functions for all Panel 1 endpoints.
// NEXT_PUBLIC_API_URL is set in .env.local (local dev) or Vercel env vars (production).

import type { TableStatus, RunLogEntry, TableGap, FactorCoverage } from '@/types/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

export const fetchTableStatus  = () => apiFetch<TableStatus[]>('/api/v1/data-monitor/table-status');
export const fetchRunLog       = () => apiFetch<RunLogEntry[]>('/api/v1/data-monitor/run-log');
export const fetchGapDetection = () => apiFetch<TableGap[]>('/api/v1/data-monitor/gap-detection');
export const fetchFactorCoverage = () => apiFetch<FactorCoverage>('/api/v1/data-monitor/factor-coverage');
