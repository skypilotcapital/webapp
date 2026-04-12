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
        <div className="flex items-center justify-between pb-3 border-b border-black mb-4">
          <h2 className="text-lg font-bold text-black uppercase tracking-tight">Factor Coverage</h2>
          {updatedAt && (
            <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Updated {secondsAgo(updatedAt)}</span>
          )}
        </div>
        <p className="text-sm text-slate-600 mb-6">
          S&P 500 constituents with valid scores at latest month-end
        </p>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {error   && <p className="text-sm text-red-500">Failed to load</p>}
        {data && (
          <div className="flex items-end gap-6">
            <div>
              <span className={`text-4xl font-bold tabular-nums ${coverageColor(data.coverage_pct)}`}>
                {data.coverage_pct !== null ? `${data.coverage_pct}%` : '—'}
              </span>
            </div>
            <div className="text-sm text-gray-500 pb-1">
              <p>{data.covered_count} / {data.universe_count} stocks covered</p>
              <p>As of {data.as_of_date ?? '—'}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
