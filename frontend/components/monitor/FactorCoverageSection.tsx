'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetchFactorCoverage } from '@/lib/api';
import { coverageColor, secondsAgo } from '@/lib/utils';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

export function FactorCoverageSection() {
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const { data, error, isLoading } = useSWR(
    'factor-coverage',
    fetchFactorCoverage,
    { refreshInterval: 300_000, onSuccess: () => setUpdatedAt(new Date()) }
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between pb-3 border-b border-black/5/[0.03] mb-4">
          <h2 className="text-lg font-semibold text-[#0F172A] tracking-tight">Factor Coverage</h2>
          {updatedAt && (
            <span className="text-xs text-xs text-[#0F172A]/80 uppercase tracking-widest tracking-[0.2em] font-black font-medium">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-300 mb-6">
          S&P 500 constituents with valid scores at latest month-end
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-slate-300">Loading…</p>}
        {error   && <p className="text-sm text-red-500">Failed to load</p>}
        {data && (
          <div className="flex items-end gap-6">
            <div>
              <span className={`text-6xl font-black uppercase tracking-widest tracking-tighter tabular-nums ${coverageColor(data.coverage_pct)}`}>
                {data.coverage_pct !== null ? `${data.coverage_pct}%` : '—'}
              </span>
            </div>
            <div className="text-sm text-slate-300 pb-1">
              <p>{data.covered_count} / {data.universe_count} stocks covered</p>
              <p>As of {data.as_of_date ?? '—'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
